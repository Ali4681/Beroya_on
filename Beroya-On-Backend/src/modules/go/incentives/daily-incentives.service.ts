import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
  GoIncentiveKind,
  GoRideOfferStatus,
  GoRideStatus,
  Prisma,
  type GoGoalCampaign,
  type GoIncentiveConfig,
} from '@/generated/prisma/client';
import { Queue } from 'bullmq';
import type { AuthUser } from '../../../common/auth/auth-user';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { INCENTIVE_JOBS, QUEUES } from '../../../infra/queue/queue.constants';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { decimalToNumber } from '../pricing/fare.calculator';
import { longestCleanStreak, type StreakEvent } from './incentive-math';
import { INCENTIVE_LABELS, IncentivesService, type GrantOutcome } from './incentives.service';
import { addDays, businessDay, businessDayRange, windowOccurrence, windowOn, weekdayOfDay } from './time.util';

type Range = { from: Date; to: Date };

export type RunJob = 'TICK' | 'STREAK' | 'CAMPAIGN';

function tally(outcomes: GrantOutcome[]) {
  const counts: Record<string, number> = { GRANTED: 0, DUPLICATE: 0, CAP_REACHED: 0, SKIPPED: 0 };
  for (const o of outcomes) counts[o.status] += 1;
  return counts;
}

export function campaignRunsOn(campaign: Pick<GoGoalCampaign, 'days_of_week'>, day: string) {
  return campaign.days_of_week.length === 0 || campaign.days_of_week.includes(weekdayOfDay(day));
}

export function campaignPeriodKey(campaignId: string, day: string) {
  return `${campaignId}:${day}`;
}

/** Streak close and goal campaigns: driven by a one-minute tick, every payout idempotent. */
@Injectable()
export class DailyIncentivesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DailyIncentivesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly incentives: IncentivesService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    @InjectQueue(QUEUES.INCENTIVES) private readonly queue: Queue,
  ) {}

  async onApplicationBootstrap() {
    const schedule = this.queue.upsertJobScheduler('incentives-tick', { every: 60_000 }, { name: INCENTIVE_JOBS.TICK });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
    await Promise.race([schedule, timeout]).catch((err: Error) =>
      this.logger.warn(`Could not register incentives scheduler (${err.message})`),
    );
  }

  async tick(now = new Date()) {
    const config = await this.incentives.getConfig();
    const streak = config.streak_enabled
      ? await this.closeStreakDay(addDays(businessDay(now, config.daily_close_time, config.timezone), -1), { config, now })
      : null;
    const campaigns = await this.tickCampaigns(now, config);
    return { streak, campaigns };
  }

  /** Admin trigger; `force` re-runs an already settled period (grants stay idempotent). */
  async run(actor: AuthUser, input: { job: RunJob; day?: string; campaign_id?: string; force?: boolean }) {
    const now = new Date();
    const config = await this.incentives.getConfig();
    let result: unknown;
    if (input.job === 'STREAK') {
      const day = input.day ?? addDays(businessDay(now, config.daily_close_time, config.timezone), -1);
      result = await this.closeStreakDay(day, { config, now, force: input.force, strict: true });
    } else if (input.job === 'CAMPAIGN') {
      if (!input.campaign_id) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'campaign_id is required');
      const campaign = await this.prisma.goGoalCampaign.findUnique({ where: { id: input.campaign_id } });
      if (!campaign) throw new GoException(GoErrorCode.NOT_FOUND, 'Campaign not found');
      const day = input.day ?? this.lastEndedDay(campaign, now, config.timezone);
      result = await this.settleCampaign(campaign, day, { config, now, force: input.force, strict: true });
    } else {
      result = await this.tick(now);
    }
    await this.audit.log({
      actor,
      action: AuditAction.INCENTIVE_RUN,
      entity_type: 'GoIncentiveRun',
      entity_id: input.campaign_id ?? input.day ?? input.job,
      metadata: { ...input, result } as Prisma.InputJsonValue,
    });
    return result;
  }

  // ---------------------------------------------------------------- streak

  async closeStreakDay(
    day: string,
    opts: { config: GoIncentiveConfig; now: Date; force?: boolean; strict?: boolean },
  ) {
    const { config, now } = opts;
    const range = businessDayRange(day, config.daily_close_time, config.timezone);
    if (range.to > now) {
      if (opts.strict) throw new GoException(GoErrorCode.VALIDATION_ERROR, `Day ${day} has not ended yet`);
      return { day, status: 'NOT_ENDED' as const };
    }
    if (!(await this.claim(GoIncentiveKind.STREAK_DAILY, day, opts.force))) return { day, status: 'ALREADY_SETTLED' as const };

    const candidates = await this.prisma.goRide.groupBy({
      by: ['driver_id'],
      where: {
        status: GoRideStatus.COMPLETED,
        completed_at: { gte: range.from, lt: range.to },
        actual_distance_m: { gte: config.min_counted_distance_m },
        driver_id: { not: null },
      },
      _count: { _all: true },
    });
    const outcomes: GrantOutcome[] = [];
    let qualified = 0;
    for (const row of candidates) {
      if (!row.driver_id || row._count._all < config.streak_rides) continue;
      const { longest } = longestCleanStreak(await this.streakEvents(row.driver_id, range, config));
      if (longest < config.streak_rides) continue;
      qualified += 1;
      outcomes.push(
        await this.incentives.grantBonus({
          driverId: row.driver_id,
          kind: GoIncentiveKind.STREAK_DAILY,
          periodKey: day,
          amount: config.streak_amount,
          metadata: { day, longest, streak_rides: config.streak_rides },
        }),
      );
    }
    const stats = { day, drivers_checked: candidates.length, qualified, ...tally(outcomes) };
    await this.finish(GoIncentiveKind.STREAK_DAILY, day, stats);
    return { status: 'SETTLED' as const, ...stats };
  }

  private async streakEvents(driverId: string, range: Range, config: GoIncentiveConfig): Promise<StreakEvent[]> {
    const breaking: GoRideOfferStatus[] = [GoRideOfferStatus.DECLINED];
    if (config.streak_count_expired) breaking.push(GoRideOfferStatus.EXPIRED);
    const window = { gte: range.from, lt: range.to };
    const [completed, refused, cancelled] = await Promise.all([
      this.prisma.goRide.findMany({
        where: {
          driver_id: driverId,
          status: GoRideStatus.COMPLETED,
          completed_at: window,
          actual_distance_m: { gte: config.min_counted_distance_m },
        },
        select: { completed_at: true },
      }),
      this.prisma.goRideOffer.findMany({
        where: { driver_id: driverId, status: { in: breaking }, responded_at: window },
        select: { responded_at: true },
      }),
      this.prisma.goRide.findMany({
        where: { driver_id: driverId, status: GoRideStatus.CANCELLED_BY_DRIVER, cancelled_at: window },
        select: { cancelled_at: true },
      }),
    ]);
    return [
      ...completed.map((r) => ({ at: r.completed_at!, type: 'COMPLETED' as const })),
      ...refused.map((o) => ({ at: o.responded_at!, type: 'BREAK' as const })),
      ...cancelled.map((r) => ({ at: r.cancelled_at!, type: 'BREAK' as const })),
    ];
  }

  // ---------------------------------------------------------------- campaigns

  private async tickCampaigns(now: Date, config: GoIncentiveConfig) {
    const campaigns = await this.prisma.goGoalCampaign.findMany({ where: { is_active: true } });
    const results: unknown[] = [];
    for (const campaign of campaigns) {
      try {
        const current = windowOccurrence(now, campaign.start_time, campaign.end_time, config.timezone);
        if (now < current.to && campaignRunsOn(campaign, current.day) && current.to > campaign.created_at) {
          await this.notifyStart(campaign, current.day, config);
        }
        for (const day of [current.day, addDays(current.day, -1)]) {
          const window = windowOn(day, campaign.start_time, campaign.end_time, config.timezone);
          if (window.to > now || window.to <= campaign.created_at || !campaignRunsOn(campaign, day)) continue;
          const settled = await this.prisma.goIncentiveRun.findUnique({
            where: { kind_period_key: { kind: GoIncentiveKind.GOAL_CAMPAIGN, period_key: campaignPeriodKey(campaign.id, day) } },
            select: { settled_at: true },
          });
          if (settled?.settled_at) continue;
          results.push(await this.settleCampaign(campaign, day, { config, now }));
        }
      } catch (err) {
        this.logger.error(`Campaign ${campaign.id} tick failed: ${(err as Error).message}`);
      }
    }
    return results;
  }

  private async notifyStart(campaign: GoGoalCampaign, day: string, config: GoIncentiveConfig) {
    const key = campaignPeriodKey(campaign.id, day);
    await this.ensureRun(GoIncentiveKind.GOAL_CAMPAIGN, key);
    const claimed = await this.prisma.goIncentiveRun.updateMany({
      where: { kind: GoIncentiveKind.GOAL_CAMPAIGN, period_key: key, notified_at: null },
      data: { notified_at: new Date() },
    });
    if (!claimed.count) return;
    const drivers = await this.prisma.goDriverProfile.findMany({
      where: {
        is_suspended: false,
        operational_blocked: false,
        ...(campaign.branch_id ? { branch_id: campaign.branch_id } : {}),
      },
      select: { user_id: true },
    });
    const window = windowOn(day, campaign.start_time, campaign.end_time, config.timezone);
    for (const driver of drivers) {
      this.realtime.emitToDriver(driver.user_id, 'incentive.goal_started', {
        campaign_id: campaign.id,
        name: campaign.name,
        rides_required: campaign.rides_required,
        reward_amount: decimalToNumber(campaign.reward_amount),
        start_time: campaign.start_time,
        end_time: campaign.end_time,
        starts_at: window.from.toISOString(),
        ends_at: window.to.toISOString(),
      });
    }
    this.logger.log(`Campaign ${campaign.name} (${day}) started, notified ${drivers.length} drivers`);
  }

  async settleCampaign(
    campaign: GoGoalCampaign,
    day: string,
    opts: { config: GoIncentiveConfig; now: Date; force?: boolean; strict?: boolean },
  ) {
    const { config, now } = opts;
    const key = campaignPeriodKey(campaign.id, day);
    const window = windowOn(day, campaign.start_time, campaign.end_time, config.timezone);
    if (window.to > now) {
      if (opts.strict) throw new GoException(GoErrorCode.VALIDATION_ERROR, `Campaign window on ${day} has not ended yet`);
      return { campaign_id: campaign.id, day, status: 'NOT_ENDED' as const };
    }
    if (!(await this.claim(GoIncentiveKind.GOAL_CAMPAIGN, key, opts.force))) {
      return { campaign_id: campaign.id, day, status: 'ALREADY_SETTLED' as const };
    }
    const counts = await this.campaignCounts(campaign, window, config);
    const outcomes: GrantOutcome[] = [];
    let achieved = 0;
    for (const [driverId, rides] of counts) {
      if (rides < campaign.rides_required) continue;
      achieved += 1;
      outcomes.push(
        await this.incentives.grantBonus({
          driverId,
          kind: GoIncentiveKind.GOAL_CAMPAIGN,
          periodKey: key,
          amount: campaign.reward_amount,
          campaignId: campaign.id,
          label: `${INCENTIVE_LABELS.GOAL_CAMPAIGN}: ${campaign.name}`,
          event: 'incentive.goal_achieved',
          metadata: { day, rides, rides_required: campaign.rides_required },
        }),
      );
    }
    const stats = { campaign_id: campaign.id, name: campaign.name, day, participants: counts.size, achieved, ...tally(outcomes) };
    await this.finish(GoIncentiveKind.GOAL_CAMPAIGN, key, stats);
    return { status: 'SETTLED' as const, ...stats };
  }

  private async campaignCounts(campaign: GoGoalCampaign, range: Range, config: GoIncentiveConfig, driverId?: string) {
    const rows = await this.prisma.goRide.groupBy({
      by: ['driver_id'],
      where: {
        status: GoRideStatus.COMPLETED,
        completed_at: { gte: range.from, lt: range.to },
        actual_distance_m: { gte: config.min_counted_distance_m },
        driver_id: driverId ?? { not: null },
        ...(campaign.branch_id ? { branch_id: campaign.branch_id } : {}),
      },
      _count: { _all: true },
    });
    return new Map(rows.filter((r) => r.driver_id).map((r) => [r.driver_id!, r._count._all]));
  }

  private lastEndedDay(campaign: GoGoalCampaign, now: Date, tz: string) {
    let day = windowOccurrence(now, campaign.start_time, campaign.end_time, tz).day;
    for (let i = 0; i < 8; i++, day = addDays(day, -1)) {
      if (windowOn(day, campaign.start_time, campaign.end_time, tz).to <= now && campaignRunsOn(campaign, day)) return day;
    }
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'No ended window in the last week');
  }

  // ---------------------------------------------------------------- driver view

  async driverToday(userId: string, now = new Date()) {
    const driver = await this.prisma.goDriverProfile.findUnique({ where: { user_id: userId }, select: { id: true, branch_id: true } });
    if (!driver) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Driver profile not found');
    const config = await this.incentives.getConfig();
    const tz = config.timezone;
    const day = businessDay(now, config.daily_close_time, tz);
    const range = businessDayRange(day, config.daily_close_time, tz);

    let streak: Record<string, unknown> | null = null;
    if (config.streak_enabled) {
      const { longest, current } = longestCleanStreak(await this.streakEvents(driver.id, { from: range.from, to: now }, config));
      const paid = await this.prisma.goDriverIncentiveGrant.findUnique({
        where: { driver_id_kind_period_key: { driver_id: driver.id, kind: GoIncentiveKind.STREAK_DAILY, period_key: day } },
        select: { amount: true },
      });
      streak = {
        rides_required: config.streak_rides,
        reward_amount: decimalToNumber(config.streak_amount),
        current,
        longest,
        achieved: longest >= config.streak_rides,
        paid: !!paid,
        pays_at: range.to.toISOString(),
        breaks_on_expired_offer: config.streak_count_expired,
      };
    }

    const campaigns = await this.prisma.goGoalCampaign.findMany({
      where: { is_active: true, OR: [{ branch_id: null }, ...(driver.branch_id ? [{ branch_id: driver.branch_id }] : [])] },
      orderBy: { start_time: 'asc' },
    });
    const goals: Record<string, unknown>[] = [];
    for (const campaign of campaigns) {
      for (const d of [addDays(day, -1), day]) {
        if (!campaignRunsOn(campaign, d)) continue;
        const window = windowOn(d, campaign.start_time, campaign.end_time, tz);
        if (window.to <= range.from || window.from >= range.to) continue;
        const status = now < window.from ? 'UPCOMING' : now < window.to ? 'ACTIVE' : 'ENDED';
        const progress =
          status === 'UPCOMING'
            ? 0
            : ((await this.campaignCounts(campaign, { from: window.from, to: now < window.to ? now : window.to }, config, driver.id)).get(driver.id) ?? 0);
        const paid = await this.prisma.goDriverIncentiveGrant.findUnique({
          where: {
            driver_id_kind_period_key: { driver_id: driver.id, kind: GoIncentiveKind.GOAL_CAMPAIGN, period_key: campaignPeriodKey(campaign.id, d) },
          },
          select: { id: true },
        });
        goals.push({
          campaign_id: campaign.id,
          name: campaign.name,
          status,
          starts_at: window.from.toISOString(),
          ends_at: window.to.toISOString(),
          rides_required: campaign.rides_required,
          reward_amount: decimalToNumber(campaign.reward_amount),
          rides_completed: progress,
          achieved: progress >= campaign.rides_required,
          paid: !!paid,
        });
      }
    }
    goals.sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));

    return {
      day,
      timezone: tz,
      min_counted_distance_m: config.min_counted_distance_m,
      streak,
      goals,
    };
  }

  // ---------------------------------------------------------------- run bookkeeping

  private async ensureRun(kind: GoIncentiveKind, periodKey: string) {
    try {
      await this.prisma.goIncentiveRun.upsert({
        where: { kind_period_key: { kind, period_key: periodKey } },
        create: { kind, period_key: periodKey },
        update: {},
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
  }

  /** True when this caller owns settling the period. */
  private async claim(kind: GoIncentiveKind, periodKey: string, force?: boolean) {
    await this.ensureRun(kind, periodKey);
    if (force) return true;
    const claimed = await this.prisma.goIncentiveRun.updateMany({
      where: { kind, period_key: periodKey, settled_at: null },
      data: { settled_at: new Date() },
    });
    return claimed.count > 0;
  }

  private async finish(kind: GoIncentiveKind, periodKey: string, stats: Record<string, unknown>) {
    await this.prisma.goIncentiveRun.update({
      where: { kind_period_key: { kind, period_key: periodKey } },
      data: { settled_at: new Date(), stats: stats as Prisma.InputJsonValue },
    });
    this.logger.log(`${kind} ${periodKey}: ${JSON.stringify(stats)}`);
  }

  listRuns(limit = 30) {
    return this.prisma.goIncentiveRun.findMany({ orderBy: { created_at: 'desc' }, take: Math.min(Math.max(limit, 1), 100) });
  }
}
