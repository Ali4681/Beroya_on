import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  GoIncentiveKind,
  GoRideOfferStatus,
  GoRideStatus,
  Prisma,
  type GoDriverIncentiveGrant,
} from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { LockService } from '../../../infra/redis/lock.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { decimalToNumber } from '../pricing/fare.calculator';
import { WalletService } from '../wallets/wallet.service';
import { haversineM } from '../dispatch/h3.util';
import { combineRideBonus, rideBonusPayouts, serviceAreaCentroid, withinDailyCap } from './incentive-math';
import { dayKey, dayRange, inWindow, isHhMm } from './time.util';

export const INCENTIVE_LABELS: Record<GoIncentiveKind, string> = {
  STREAK_DAILY: 'مكافأة الرحلات المتتالية',
  GOAL_CAMPAIGN: 'مكافأة حملة الهدف',
  RIDE_REJECTION: 'مكافأة طلب رفضه سائقون آخرون',
  RIDE_DISTANCE: 'مكافأة طلب بعيد عن المركز',
  MANUAL: 'مكافأة يدوية من لوحة التحكم',
};

export interface GrantInput {
  driverId: string;
  kind: GoIncentiveKind;
  periodKey: string;
  amount: Prisma.Decimal | number;
  rideId?: string | null;
  campaignId?: string | null;
  /** Shown in the push and the wallet reason. Defaults to the kind's label. */
  label?: string;
  metadata?: Record<string, unknown>;
  /** Push event sent after a successful grant. */
  event?: 'incentive.awarded' | 'incentive.goal_achieved';
  /** Staff one-offs ignore the company daily total cap. */
  ignoreDailyCap?: boolean;
}

export type GrantOutcome =
  | { status: 'GRANTED'; grant: GoDriverIncentiveGrant }
  | { status: 'DUPLICATE' }
  | { status: 'CAP_REACHED' }
  | { status: 'SKIPPED' };

export type IncentiveConfigPatch = Omit<
  Prisma.GoIncentiveConfigUncheckedUpdateInput,
  'id' | 'updated_at'
>;

const TIME_FIELDS = ['night_start', 'night_end', 'daily_close_time'] as const;

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

@Injectable()
export class IncentivesService {
  private readonly logger = new Logger(IncentivesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly locks: LockService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly wallets: WalletService,
  ) {}

  getConfig() {
    return this.prisma.goIncentiveConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });
  }

  async updateConfig(actor: AuthUser, patch: IncentiveConfigPatch) {
    const values = patch as Record<string, unknown>;
    if (typeof values.timezone === 'string') {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: values.timezone });
      } catch {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'timezone is not a valid IANA zone');
      }
    }
    for (const field of TIME_FIELDS) {
      const value = values[field];
      if (value != null && (typeof value !== 'string' || !isHhMm(value))) {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, `${field} must be HH:mm`);
      }
    }
    const current = await this.getConfig();
    const keep = Number(values.band_keep ?? current.band_keep);
    const watch = Number(values.band_watch ?? current.band_watch);
    if (watch >= keep) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'band_watch must be lower than band_keep');
    }
    const weightKeys = ['weight_rating', 'weight_acceptance', 'weight_hours', 'weight_earnings'] as const;
    if (weightKeys.every((k) => Number(values[k] ?? current[k]) <= 0)) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'At least one score weight must be above zero');
    }
    const updated = await this.prisma.goIncentiveConfig.update({ where: { id: 'default' }, data: patch });
    await this.audit.log({
      actor,
      action: AuditAction.INCENTIVE_CONFIG_CHANGED,
      entity_type: 'GoIncentiveConfig',
      entity_id: 'default',
      metadata: patch as Prisma.InputJsonValue,
    });
    return updated;
  }

  /**
   * Pays a company-funded bonus into the driver wallet exactly once per (driver, kind, period_key).
   * Skips when the daily total cap would be exceeded.
   */
  async grantBonus(input: GrantInput): Promise<GrantOutcome> {
    const amount = new Prisma.Decimal(input.amount).toDecimalPlaces(2);
    if (amount.lte(0)) return { status: 'SKIPPED' };
    const driver = await this.prisma.goDriverProfile.findUnique({
      where: { id: input.driverId },
      select: { id: true, user_id: true, branch_id: true },
    });
    if (!driver) return { status: 'SKIPPED' };
    const config = await this.getConfig();
    const label = input.label ?? INCENTIVE_LABELS[input.kind];

    const pay = () =>
      this.locks.withLock(
        `wallet:${driver.id}`,
        async (): Promise<GrantOutcome> => {
          const key = { driver_id: driver.id, kind: input.kind, period_key: input.periodKey };
          if (await this.prisma.goDriverIncentiveGrant.findUnique({ where: { driver_id_kind_period_key: key } })) {
            return { status: 'DUPLICATE' };
          }
          if (!input.ignoreDailyCap && config.daily_total_cap != null) {
            const paid = await this.paidOn(dayKey(new Date(), config.timezone), config.timezone);
            if (!withinDailyCap(paid, amount, config.daily_total_cap)) {
              await this.audit.log({
                action: AuditAction.INCENTIVE_DAILY_CAP_REACHED,
                entity_type: 'GoDriverProfile',
                entity_id: driver.id,
                branch_id: driver.branch_id,
                metadata: {
                  kind: input.kind,
                  period_key: input.periodKey,
                  amount: decimalToNumber(amount),
                  paid_today: decimalToNumber(paid),
                  cap: decimalToNumber(config.daily_total_cap),
                },
              });
              return { status: 'CAP_REACHED' };
            }
          }
          try {
            const grant = await this.prisma.$transaction(async (tx) => {
              const walletTx = await this.wallets.creditIncentive(tx, {
                driverId: driver.id,
                amount,
                rideId: input.rideId,
                reason: `incentive:${input.kind}; ${label}`,
              });
              return tx.goDriverIncentiveGrant.create({
                data: {
                  ...key,
                  amount,
                  ride_id: input.rideId ?? null,
                  campaign_id: input.campaignId ?? null,
                  wallet_transaction_id: walletTx.id,
                  metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
                },
              });
            });
            return { status: 'GRANTED', grant };
          } catch (err) {
            if (isUniqueViolation(err)) return { status: 'DUPLICATE' };
            throw err;
          }
        },
        { waitMs: 5_000 },
      );

    const outcome =
      !input.ignoreDailyCap && config.daily_total_cap != null
        ? await this.locks.withLock('incentive:daily-cap', pay, { waitMs: 10_000, ttlMs: 20_000 })
        : await pay();

    if (outcome.status === 'GRANTED') {
      await this.wallets.emitWalletState(driver.id, driver.user_id);
      this.realtime.emitToDriver(driver.user_id, input.event ?? 'incentive.awarded', {
        grant_id: outcome.grant.id,
        kind: input.kind,
        amount: decimalToNumber(amount),
        label,
        ride_id: input.rideId ?? null,
        campaign_id: input.campaignId ?? null,
      });
      this.logger.log(`Granted ${input.kind} ${amount.toFixed(2)} to driver ${driver.id} (${input.periodKey})`);
    }
    return outcome;
  }

  /**
   * Desk: pay a one-off company bonus to a specific driver (shows under المكافآت المصروفة).
   * Each call uses a unique period_key so the same driver can receive many manual grants.
   */
  async grantManualBonus(
    actor: AuthUser,
    input: { driver_id: string; amount: number; note?: string },
  ) {
    const amount = new Prisma.Decimal(input.amount).toDecimalPlaces(2);
    if (amount.lte(0)) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'amount must be greater than zero', {
        errors: [{ field: 'amount', messages: ['amount must be greater than zero'] }],
      });
    }
    const driver = await this.prisma.goDriverProfile.findUnique({
      where: { id: input.driver_id },
      select: { id: true, branch_id: true, user: { select: { full_name: true, phone: true } } },
    });
    if (!driver) throw new GoException(GoErrorCode.NOT_FOUND, 'Driver not found');

    const note = input.note?.trim() || undefined;
    const periodKey = `manual:${randomUUID()}`;
    const label = note ? `${INCENTIVE_LABELS.MANUAL}: ${note}` : INCENTIVE_LABELS.MANUAL;
    const outcome = await this.grantBonus({
      driverId: driver.id,
      kind: GoIncentiveKind.MANUAL,
      periodKey,
      amount,
      label,
      ignoreDailyCap: true,
      metadata: {
        via: 'staff_manual',
        actor_id: actor.id,
        note: note ?? null,
      },
    });
    if (outcome.status !== 'GRANTED') {
      throw new GoException(GoErrorCode.CONFLICT, `Manual incentive was not granted (${outcome.status})`);
    }
    await this.audit.log({
      actor,
      action: AuditAction.INCENTIVE_MANUAL_GRANT,
      entity_type: 'GoDriverIncentiveGrant',
      entity_id: outcome.grant.id,
      branch_id: driver.branch_id,
      metadata: {
        driver_id: driver.id,
        amount: decimalToNumber(amount),
        note: note ?? null,
        period_key: periodKey,
      },
    });
    return {
      id: outcome.grant.id,
      driver_id: driver.id,
      kind: GoIncentiveKind.MANUAL,
      amount: decimalToNumber(amount),
      period_key: periodKey,
      note: note ?? null,
      label,
      created_at: outcome.grant.created_at.toISOString(),
    };
  }

  /**
   * Night surcharge (percent) for a ride of `categoryId` requested — or scheduled — at `at`.
   * Null when night fare is off, outside the window, or the category is excluded.
   */
  async nightFarePct(categoryId: string, at: Date) {
    const config = await this.getConfig();
    if (!config.night_fare_enabled || config.night_fare_pct.lte(0)) return null;
    if (config.night_category_ids.length && !config.night_category_ids.includes(categoryId)) return null;
    if (!inWindow(at, config.night_start, config.night_end, config.timezone)) return null;
    return config.night_fare_pct;
  }

  /** Branch centre: the configured point, else the service-area centroid. */
  branchCenter(branch: { center_lat: Prisma.Decimal | null; center_lng: Prisma.Decimal | null; service_area: unknown }) {
    if (branch.center_lat != null && branch.center_lng != null) {
      return { lat: Number(branch.center_lat), lng: Number(branch.center_lng), source: 'CONFIGURED' as const };
    }
    const centroid = serviceAreaCentroid(branch.service_area);
    return centroid ? { ...centroid, source: 'SERVICE_AREA' as const } : null;
  }

  /** Distance-bonus percent for a pickup, or null when off / not far enough. */
  async distanceBonusPct(
    branch: { center_lat: Prisma.Decimal | null; center_lng: Prisma.Decimal | null; service_area: unknown },
    pickup: { lat: number; lng: number },
  ) {
    const config = await this.getConfig();
    if (!config.distance_enabled || config.distance_pct.lte(0)) return null;
    const center = this.branchCenter(branch);
    if (!center) return null;
    const km = haversineM(center, pickup) / 1000;
    return config.distance_min_km.lte(km) ? config.distance_pct : null;
  }

  /** Ride-level percentage/reason from its parts and the stacking rule. */
  async combinedRidePct(parts: { rejection: Prisma.Decimal | null; distance: Prisma.Decimal | null }) {
    const config = await this.getConfig();
    return combineRideBonus(
      [
        { kind: GoIncentiveKind.RIDE_REJECTION, pct: parts.rejection, cap: config.rejection_cap },
        { kind: GoIncentiveKind.RIDE_DISTANCE, pct: parts.distance, cap: config.distance_cap },
      ],
      config.ride_bonus_stack,
    );
  }

  /**
   * After a decline or an offer timeout: once enough different drivers refused the ride,
   * mark it with the rejection bonus. Returns true when the bonus was just applied.
   */
  async recordRejection(rideId: string) {
    const config = await this.getConfig();
    if (!config.rejection_enabled || config.rejection_pct.lte(0)) return false;
    const ride = await this.prisma.goRide.findUnique({
      where: { id: rideId },
      select: { status: true, incentive_rejection_pct: true, incentive_distance_pct: true },
    });
    if (!ride || ride.status !== GoRideStatus.SEARCHING || ride.incentive_rejection_pct != null) return false;
    const statuses: GoRideOfferStatus[] = [GoRideOfferStatus.DECLINED];
    if (config.rejection_count_expired) statuses.push(GoRideOfferStatus.EXPIRED);
    const refusers = await this.prisma.goRideOffer.findMany({
      where: { ride_id: rideId, status: { in: statuses } },
      distinct: ['driver_id'],
      select: { driver_id: true },
    });
    if (refusers.length < config.rejection_min_drivers) return false;
    const combined = await this.combinedRidePct({ rejection: config.rejection_pct, distance: ride.incentive_distance_pct });
    const updated = await this.prisma.goRide.updateMany({
      where: { id: rideId, incentive_rejection_pct: null },
      data: {
        incentive_rejection_pct: config.rejection_pct,
        incentive_percentage: combined.percentage,
        incentive_reason: combined.reason,
      },
    });
    if (updated.count) this.logger.log(`Ride ${rideId}: rejection bonus after ${refusers.length} drivers`);
    return updated.count > 0;
  }

  /** `bonus` block for offers: percentage, reason and amount estimated from the estimated fare. */
  async offerBonus(ride: {
    estimated_fare: Prisma.Decimal | null;
    incentive_percentage: Prisma.Decimal | null;
    incentive_reason: string | null;
    incentive_rejection_pct: Prisma.Decimal | null;
    incentive_distance_pct: Prisma.Decimal | null;
  }) {
    if (ride.incentive_percentage == null || ride.incentive_percentage.lte(0)) return null;
    const config = await this.getConfig();
    const payouts = rideBonusPayouts(ride.estimated_fare ?? 0, this.rideParts(ride, config), config.ride_bonus_stack);
    const amount = payouts.reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0));
    return {
      percentage: decimalToNumber(ride.incentive_percentage),
      reason: ride.incentive_reason,
      estimated_amount: decimalToNumber(amount),
    };
  }

  /** On completion: pays the ride's bonus parts from the driver's gross fare. */
  async grantRideBonus(input: { rideId: string; driverId: string; gross: Prisma.Decimal; distanceM: number }) {
    const ride = await this.prisma.goRide.findUnique({
      where: { id: input.rideId },
      select: { public_number: true, incentive_rejection_pct: true, incentive_distance_pct: true },
    });
    if (!ride || (ride.incentive_rejection_pct == null && ride.incentive_distance_pct == null)) return [];
    const config = await this.getConfig();
    if (input.distanceM < config.min_counted_distance_m) return [];
    const payouts = rideBonusPayouts(input.gross, this.rideParts(ride, config), config.ride_bonus_stack);
    const outcomes = [];
    for (const p of payouts) {
      outcomes.push(
        await this.grantBonus({
          driverId: input.driverId,
          kind: p.kind,
          periodKey: input.rideId,
          amount: p.amount,
          rideId: input.rideId,
          label: `${INCENTIVE_LABELS[p.kind]} (${ride.public_number})`,
          metadata: { percentage: decimalToNumber(p.pct), gross_fare: decimalToNumber(input.gross), stack: config.ride_bonus_stack },
        }),
      );
    }
    return outcomes;
  }

  private rideParts(
    ride: { incentive_rejection_pct: Prisma.Decimal | null; incentive_distance_pct: Prisma.Decimal | null },
    config: { rejection_cap: Prisma.Decimal | null; distance_cap: Prisma.Decimal | null },
  ) {
    return [
      { kind: GoIncentiveKind.RIDE_REJECTION, pct: ride.incentive_rejection_pct, cap: config.rejection_cap },
      { kind: GoIncentiveKind.RIDE_DISTANCE, pct: ride.incentive_distance_pct, cap: config.distance_cap },
    ];
  }

  /** Total incentives paid during the local day `day`. */
  async paidOn(day: string, tz: string) {
    const { from, to } = dayRange(day, tz);
    const agg = await this.prisma.goDriverIncentiveGrant.aggregate({
      _sum: { amount: true },
      where: { created_at: { gte: from, lt: to } },
    });
    return agg._sum.amount ?? new Prisma.Decimal(0);
  }
}
