import { Injectable } from '@nestjs/common';
import { GoDriverPassportScoreEventType, Prisma } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { LockService } from '../../../infra/redis/lock.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { RideDefaults } from '../rides/ride-rules';
import { decodePassportIcon, passportIconMime, passportIconUrl, PassportIconStorage } from '../passport/passport-icon.storage';

/**
 * Driver Passport (Ticket §27 / Phase 10) — levels + cancel/complete score events.
 */
@Injectable()
export class DriverPassportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly icons: PassportIconStorage,
    private readonly locks: LockService,
    private readonly realtime: RealtimeService,
  ) {}

  async ensurePassport(
    driverId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const existing = await tx.goDriverPassport.findUnique({
      where: { driver_id: driverId },
      include: { current_level: true },
    });
    if (existing) return existing;

    const level1 = await tx.goDriverPassportLevel.findFirst({
      where: { level_order: 1, is_active: true },
    });

    return tx.goDriverPassport.create({
      data: {
        driver_id: driverId,
        hidden_score: 0,
        current_level_id: level1?.id ?? null,
        completed_rides: 0,
      },
      include: { current_level: true },
    });
  }

  /** Driver-facing view — no hidden score exposed. */
  async getDriverView(userId: string) {
    const driver = await this.prisma.goDriverProfile.findUnique({ where: { user_id: userId } });
    if (!driver) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Driver profile not found');
    const passport = await this.ensurePassport(driver.id);
    return {
      level: passport.current_level
        ? {
            name: passport.current_level.name_ar,
            name_en: passport.current_level.name_en,
            icon_url: passportIconUrl('driver', passport.current_level.id, passport.current_level.icon_storage_key),
            order: passport.current_level.level_order,
          }
        : null,
      completed_rides: passport.completed_rides,
      framework_only: false,
    };
  }

  async applyEvent(input: {
    driverId: string;
    eventType: GoDriverPassportScoreEventType;
    rideId?: string;
    driverUserId?: string;
    metadata?: Record<string, unknown>;
    deltaOverride?: number;
  }) {
    return this.locks.withLock(`driver-passport:${input.driverId}`, async () => {
      if (input.rideId) {
        const dup = await this.prisma.goDriverPassportScoreLedger.findFirst({
          where: {
            driver_id: input.driverId,
            ride_id: input.rideId,
            event_type: input.eventType,
          },
        });
        if (dup) return { skipped: true as const, ledger: dup };
      }

      const passport = await this.ensurePassport(input.driverId);
      const rule = await this.prisma.goDriverPassportScoreRule.findUnique({
        where: { event_type: input.eventType },
      });
      const defaultDelta =
        input.eventType === GoDriverPassportScoreEventType.DRIVER_CANCELLED_RIDE
          ? -RideDefaults.DRIVER_CANCEL_HIDDEN_SCORE
          : input.eventType === GoDriverPassportScoreEventType.RIDE_COMPLETED
            ? 5
            : 0;
      const delta = input.deltaOverride ?? (rule?.is_active ? rule.score_delta : undefined) ?? defaultDelta;

      let completed = passport.completed_rides;
      if (input.eventType === GoDriverPassportScoreEventType.RIDE_COMPLETED) {
        completed += 1;
      }

      const scoreBefore = passport.hidden_score;
      const scoreAfter = scoreBefore + delta;

      const ledger = await this.prisma.$transaction(async (tx) => {
        await tx.goDriverPassport.update({
          where: { id: passport.id },
          data: { hidden_score: scoreAfter, completed_rides: completed },
        });
        return tx.goDriverPassportScoreLedger.create({
          data: {
            driver_id: input.driverId,
            passport_id: passport.id,
            event_type: input.eventType,
            ride_id: input.rideId,
            delta,
            score_before: scoreBefore,
            score_after: scoreAfter,
            metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        });
      });

      if (input.driverUserId) {
        const view = await this.getDriverView(input.driverUserId);
        this.realtime.emitToDriver(input.driverUserId, 'driver_passport.updated', view);
      }

      return { skipped: false as const, ledger, delta, score_after: scoreAfter };
    });
  }

  listLevels() {
    return this.prisma.goDriverPassportLevel.findMany({ orderBy: { level_order: 'asc' } });
  }

  async getLevel(levelId: string) {
    const level = await this.prisma.goDriverPassportLevel.findUnique({ where: { id: levelId } });
    if (!level) throw new GoException(GoErrorCode.NOT_FOUND, 'Driver passport level not found');
    return level;
  }

  async updateLevel(
    actor: AuthUser,
    levelId: string,
    body: {
      name_ar?: string;
      name_en?: string;
      icon_storage_key?: string;
      icon?: string;
      minimum_score?: number | null;
      is_active?: boolean;
    },
  ) {
    const current = await this.prisma.goDriverPassportLevel.findUnique({ where: { id: levelId } });
    if (!current) throw new GoException(GoErrorCode.NOT_FOUND, 'Driver passport level not found');
    const { icon, ...data } = body;
    if (icon) data.icon_storage_key = await this.writeIcon(levelId, icon, current.icon_storage_key);
    const updated = await this.prisma.goDriverPassportLevel.update({
      where: { id: levelId },
      data,
    });
    await this.audit.log({
      actor,
      action: AuditAction.PASSPORT_ADMIN_CHANGED,
      entity_type: 'GoDriverPassportLevel',
      entity_id: levelId,
      metadata: { ...data, icon: icon ? true : undefined } as Prisma.InputJsonValue,
    });
    return updated;
  }

  async createLevel(
    actor: AuthUser,
    body: {
      level_order: number;
      name_ar: string;
      name_en?: string;
      icon?: string;
      minimum_score?: number;
      is_active?: boolean;
    },
  ) {
    const { icon, ...data } = body;
    if (icon) decodePassportIcon(icon);
    const created = await this.prisma.goDriverPassportLevel.create({ data });
    const saved = icon
      ? await this.prisma.goDriverPassportLevel.update({
          where: { id: created.id },
          data: { icon_storage_key: await this.writeIcon(created.id, icon, null) },
        })
      : created;
    await this.audit.log({
      actor,
      action: AuditAction.PASSPORT_ADMIN_CHANGED,
      entity_type: 'GoDriverPassportLevel',
      entity_id: created.id,
      metadata: { action: 'create', ...data, icon: icon ? true : undefined } as Prisma.InputJsonValue,
    });
    return saved;
  }

  async readLevelIcon(levelId: string) {
    const level = await this.prisma.goDriverPassportLevel.findUnique({ where: { id: levelId } });
    if (!level?.icon_storage_key) throw new GoException(GoErrorCode.NOT_FOUND, 'Icon not found');
    const data = await this.icons.read(level.icon_storage_key);
    if (!data) throw new GoException(GoErrorCode.NOT_FOUND, 'Icon not found');
    return { data, mime: passportIconMime(level.icon_storage_key) };
  }

  private async writeIcon(levelId: string, raw: string, previous: string | null) {
    const decoded = decodePassportIcon(raw);
    const key = await this.icons.save('driver', levelId, decoded.data, decoded.image);
    if (previous && previous !== key) await this.icons.remove(previous);
    return key;
  }

  listPassports() {
    return this.prisma.goDriverPassport.findMany({
      orderBy: { updated_at: 'desc' },
      include: {
        current_level: { select: { id: true, name_ar: true, name_en: true, level_order: true } },
        driver: {
          select: {
            id: true,
            user: { select: { full_name: true, phone: true } },
            branch: { select: { id: true, name_ar: true } },
          },
        },
      },
      take: 200,
    });
  }

  async recordCompletedRide(
    driverId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    await this.ensurePassport(driverId, tx);
    return tx.goDriverPassport.update({
      where: { driver_id: driverId },
      data: { completed_rides: { increment: 1 } },
    });
  }
}
