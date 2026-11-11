import { Injectable, Logger } from '@nestjs/common';
import {
  GoDriverScoreBand,
  GoRatingDirection,
  GoRideOfferStatus,
  GoRideStatus,
  Prisma,
  type GoIncentiveConfig,
} from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BranchScopeService } from '../../../common/auth/branch-scope.service';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { LockService } from '../../../infra/redis/lock.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { GoConfigService } from '../config/config.service';
import { DriverSessionsService } from '../driver-sessions/driver-sessions.service';
import { IncentivesService } from '../incentives/incentives.service';
import { addDays, businessDay, businessDayRange } from '../incentives/time.util';
import { decimalToNumber } from '../pricing/fare.calculator';
import { scoreDriver, type DriverMetrics, type DriverScore, type ScoreWeights } from './score-math';

type Range = { from: Date; to: Date };
type ScoredDriver = { driverId: string; branchId: string | null; metrics: DriverMetrics; result: DriverScore };

/** Online sessions this long without a location ping are closed (multiple of stale_location_seconds). */
const STALE_SESSION_FACTOR = 10;

export const SCORE_SORTS = ['score', 'rating', 'acceptance_pct', 'online_hours', 'earnings', 'completed', 'cancel_pct'] as const;
export type ScoreSort = (typeof SCORE_SORTS)[number];
const NULLABLE_SORTS = new Set<ScoreSort>(['rating', 'acceptance_pct', 'cancel_pct']);

export function scoreWeights(config: GoIncentiveConfig): ScoreWeights {
  return {
    rating: decimalToNumber(config.weight_rating),
    acceptance: decimalToNumber(config.weight_acceptance),
    hours: decimalToNumber(config.weight_hours),
    earnings: decimalToNumber(config.weight_earnings),
    cancel: decimalToNumber(config.weight_cancel),
    bandKeep: decimalToNumber(config.band_keep),
    bandWatch: decimalToNumber(config.band_watch),
  };
}

const pct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : null);

/** Composite driver score: nightly snapshots per business day plus a live view. */
@Injectable()
export class DriverScoresService {
  private readonly logger = new Logger(DriverScoresService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly incentives: IncentivesService,
    private readonly sessions: DriverSessionsService,
    private readonly goConfig: GoConfigService,
    private readonly locks: LockService,
    private readonly audit: AuditService,
    private readonly branchScope: BranchScopeService,
  ) {}

  /** `window_days` business days ending with `day`. */
  windowFor(day: string, config: GoIncentiveConfig): Range {
    const first = addDays(day, -(Math.max(config.score_window_days, 1) - 1));
    return {
      from: businessDayRange(first, config.daily_close_time, config.timezone).from,
      to: businessDayRange(day, config.daily_close_time, config.timezone).to,
    };
  }

  /** Minute tick: close stale sessions, then snapshot the business day that just ended (once). */
  async tick(now = new Date()) {
    const dispatch = await this.goConfig.getDispatch();
    const staleClosed = await this.sessions.closeStale(dispatch.stale_location_seconds * STALE_SESSION_FACTOR, now);
    const config = await this.incentives.getConfig();
    const day = addDays(businessDay(now, config.daily_close_time, config.timezone), -1);
    const exists = await this.prisma.goDriverScoreSnapshot.count({ where: { day } });
    const snapshot = exists ? null : await this.snapshotDay(day, { config, now });
    return { stale_sessions_closed: staleClosed, snapshot };
  }

  async snapshotDay(day: string, opts: { config?: GoIncentiveConfig; now?: Date; force?: boolean } = {}) {
    const config = opts.config ?? (await this.incentives.getConfig());
    const now = opts.now ?? new Date();
    const range = this.windowFor(day, config);
    if (range.to > now) throw new GoException(GoErrorCode.VALIDATION_ERROR, `Day ${day} has not ended yet`);
    return this.locks.withLock(
      `driver-scores:${day}`,
      async () => {
        const existing = await this.prisma.goDriverScoreSnapshot.count({ where: { day } });
        if (existing && !opts.force) return { day, status: 'EXISTS' as const, drivers: existing };
        const scored = await this.scoreAll(range, config, now);
        await this.prisma.$transaction([
          this.prisma.goDriverScoreSnapshot.deleteMany({ where: { day } }),
          this.prisma.goDriverScoreSnapshot.createMany({
            data: scored.map((s) => this.snapshotRow(s, day, config.score_window_days)),
          }),
        ]);
        this.logger.log(`Driver scores for ${day}: ${scored.length} drivers`);
        return { day, status: 'CREATED' as const, drivers: scored.length };
      },
      { ttlMs: 120_000 },
    );
  }

  async recompute(actor: AuthUser, day?: string) {
    const config = await this.incentives.getConfig();
    const target = day ?? addDays(businessDay(new Date(), config.daily_close_time, config.timezone), -1);
    const result = await this.snapshotDay(target, { config, force: true });
    await this.audit.log({
      actor,
      action: AuditAction.INCENTIVE_RUN,
      entity_type: 'GoDriverScoreSnapshot',
      entity_id: target,
      metadata: { job: 'DRIVER_SCORES', ...result },
    });
    return result;
  }

  async list(
    user: AuthUser,
    q: { branch_id?: string; band?: GoDriverScoreBand; sort?: ScoreSort; order?: 'asc' | 'desc'; day?: string },
  ) {
    const branchId = this.branchScope.resolveFilter(user, q.branch_id);
    const day =
      q.day ??
      (await this.prisma.goDriverScoreSnapshot.findFirst({ orderBy: { day: 'desc' }, select: { day: true } }))?.day ??
      null;
    if (!day) return { day: null, days: [], bands: { KEEP: 0, WATCH: 0, REPLACEABLE: 0 }, items: [] };
    const where: Prisma.GoDriverScoreSnapshotWhereInput = { day, ...(branchId ? { branch_id: branchId } : {}) };
    const sort = q.sort ?? 'score';
    const order = q.order ?? (sort === 'cancel_pct' ? 'asc' : 'desc');
    const [items, bandCounts, days] = await Promise.all([
      this.prisma.goDriverScoreSnapshot.findMany({
        where: { ...where, ...(q.band ? { band: q.band } : {}) },
        orderBy: [{ [sort]: NULLABLE_SORTS.has(sort) ? { sort: order, nulls: 'last' } : order }, { score: 'desc' }],
        include: {
          driver: {
            select: {
              id: true,
              is_suspended: true,
              user: { select: { full_name: true, phone: true } },
              branch: { select: { id: true, name_ar: true, code: true } },
            },
          },
        },
      }),
      this.prisma.goDriverScoreSnapshot.groupBy({ by: ['band'], where, _count: { _all: true } }),
      this.prisma.goDriverScoreSnapshot.findMany({
        distinct: ['day'],
        orderBy: { day: 'desc' },
        take: 30,
        select: { day: true },
      }),
    ]);
    const bands = { KEEP: 0, WATCH: 0, REPLACEABLE: 0 };
    for (const row of bandCounts) bands[row.band] = row._count._all;
    return { day, days: days.map((d) => d.day), bands, items };
  }

  /** Snapshot history plus a live score over the window ending now. */
  async detail(user: AuthUser, driverId: string) {
    const driver = await this.prisma.goDriverProfile.findUnique({
      where: { id: driverId },
      select: { id: true, branch_id: true, user: { select: { full_name: true, phone: true } } },
    });
    if (!driver) throw new GoException(GoErrorCode.NOT_FOUND, 'Driver not found');
    if (driver.branch_id) this.branchScope.assertAccess(user, driver.branch_id);
    const config = await this.incentives.getConfig();
    const now = new Date();
    const today = businessDay(now, config.daily_close_time, config.timezone);
    const range = { from: this.windowFor(today, config).from, to: now };
    const live = (await this.scoreAll(range, config, now, driver.branch_id)).find((s) => s.driverId === driverId) ?? null;
    const history = await this.prisma.goDriverScoreSnapshot.findMany({
      where: { driver_id: driverId },
      orderBy: { day: 'desc' },
      take: 60,
      select: { day: true, score: true, band: true, rating: true, acceptance_pct: true, online_hours: true, earnings: true, completed: true },
    });
    return {
      driver,
      window_days: config.score_window_days,
      weights: scoreWeights(config),
      live: live && {
        from: range.from,
        to: range.to,
        score: live.result.score,
        band: live.result.band,
        breakdown: live.result.breakdown,
        metrics: live.metrics,
      },
      history: history.reverse(),
    };
  }

  // ---------------------------------------------------------------- scoring

  private snapshotRow(s: ScoredDriver, day: string, windowDays: number): Prisma.GoDriverScoreSnapshotCreateManyInput {
    const m = s.metrics;
    const round = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);
    return {
      driver_id: s.driverId,
      branch_id: s.branchId,
      day,
      window_days: windowDays,
      rating: round(m.rating),
      ratings_count: m.ratingsCount,
      acceptance_pct: round(m.acceptancePct),
      offers_count: m.offersCount,
      online_hours: round(m.onlineHours) ?? 0,
      earnings: m.earnings,
      completed: m.completed,
      cancel_pct: round(m.cancelPct),
      score: s.result.score,
      band: s.result.band,
      breakdown: s.result.breakdown as unknown as Prisma.InputJsonValue,
    };
  }

  /** Scores every driver (or one branch) against the drivers of the same branch. */
  async scoreAll(range: Range, config: GoIncentiveConfig, now: Date, branchId?: string | null): Promise<ScoredDriver[]> {
    const drivers = await this.prisma.goDriverProfile.findMany({
      where: branchId === undefined ? {} : { branch_id: branchId },
      select: { id: true, user_id: true, branch_id: true },
    });
    const metrics = await this.collect(drivers, range, now);
    const byBranch = new Map<string, DriverMetrics[]>();
    for (const d of drivers) {
      const key = d.branch_id ?? '';
      byBranch.set(key, [...(byBranch.get(key) ?? []), metrics.get(d.id)!]);
    }
    const weights = scoreWeights(config);
    return drivers.map((d) => {
      const m = metrics.get(d.id)!;
      return { driverId: d.id, branchId: d.branch_id, metrics: m, result: scoreDriver(m, byBranch.get(d.branch_id ?? '')!, weights) };
    });
  }

  private async collect(drivers: { id: string; user_id: string; branch_id: string | null }[], range: Range, now: Date) {
    const ids = drivers.map((d) => d.id);
    const window = { gte: range.from, lt: range.to };
    const [ratings, offers, completed, cancelled, hours] = await Promise.all([
      this.prisma.goRideRating.groupBy({
        by: ['to_user_id'],
        where: { direction: GoRatingDirection.CUSTOMER_TO_DRIVER, to_user_id: { in: drivers.map((d) => d.user_id) }, created_at: window },
        _avg: { stars: true },
        _count: { _all: true },
      }),
      this.prisma.goRideOffer.groupBy({
        by: ['driver_id', 'status'],
        where: {
          driver_id: { in: ids },
          status: { in: [GoRideOfferStatus.ACCEPTED, GoRideOfferStatus.DECLINED, GoRideOfferStatus.EXPIRED] },
          offered_at: window,
        },
        _count: { _all: true },
      }),
      this.prisma.goRide.groupBy({
        by: ['driver_id'],
        where: { driver_id: { in: ids }, status: GoRideStatus.COMPLETED, completed_at: window },
        _sum: { gross_final_fare: true },
        _count: { _all: true },
      }),
      this.prisma.goRide.groupBy({
        by: ['driver_id'],
        where: { driver_id: { in: ids }, status: GoRideStatus.CANCELLED_BY_DRIVER, cancelled_at: window },
        _count: { _all: true },
      }),
      this.sessions.hours(ids, range.from, range.to, now),
    ]);

    const ratingBy = new Map(ratings.map((r) => [r.to_user_id, r]));
    const offerBy = new Map<string, { accepted: number; total: number }>();
    for (const o of offers) {
      const row = offerBy.get(o.driver_id) ?? { accepted: 0, total: 0 };
      row.total += o._count._all;
      if (o.status === GoRideOfferStatus.ACCEPTED) row.accepted += o._count._all;
      offerBy.set(o.driver_id, row);
    }
    const completedBy = new Map(completed.map((r) => [r.driver_id, r]));
    const cancelledBy = new Map(cancelled.map((r) => [r.driver_id, r._count._all]));

    const out = new Map<string, DriverMetrics>();
    for (const d of drivers) {
      const rating = ratingBy.get(d.user_id);
      const offer = offerBy.get(d.id);
      const done = completedBy.get(d.id);
      const doneCount = done?._count._all ?? 0;
      const cancels = cancelledBy.get(d.id) ?? 0;
      out.set(d.id, {
        driverId: d.id,
        rating: rating?._avg.stars ?? null,
        ratingsCount: rating?._count._all ?? 0,
        acceptancePct: offer ? pct(offer.accepted, offer.total) : null,
        offersCount: offer?.total ?? 0,
        onlineHours: hours.get(d.id) ?? 0,
        earnings: decimalToNumber(done?._sum.gross_final_fare ?? 0),
        completed: doneCount,
        cancelPct: pct(cancels, doneCount + cancels),
      });
    }
    return out;
  }
}
