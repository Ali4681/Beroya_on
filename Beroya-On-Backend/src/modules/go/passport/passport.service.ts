import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  GoLanguage,
  GoPassportRewardGrantStatus,
  GoPassportRewardType,
  GoPassportScoreEventType,
  GoRole,
  Prisma,
} from '@/generated/prisma/client';
import { Queue } from 'bullmq';
import type { AuthUser } from '../../../common/auth/auth-user';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PASSPORT_JOBS, QUEUES } from '../../../infra/queue/queue.constants';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { LockService } from '../../../infra/redis/lock.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { DiscountsService } from '../discounts/discounts.service';
import { decodePassportIcon, passportIconMime, passportIconUrl, PassportIconStorage } from './passport-icon.storage';

export type CustomerPassportStampItem = {
  name: string;
  name_en: string | null;
  image_url: string | null;
  earned_at: string;
  expires_at: string | null;
};

export type CustomerPassportStamps = {
  count: number;
  latest: CustomerPassportStampItem | null;
  items: CustomerPassportStampItem[];
};

function stampExpiresAt(
  earnedAt: Date,
  durationDays: number,
  durationHours: number,
): Date | null {
  const days = Math.max(0, durationDays | 0);
  const hours = Math.max(0, durationHours | 0);
  const totalHours = days * 24 + hours;
  if (totalHours <= 0) return null;
  return new Date(earnedAt.getTime() + totalHours * 60 * 60 * 1000);
}

function activeStampWhere(now = new Date()): Prisma.GoCustomerPassportStampWhereInput {
  return {
    OR: [{ expires_at: null }, { expires_at: { gt: now } }],
  };
}

export type CustomerPassportActiveReward = {
  label: string;
  percentage: number;
  discount_code_id: string;
  code: string;
  expires_at: string;
} | null;

@Injectable()
export class PassportService implements OnModuleInit {
  private readonly logger = new Logger(PassportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly locks: LockService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly icons: PassportIconStorage,
    private readonly discounts: DiscountsService,
    @InjectQueue(QUEUES.PASSPORT) private readonly passportQueue: Queue,
  ) {}

  async onModuleInit() {
    try {
      const config = await this.getConfig();
      await this.passportQueue.add(
        PASSPORT_JOBS.REVIEW_TICK,
        {},
        {
          jobId: 'passport-review-repeat',
          repeat: { every: Math.max(60_000, config.review_interval_minutes * 60_000) },
          removeOnComplete: true,
        },
      );
    } catch (err) {
      this.logger.warn(`Passport review scheduler skipped: ${(err as Error).message}`);
    }
  }

  async getConfig() {
    return this.prisma.goCustomerPassportConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });
  }

  async ensurePassport(customerId: string) {
    const existing = await this.prisma.goCustomerPassport.findUnique({
      where: { customer_id: customerId },
      include: { current_level: true },
    });
    if (existing) {
      await this.grantStampsUpTo(customerId, existing.current_level.level_order, existing.created_at);
      return existing;
    }

    const config = await this.getConfig();
    const level1 = await this.prisma.goCustomerPassportLevel.findFirst({
      where: { level_order: 1, is_active: true },
    });
    if (!level1) throw new GoException(GoErrorCode.INTERNAL_ERROR, 'Passport levels not seeded');

    const created = await this.prisma.goCustomerPassport.create({
      data: {
        customer_id: customerId,
        hidden_score: config.initial_score,
        current_level_id: level1.id,
        completed_rides: 0,
        current_streak: 0,
      },
      include: { current_level: true },
    });
    await this.grantStampsUpTo(customerId, level1.level_order, created.created_at);
    return created;
  }

  /**
   * A stamp = a passport level the customer has reached at least once (kept after demotion).
   * Idempotent: skips levels already stamped.
   */
  async grantStampsUpTo(customerId: string, maxLevelOrder: number, earnedAt: Date = new Date()) {
    const levels = await this.prisma.goCustomerPassportLevel.findMany({
      where: { is_active: true, level_order: { lte: maxLevelOrder } },
      select: { id: true, duration_days: true, duration_hours: true },
    });
    if (levels.length === 0) return;
    await this.prisma.goCustomerPassportStamp.createMany({
      data: levels.map((l) => ({
        customer_id: customerId,
        level_id: l.id,
        earned_at: earnedAt,
        expires_at: stampExpiresAt(earnedAt, l.duration_days, l.duration_hours),
      })),
      skipDuplicates: true,
    });
  }

  private mapStampItem(
    stamp: {
      earned_at: Date;
      expires_at: Date | null;
      level: {
        id: string;
        name_ar: string;
        name_en: string | null;
        stamp_name_ar: string | null;
        stamp_name_en: string | null;
        icon_storage_key: string | null;
      };
    },
    language: GoLanguage,
  ): CustomerPassportStampItem {
    const name =
      language === GoLanguage.EN
        ? (stamp.level.stamp_name_en ?? stamp.level.stamp_name_ar ?? stamp.level.name_en ?? stamp.level.name_ar)
        : (stamp.level.stamp_name_ar ?? stamp.level.name_ar);
    return {
      name,
      name_en: stamp.level.stamp_name_en ?? stamp.level.name_en ?? null,
      image_url: passportIconUrl('customer', stamp.level.id, stamp.level.icon_storage_key),
      earned_at: stamp.earned_at.toISOString(),
      expires_at: stamp.expires_at?.toISOString() ?? null,
    };
  }

  async stampsSummary(customerId: string, language: GoLanguage = GoLanguage.AR): Promise<CustomerPassportStamps> {
    const stamps = await this.prisma.goCustomerPassportStamp.findMany({
      where: { customer_id: customerId, ...activeStampWhere() },
      orderBy: [{ earned_at: 'asc' }, { level: { level_order: 'asc' } }],
      include: { level: true },
    });
    if (stamps.length === 0) return { count: 0, latest: null, items: [] };
    const items = stamps.map((s) => this.mapStampItem(s, language));
    return {
      count: items.length,
      latest: items[items.length - 1] ?? null,
      items,
    };
  }

  /**
   * Customer-facing passport payload (GET + `passport.updated`).
   * Ticket §23.9 — never expose hidden_score, points, thresholds, or the level ladder.
   */
  toCustomerView(
    level: {
      id: string;
      name_ar: string;
      name_en: string | null;
      stamp_name_ar: string | null;
      stamp_name_en?: string | null;
      level_order: number;
      icon_storage_key: string | null;
    },
    currentStreak: number,
    stamps: CustomerPassportStamps,
    activeReward: CustomerPassportActiveReward,
    language: GoLanguage = GoLanguage.AR,
  ) {
    const name =
      language === GoLanguage.EN ? (level.name_en ?? level.name_ar) : level.name_ar;
    return {
      level: {
        id: level.id,
        name,
        name_en: level.name_en,
        stamp_name_ar: level.stamp_name_ar,
        stamp_name_en: level.stamp_name_en ?? null,
        order: level.level_order,
        icon_url: passportIconUrl('customer', level.id, level.icon_storage_key),
      },
      current_streak: currentStreak,
      stamps,
      active_reward: activeReward,
    };
  }

  async getCustomerView(userId: string) {
    const customer = await this.prisma.goCustomerProfile.findUnique({ where: { user_id: userId } });
    if (!customer) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Customer profile not found');
    const passport = await this.ensurePassport(customer.id);
    const language = customer.preferred_language ?? GoLanguage.AR;
    const [stamps, activeReward] = await Promise.all([
      this.stampsSummary(customer.id, language),
      this.discounts.activePassportReward(customer.id),
    ]);
    return this.toCustomerView(passport.current_level, passport.current_streak, stamps, activeReward, language);
  }

  async applyEvent(input: {
    customerId: string;
    eventType: GoPassportScoreEventType;
    rideId?: string;
    rideCategoryId?: string | null;
    customerUserId?: string;
    metadata?: Record<string, unknown>;
    deltaOverride?: number;
  }) {
    return this.locks.withLock(`passport:${input.customerId}`, async () => {
      if (input.rideId) {
        const dup = await this.prisma.goPassportScoreLedger.findFirst({
          where: {
            customer_id: input.customerId,
            ride_id: input.rideId,
            event_type: input.eventType,
          },
        });
        if (dup) return { skipped: true as const, ledger: dup };
      }

      const passport = await this.ensurePassport(input.customerId);
      const config = await this.getConfig();
      const rule = await this.resolveRule(input.eventType, input.rideCategoryId);
      // Ticket §5.6 / §9.3 — seed rules preferred; hard defaults if rule missing.
      const defaultDelta =
        input.eventType === GoPassportScoreEventType.LATE_CANCELLATION
          ? -10
          : input.eventType === GoPassportScoreEventType.EN_ROUTE_CANCELLATION
            ? -25
            : input.eventType === GoPassportScoreEventType.NO_SHOW
              ? -15
              : 0;
      const delta = input.deltaOverride ?? rule?.score_delta ?? defaultDelta;

      let score = passport.hidden_score;
      let streak = passport.current_streak;
      let completed = passport.completed_rides;

      if (input.eventType === GoPassportScoreEventType.RIDE_COMPLETED) {
        completed += 1;
        streak += 1;
      }
      if (
        input.eventType === GoPassportScoreEventType.LATE_CANCELLATION ||
        input.eventType === GoPassportScoreEventType.EN_ROUTE_CANCELLATION ||
        input.eventType === GoPassportScoreEventType.NO_SHOW
      ) {
        streak = 0;
      }

      const scoreBefore = score;
      const scoreAfter = Math.min(config.maximum_score, Math.max(config.minimum_score, score + delta));

      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.goCustomerPassport.update({
          where: { id: passport.id },
          data: {
            hidden_score: scoreAfter,
            current_streak: streak,
            completed_rides: completed,
          },
        });
        const ledger = await tx.goPassportScoreLedger.create({
          data: {
            customer_id: input.customerId,
            event_type: input.eventType,
            ride_id: input.rideId,
            delta,
            score_before: scoreBefore,
            score_after: scoreAfter,
            metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        });
        return ledger;
      });

      if (input.eventType === GoPassportScoreEventType.RIDE_COMPLETED && streak > 0) {
        await this.maybeMilestone(input.customerId, streak, input.customerUserId);
      }

      if (input.customerUserId) {
        const view = await this.getCustomerView(input.customerUserId);
        this.realtime.emitToCustomer(input.customerUserId, 'passport.updated', view);
      }

      return { skipped: false as const, ledger: updated, score_after: scoreAfter, streak };
    });
  }

  private async resolveRule(eventType: GoPassportScoreEventType, rideCategoryId?: string | null) {
    if (rideCategoryId) {
      const specific = await this.prisma.goPassportScoreRule.findFirst({
        where: { event_type: eventType, ride_category_id: rideCategoryId, is_active: true },
      });
      if (specific) return specific;
    }
    return this.prisma.goPassportScoreRule.findFirst({
      where: { event_type: eventType, ride_category_id: null, is_active: true },
    });
  }

  private async maybeMilestone(customerId: string, streak: number, customerUserId?: string) {
    const streakCfg = await this.prisma.goPassportStreakConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });
    if (!streakCfg.is_active) return;

    const rewardCfg = await this.prisma.goPassportMilestoneRewardConfig.findFirst({
      where: { milestone_multiple: streak, is_active: true },
    });
    if (!rewardCfg) return;

    const existing = await this.prisma.goPassportRewardGrant.findFirst({
      where: { customer_id: customerId, streak_value: streak, status: { not: GoPassportRewardGrantStatus.REJECTED } },
    });
    if (existing) return;

    const grant = await this.prisma.goPassportRewardGrant.create({
      data: {
        customer_id: customerId,
        streak_value: streak,
        reward_type: rewardCfg.reward_type,
        status: rewardCfg.requires_admin_approval
          ? GoPassportRewardGrantStatus.PENDING
          : GoPassportRewardGrantStatus.APPROVED,
        approved_at: rewardCfg.requires_admin_approval ? null : new Date(),
      },
    });

    if (
      !rewardCfg.requires_admin_approval &&
      (rewardCfg.reward_type === GoPassportRewardType.SCORE ||
        rewardCfg.reward_type === GoPassportRewardType.SCORE_AND_DISCOUNT) &&
      rewardCfg.score_bonus
    ) {
      await this.applyEvent({
        customerId,
        eventType: GoPassportScoreEventType.STREAK_BONUS,
        customerUserId,
        metadata: { grant_id: grant.id, streak },
        deltaOverride: rewardCfg.score_bonus,
      });
    }

    if (
      !rewardCfg.requires_admin_approval &&
      (rewardCfg.reward_type === GoPassportRewardType.DISCOUNT_CODE ||
        rewardCfg.reward_type === GoPassportRewardType.SCORE_AND_DISCOUNT) &&
      rewardCfg.discount_percentage
    ) {
      await this.issueMilestoneDiscount(
        customerId,
        grant.id,
        Number(rewardCfg.discount_percentage),
        rewardCfg.discount_valid_hours,
        customerUserId,
      );
    }
  }

  private async issueMilestoneDiscount(
    customerId: string,
    grantId: string,
    percentage: number,
    validHours: number,
    customerUserId?: string,
    createdById?: string,
  ) {
    const customer = await this.prisma.goCustomerProfile.findUnique({ where: { id: customerId } });
    if (!customer) return;
    const admin =
      createdById ??
      (
        await this.prisma.user.findFirst({
          where: { role: { in: [GoRole.SUPER_ADMIN, GoRole.ADMIN] }, is_active: true },
        })
      )?.id;
    if (!admin) return;
    const code = `MS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const created = await this.prisma.goCustomerDiscountCode.create({
      data: {
        customer_id: customerId,
        code,
        name: 'Milestone reward',
        percentage,
        valid_from: new Date(),
        expires_at: new Date(Date.now() + Math.max(1, validHours) * 60 * 60 * 1000),
        usage_limit: 1,
        milestone_grant_id: grantId,
        created_by_id: admin,
      },
    });
    if (customerUserId) {
      this.realtime.emitToCustomer(customerUserId, 'discount_code.available', {
        discount_code_id: created.id,
        code: created.code,
        percentage,
      });
    }
  }

  async runPeriodicReview() {
    const levels = await this.prisma.goCustomerPassportLevel.findMany({
      where: { is_active: true },
      orderBy: { level_order: 'desc' },
    });
    if (levels.length === 0) return { reviewed: 0 };

    const passports = await this.prisma.goCustomerPassport.findMany({
      include: { customer: { select: { user_id: true } }, current_level: true },
    });
    let changed = 0;
    for (const p of passports) {
      const eligible = levels.find(
        (l) => p.hidden_score >= l.minimum_score && p.completed_rides >= l.minimum_completed_rides,
      );
      const target = eligible ?? levels[levels.length - 1];
      if (!target || target.id === p.current_level_id) continue;
      await this.prisma.goCustomerPassport.update({
        where: { id: p.id },
        data: { current_level_id: target.id },
      });
      await this.grantStampsUpTo(p.customer_id, target.level_order);
      changed += 1;
      const view = await this.getCustomerView(p.customer.user_id);
      this.realtime.emitToCustomer(p.customer.user_id, 'passport.updated', view);
    }
    this.logger.debug(`Passport review: ${changed} level changes`);
    return { reviewed: passports.length, changed };
  }

  // ---- Admin ----

  listLevels() {
    return this.prisma.goCustomerPassportLevel.findMany({ orderBy: { level_order: 'asc' } });
  }

  async getLevel(levelId: string) {
    const level = await this.prisma.goCustomerPassportLevel.findUnique({ where: { id: levelId } });
    if (!level) throw new GoException(GoErrorCode.NOT_FOUND, 'Passport level not found');
    return level;
  }

  private normalizeDuration(days?: number | null, hours?: number | null) {
    const duration_days = Math.max(0, Math.trunc(days ?? 0));
    const duration_hours = Math.max(0, Math.trunc(hours ?? 0));
    if (duration_days > 3650) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'duration_days must be between 0 and 3650');
    }
    if (duration_hours > 23) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'duration_hours must be between 0 and 23');
    }
    return { duration_days, duration_hours };
  }

  async createLevel(
    actor: AuthUser,
    body: {
      level_order: number;
      name_ar: string;
      name_en?: string;
      stamp_name_ar?: string | null;
      stamp_name_en?: string | null;
      minimum_score?: number;
      minimum_completed_rides?: number;
      duration_days?: number;
      duration_hours?: number;
      icon?: string;
      is_active?: boolean;
    },
  ) {
    const { icon, duration_days, duration_hours, ...rest } = body;
    if (icon) decodePassportIcon(icon);
    const duration = this.normalizeDuration(duration_days, duration_hours);
    const data = {
      level_order: rest.level_order,
      name_ar: rest.name_ar,
      name_en: rest.name_en,
      stamp_name_ar: rest.stamp_name_ar ?? null,
      stamp_name_en: rest.stamp_name_en ?? null,
      minimum_score: rest.minimum_score ?? 0,
      minimum_completed_rides: rest.minimum_completed_rides ?? 0,
      is_active: rest.is_active ?? true,
      ...duration,
    };
    let created;
    try {
      created = await this.prisma.goCustomerPassportLevel.create({ data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new GoException(GoErrorCode.CONFLICT, 'Level order already exists');
      }
      throw err;
    }
    const saved = icon
      ? await this.prisma.goCustomerPassportLevel.update({
          where: { id: created.id },
          data: { icon_storage_key: await this.writeIcon('customer', created.id, icon, null) },
        })
      : created;
    await this.audit.log({
      actor,
      action: AuditAction.PASSPORT_ADMIN_CHANGED,
      entity_type: 'GoCustomerPassportLevel',
      entity_id: created.id,
      metadata: { action: 'create', ...data, icon: icon ? true : undefined } as Prisma.InputJsonValue,
    });
    return saved;
  }

  async updateLevel(
    actor: AuthUser,
    levelId: string,
    body: {
      name_ar?: string;
      name_en?: string;
      stamp_name_ar?: string | null;
      stamp_name_en?: string | null;
      minimum_score?: number;
      minimum_completed_rides?: number;
      duration_days?: number;
      duration_hours?: number;
      icon_storage_key?: string;
      icon?: string;
      is_active?: boolean;
    },
  ) {
    if (body.is_active === false) {
      const activeCount = await this.prisma.goCustomerPassportLevel.count({ where: { is_active: true } });
      const current = await this.prisma.goCustomerPassportLevel.findUnique({ where: { id: levelId } });
      if (current?.is_active && activeCount <= 1) {
        throw new GoException(
          GoErrorCode.VALIDATION_ERROR,
          'At least one active passport level is required; cannot deactivate',
        );
      }
    }
    const current = await this.prisma.goCustomerPassportLevel.findUnique({ where: { id: levelId } });
    if (!current) throw new GoException(GoErrorCode.NOT_FOUND, 'Passport level not found');
    const { icon, duration_days, duration_hours, ...rest } = body;
    const data: Prisma.GoCustomerPassportLevelUpdateInput = { ...rest };
    if (duration_days !== undefined || duration_hours !== undefined) {
      Object.assign(
        data,
        this.normalizeDuration(
          duration_days ?? current.duration_days,
          duration_hours ?? current.duration_hours,
        ),
      );
    }
    if (icon) data.icon_storage_key = await this.writeIcon('customer', levelId, icon, current.icon_storage_key);
    const updated = await this.prisma.goCustomerPassportLevel.update({ where: { id: levelId }, data });
    await this.audit.log({
      actor,
      action: AuditAction.PASSPORT_ADMIN_CHANGED,
      entity_type: 'GoCustomerPassportLevel',
      entity_id: levelId,
      metadata: { ...data, icon: icon ? true : undefined } as Prisma.InputJsonValue,
    });
    return updated;
  }

  async readLevelIcon(levelId: string) {
    const level = await this.prisma.goCustomerPassportLevel.findUnique({ where: { id: levelId } });
    if (!level?.icon_storage_key) throw new GoException(GoErrorCode.NOT_FOUND, 'Icon not found');
    const data = await this.icons.read(level.icon_storage_key);
    if (!data) throw new GoException(GoErrorCode.NOT_FOUND, 'Icon not found');
    return { data, mime: passportIconMime(level.icon_storage_key) };
  }

  private async writeIcon(kind: 'customer' | 'driver', levelId: string, raw: string, previous: string | null) {
    const decoded = decodePassportIcon(raw);
    const key = await this.icons.save(kind, levelId, decoded.data, decoded.image);
    if (previous && previous !== key) await this.icons.remove(previous);
    return key;
  }

  async updateConfig(
    actor: AuthUser,
    body: {
      initial_score?: number;
      minimum_score?: number;
      maximum_score?: number;
      review_interval_minutes?: number;
    },
  ) {
    const updated = await this.prisma.goCustomerPassportConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...body },
      update: body,
    });
    await this.audit.log({
      actor,
      action: AuditAction.PASSPORT_ADMIN_CHANGED,
      entity_type: 'GoCustomerPassportConfig',
      entity_id: 'default',
      metadata: body as Prisma.InputJsonValue,
    });
    if (body.review_interval_minutes != null) {
      try {
        await this.passportQueue.add(
          PASSPORT_JOBS.REVIEW_TICK,
          {},
          {
            jobId: 'passport-review-repeat',
            repeat: { every: Math.max(60_000, updated.review_interval_minutes * 60_000) },
            removeOnComplete: true,
          },
        );
      } catch (err) {
        this.logger.warn(`Passport review reschedule skipped: ${(err as Error).message}`);
      }
    }
    return updated;
  }

  listScoreRules() {
    return this.prisma.goPassportScoreRule.findMany({ orderBy: { event_type: 'asc' } });
  }

  async getScoreRule(ruleId: string) {
    const rule = await this.prisma.goPassportScoreRule.findUnique({ where: { id: ruleId } });
    if (!rule) throw new GoException(GoErrorCode.NOT_FOUND, 'Score rule not found');
    return rule;
  }

  async updateScoreRule(actor: AuthUser, ruleId: string, body: { score_delta?: number; is_active?: boolean }) {
    const updated = await this.prisma.goPassportScoreRule.update({ where: { id: ruleId }, data: body });
    await this.audit.log({
      actor,
      action: AuditAction.PASSPORT_ADMIN_CHANGED,
      entity_type: 'GoPassportScoreRule',
      entity_id: ruleId,
      metadata: body as Prisma.InputJsonValue,
    });
    return updated;
  }

  getStreakConfig() {
    return this.prisma.goPassportStreakConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });
  }

  async updateStreakConfig(actor: AuthUser, body: { milestone_every_rides?: number; is_active?: boolean }) {
    const updated = await this.prisma.goPassportStreakConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...body },
      update: body,
    });
    await this.audit.log({
      actor,
      action: AuditAction.PASSPORT_ADMIN_CHANGED,
      entity_type: 'GoPassportStreakConfig',
      entity_id: 'default',
      metadata: body as Prisma.InputJsonValue,
    });
    return updated;
  }

  listRewardGrants(status?: GoPassportRewardGrantStatus) {
    return this.prisma.goPassportRewardGrant.findMany({
      where: { status },
      orderBy: { created_at: 'desc' },
      include: { customer: { select: { id: true, user: { select: { full_name: true, phone: true } } } } },
      take: 100,
    });
  }

  async getRewardGrant(grantId: string) {
    const grant = await this.prisma.goPassportRewardGrant.findUnique({
      where: { id: grantId },
      include: { customer: { select: { id: true, user: { select: { full_name: true, phone: true } } } } },
    });
    if (!grant) throw new GoException(GoErrorCode.NOT_FOUND, 'Grant not found');
    return grant;
  }

  async approveGrant(actor: AuthUser, grantId: string) {
    const grant = await this.prisma.goPassportRewardGrant.findUnique({ where: { id: grantId } });
    if (!grant) throw new GoException(GoErrorCode.NOT_FOUND, 'Grant not found');
    if (grant.status !== GoPassportRewardGrantStatus.PENDING) {
      throw new GoException(GoErrorCode.CONFLICT, 'Grant not pending');
    }
    const rewardCfg = await this.prisma.goPassportMilestoneRewardConfig.findUnique({
      where: { milestone_multiple: grant.streak_value },
    });
    await this.prisma.goPassportRewardGrant.update({
      where: { id: grantId },
      data: {
        status: GoPassportRewardGrantStatus.APPROVED,
        approved_by_id: actor.id,
        approved_at: new Date(),
      },
    });
    const customer = await this.prisma.goCustomerProfile.findUnique({ where: { id: grant.customer_id } });
    if (
      rewardCfg &&
      (rewardCfg.reward_type === GoPassportRewardType.SCORE ||
        rewardCfg.reward_type === GoPassportRewardType.SCORE_AND_DISCOUNT) &&
      rewardCfg.score_bonus
    ) {
      await this.applyEvent({
        customerId: grant.customer_id,
        eventType: GoPassportScoreEventType.STREAK_BONUS,
        customerUserId: customer?.user_id,
        metadata: { grant_id: grantId },
        deltaOverride: rewardCfg.score_bonus,
      });
    }
    if (
      rewardCfg &&
      (rewardCfg.reward_type === GoPassportRewardType.DISCOUNT_CODE ||
        rewardCfg.reward_type === GoPassportRewardType.SCORE_AND_DISCOUNT) &&
      rewardCfg.discount_percentage
    ) {
      await this.issueMilestoneDiscount(
        grant.customer_id,
        grantId,
        Number(rewardCfg.discount_percentage),
        rewardCfg.discount_valid_hours,
        customer?.user_id,
        actor.id,
      );
    }
    return this.prisma.goPassportRewardGrant.findUnique({ where: { id: grantId } });
  }

  listMilestoneRewards() {
    return this.prisma.goPassportMilestoneRewardConfig.findMany({ orderBy: { milestone_multiple: 'asc' } });
  }

  async getMilestoneReward(id: string) {
    const reward = await this.prisma.goPassportMilestoneRewardConfig.findUnique({ where: { id } });
    if (!reward) throw new GoException(GoErrorCode.NOT_FOUND, 'Milestone reward not found');
    return reward;
  }

  private checkMilestoneReward(reward: {
    reward_type: GoPassportRewardType;
    score_bonus: number | null;
    discount_percentage: number | null;
  }) {
    const score =
      reward.reward_type === GoPassportRewardType.SCORE ||
      reward.reward_type === GoPassportRewardType.SCORE_AND_DISCOUNT;
    const discount =
      reward.reward_type === GoPassportRewardType.DISCOUNT_CODE ||
      reward.reward_type === GoPassportRewardType.SCORE_AND_DISCOUNT;
    if (score && !(reward.score_bonus != null && reward.score_bonus > 0)) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'score_bonus must be greater than 0 for this reward type');
    }
    if (discount && !(reward.discount_percentage != null && reward.discount_percentage > 0 && reward.discount_percentage <= 100)) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'discount_percentage must be between 0 and 100 for this reward type');
    }
  }

  private async ensureMilestoneFree(multiple: number, exceptId?: string) {
    const taken = await this.prisma.goPassportMilestoneRewardConfig.findUnique({
      where: { milestone_multiple: multiple },
    });
    if (taken && taken.id !== exceptId) {
      throw new GoException(GoErrorCode.CONFLICT, 'A reward for this ride count already exists');
    }
  }

  async createMilestoneReward(
    actor: AuthUser,
    body: {
      milestone_multiple: number;
      reward_type: GoPassportRewardType;
      score_bonus?: number | null;
      discount_percentage?: number | null;
      discount_valid_hours?: number;
      requires_admin_approval?: boolean;
      is_active?: boolean;
    },
  ) {
    const reward = {
      reward_type: body.reward_type,
      score_bonus: body.score_bonus ?? null,
      discount_percentage: body.discount_percentage ?? null,
    };
    this.checkMilestoneReward(reward);
    await this.ensureMilestoneFree(body.milestone_multiple);
    const created = await this.prisma.goPassportMilestoneRewardConfig.create({
      data: {
        milestone_multiple: body.milestone_multiple,
        ...reward,
        discount_valid_hours: body.discount_valid_hours,
        requires_admin_approval: body.requires_admin_approval ?? true,
        is_active: body.is_active ?? true,
      },
    });
    await this.audit.log({
      actor,
      action: AuditAction.PASSPORT_ADMIN_CHANGED,
      entity_type: 'GoPassportMilestoneRewardConfig',
      entity_id: created.id,
      metadata: { op: 'create', ...body } as Prisma.InputJsonValue,
    });
    return created;
  }

  async updateMilestoneReward(
    actor: AuthUser,
    id: string,
    body: {
      milestone_multiple?: number;
      reward_type?: GoPassportRewardType;
      score_bonus?: number | null;
      discount_percentage?: number | null;
      discount_valid_hours?: number;
      requires_admin_approval?: boolean;
      is_active?: boolean;
    },
  ) {
    const current = await this.getMilestoneReward(id);
    this.checkMilestoneReward({
      reward_type: body.reward_type ?? current.reward_type,
      score_bonus: body.score_bonus !== undefined ? body.score_bonus : current.score_bonus,
      discount_percentage:
        body.discount_percentage !== undefined
          ? body.discount_percentage
          : current.discount_percentage == null
            ? null
            : Number(current.discount_percentage),
    });
    if (body.milestone_multiple !== undefined && body.milestone_multiple !== current.milestone_multiple) {
      await this.ensureMilestoneFree(body.milestone_multiple, id);
    }
    const updated = await this.prisma.goPassportMilestoneRewardConfig.update({
      where: { id },
      data: {
        milestone_multiple: body.milestone_multiple,
        reward_type: body.reward_type,
        score_bonus: body.score_bonus === null ? null : body.score_bonus,
        discount_percentage: body.discount_percentage === null ? null : body.discount_percentage,
        discount_valid_hours: body.discount_valid_hours,
        requires_admin_approval: body.requires_admin_approval,
        is_active: body.is_active,
      },
    });
    await this.audit.log({
      actor,
      action: AuditAction.PASSPORT_ADMIN_CHANGED,
      entity_type: 'GoPassportMilestoneRewardConfig',
      entity_id: id,
      metadata: body as Prisma.InputJsonValue,
    });
    return updated;
  }

  async deleteMilestoneReward(actor: AuthUser, id: string) {
    const current = await this.getMilestoneReward(id);
    await this.prisma.goPassportMilestoneRewardConfig.delete({ where: { id } });
    await this.audit.log({
      actor,
      action: AuditAction.PASSPORT_ADMIN_CHANGED,
      entity_type: 'GoPassportMilestoneRewardConfig',
      entity_id: id,
      metadata: {
        op: 'delete',
        milestone_multiple: current.milestone_multiple,
        reward_type: current.reward_type,
        score_bonus: current.score_bonus,
        discount_percentage: current.discount_percentage == null ? null : Number(current.discount_percentage),
      } as Prisma.InputJsonValue,
    });
    return { id, deleted: true };
  }

  async rejectGrant(actor: AuthUser, grantId: string) {
    const grant = await this.prisma.goPassportRewardGrant.findUnique({ where: { id: grantId } });
    if (!grant) throw new GoException(GoErrorCode.NOT_FOUND, 'Grant not found');
    if (grant.status !== GoPassportRewardGrantStatus.PENDING) {
      throw new GoException(GoErrorCode.CONFLICT, 'Grant not pending');
    }
    return this.prisma.goPassportRewardGrant.update({
      where: { id: grantId },
      data: {
        status: GoPassportRewardGrantStatus.REJECTED,
        approved_by_id: actor.id,
        approved_at: new Date(),
      },
    });
  }

  /**
   * Desk: manually add a passport-level stamp to a customer.
   * Does not change current_level — stamps are kept independently (incl. after demotion).
   */
  async grantStampToCustomer(actor: AuthUser, customerId: string, levelId: string) {
    const customer = await this.prisma.goCustomerProfile.findUnique({
      where: { id: customerId },
      select: { id: true, user_id: true },
    });
    if (!customer) throw new GoException(GoErrorCode.NOT_FOUND, 'Customer not found');

    const level = await this.prisma.goCustomerPassportLevel.findUnique({ where: { id: levelId } });
    if (!level || !level.is_active) {
      throw new GoException(GoErrorCode.NOT_FOUND, 'Passport level not found');
    }

    await this.ensurePassport(customerId);

    const existing = await this.prisma.goCustomerPassportStamp.findUnique({
      where: { customer_id_level_id: { customer_id: customerId, level_id: levelId } },
    });
    if (existing) {
      const stillActive = !existing.expires_at || existing.expires_at > new Date();
      if (stillActive) {
        throw new GoException(GoErrorCode.CONFLICT, 'Customer already has this stamp');
      }
      // Expired: renew with a fresh window from the level duration.
      const earnedAt = new Date();
      const renewed = await this.prisma.goCustomerPassportStamp.update({
        where: { id: existing.id },
        data: {
          earned_at: earnedAt,
          expires_at: stampExpiresAt(earnedAt, level.duration_days, level.duration_hours),
        },
        include: {
          level: {
            select: {
              id: true,
              level_order: true,
              name_ar: true,
              name_en: true,
              stamp_name_ar: true,
              stamp_name_en: true,
              icon_storage_key: true,
            },
          },
        },
      });
      await this.audit.log({
        actor,
        action: AuditAction.PASSPORT_ADMIN_CHANGED,
        entity_type: 'GoCustomerPassportStamp',
        entity_id: renewed.id,
        metadata: {
          customer_id: customerId,
          level_id: levelId,
          level_order: level.level_order,
          renewed: true,
        },
      });
      const renewedView = await this.getCustomerView(customer.user_id);
      this.realtime.emitToCustomer(customer.user_id, 'passport.updated', renewedView);
      return renewed;
    }

    const earnedAt = new Date();
    const stamp = await this.prisma.goCustomerPassportStamp.create({
      data: {
        customer_id: customerId,
        level_id: levelId,
        earned_at: earnedAt,
        expires_at: stampExpiresAt(earnedAt, level.duration_days, level.duration_hours),
      },
      include: {
        level: {
          select: {
            id: true,
            level_order: true,
            name_ar: true,
            name_en: true,
            stamp_name_ar: true,
            stamp_name_en: true,
            icon_storage_key: true,
          },
        },
      },
    });

    await this.audit.log({
      actor,
      action: AuditAction.PASSPORT_ADMIN_CHANGED,
      entity_type: 'GoCustomerPassportStamp',
      entity_id: stamp.id,
      metadata: {
        customer_id: customerId,
        level_id: levelId,
        level_order: level.level_order,
      },
    });

    const view = await this.getCustomerView(customer.user_id);
    this.realtime.emitToCustomer(customer.user_id, 'passport.updated', view);

    return stamp;
  }
}
