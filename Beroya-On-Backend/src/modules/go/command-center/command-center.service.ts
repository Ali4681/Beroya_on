import { Injectable, Logger } from '@nestjs/common';
import {
  GoAlertSeverity,
  GoOperationalAlertStatus,
  GoOperationalAlertType,
  GoRideStatus,
  GoRideType,
  Prisma,
} from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BranchScopeService } from '../../../common/auth/branch-scope.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { AlertsService } from '../alerts/alerts.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { RADAR_DEFAULT_RESOLUTION } from '../radar/radar-math';
import { RadarService, RADAR_RIDE_STATUSES, classifyDriver, type RadarSnapshot } from '../radar/radar.service';
import { GoConfigService } from '../config/config.service';
import type { UpdateCommandCenterConfigDto } from './dto/command-center.dto';
import { buildFinanceCsv } from './finance-export';
import {
  assignmentDelay,
  cancellationRate,
  cancellationSeverity,
  coverageBreaches,
  deltaPct,
  pctOrNull,
  rideDelay,
} from './ops-rules';

type Cohort = {
  requests: number;
  completed: number;
  cancelled_by_customer: number;
  cancelled_by_driver: number;
  cancelled_by_staff: number;
  no_show: number;
  unserved: number;
  interrupted: number;
  open: number;
  avg_assignment_sec: number | null;
  avg_pickup_wait_sec: number | null;
  assignment_samples: number;
};

type Window = { from: Date; to: Date };

export type Insight = {
  code:
    | 'SHORTAGE_AREA'
    | 'FORECAST_SHORTAGE'
    | 'ASSIGNMENT_TIME_RISING'
    | 'CANCELLATION_RISING'
    | 'UNSERVED_REQUESTS'
    | 'STALE_DRIVER_ON_RIDE';
  severity: 'info' | 'warning' | 'critical';
  recommendation:
    | 'REVIEW_DRIVER_DISTRIBUTION'
    | 'PREPARE_COVERAGE'
    | 'INVESTIGATE_ASSIGNMENT_TIME'
    | 'REVIEW_CANCELLATIONS'
    | 'REVIEW_UNSERVED'
    | 'CHECK_DRIVER_CONNECTIVITY';
  evidence: Record<string, unknown>;
};

const CANCELLED: GoRideStatus[] = [
  GoRideStatus.CANCELLED_BY_CUSTOMER,
  GoRideStatus.CANCELLED_BY_DRIVER,
  GoRideStatus.CANCELLED_BY_STAFF,
];

@Injectable()
export class CommandCenterService {
  private readonly logger = new Logger(CommandCenterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly radar: RadarService,
    private readonly alerts: AlertsService,
    private readonly audit: AuditService,
    private readonly config: GoConfigService,
    private readonly realtime: RealtimeService,
  ) {}

  // ---------- Config ----------

  getConfig() {
    return this.prisma.goCommandCenterConfig.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
  }

  async updateConfig(actor: AuthUser, dto: UpdateCommandCenterConfigDto) {
    const before = await this.getConfig();
    const updated = await this.prisma.goCommandCenterConfig.update({ where: { id: 'default' }, data: { ...dto } });
    await this.audit.log({
      actor,
      action: AuditAction.COMMAND_CENTER_CONFIG_CHANGED,
      entity_type: 'go_command_center_config',
      entity_id: 'default',
      metadata: { before: jsonSafe(before), after: jsonSafe(updated) } as Prisma.InputJsonValue,
    });
    return updated;
  }

  // ---------- KPIs ----------

  private async cohort(branchId: string | undefined, w: Window): Promise<Cohort> {
    const branch = branchId ? Prisma.sql`AND branch_id = ${branchId}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Cohort[]>`
      SELECT
        COUNT(*)::int AS requests,
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
        COUNT(*) FILTER (WHERE status = 'CANCELLED_BY_CUSTOMER')::int AS cancelled_by_customer,
        COUNT(*) FILTER (WHERE status = 'CANCELLED_BY_DRIVER')::int AS cancelled_by_driver,
        COUNT(*) FILTER (WHERE status = 'CANCELLED_BY_STAFF')::int AS cancelled_by_staff,
        COUNT(*) FILTER (WHERE status = 'NO_SHOW')::int AS no_show,
        COUNT(*) FILTER (WHERE status = 'FAILED_NO_DRIVER')::int AS unserved,
        COUNT(*) FILTER (WHERE status IN ('INTERRUPTED', 'REPLACED'))::int AS interrupted,
        COUNT(*) FILTER (WHERE status IN ('SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'))::int AS open,
        (AVG(EXTRACT(EPOCH FROM (assigned_at - created_at)))
          FILTER (WHERE type = 'IMMEDIATE' AND assigned_at IS NOT NULL))::float8 AS avg_assignment_sec,
        (AVG(EXTRACT(EPOCH FROM (arrived_at - created_at)))
          FILTER (WHERE type = 'IMMEDIATE' AND arrived_at IS NOT NULL))::float8 AS avg_pickup_wait_sec,
        COUNT(*) FILTER (WHERE type = 'IMMEDIATE' AND assigned_at IS NOT NULL)::int AS assignment_samples
      FROM go_rides
      WHERE replacement_of_ride_id IS NULL ${branch}
        AND created_at >= ${w.from} AND created_at < ${w.to}`;
    const r = rows[0];
    return {
      ...r,
      avg_assignment_sec: r.avg_assignment_sec == null ? null : Math.round(r.avg_assignment_sec),
      avg_pickup_wait_sec: r.avg_pickup_wait_sec == null ? null : Math.round(r.avg_pickup_wait_sec),
    };
  }

  private cohortView(c: Cohort) {
    const cancelled = c.cancelled_by_customer + c.cancelled_by_driver + c.cancelled_by_staff;
    const finished = c.completed + cancelled + c.no_show + c.unserved + c.interrupted;
    return {
      ...c,
      cancelled,
      finished,
      completion_rate_pct: pctOrNull(c.completed, finished),
      cancellation_rate_pct: pctOrNull(cancelled, finished),
      unserved_rate_pct: pctOrNull(c.unserved, finished),
    };
  }

  private async acceptance(branchId: string | undefined, w: Window) {
    const branch = branchId ? Prisma.sql`AND r.branch_id = ${branchId}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ accepted: number; declined: number; expired: number }[]>`
      SELECT
        COUNT(*) FILTER (WHERE o.status = 'ACCEPTED')::int AS accepted,
        COUNT(*) FILTER (WHERE o.status = 'DECLINED')::int AS declined,
        COUNT(*) FILTER (WHERE o.status = 'EXPIRED')::int AS expired
      FROM go_ride_offers o JOIN go_rides r ON r.id = o.ride_id
      WHERE o.offered_at >= ${w.from} AND o.offered_at < ${w.to} ${branch}`;
    const a = rows[0];
    return { ...a, rate_pct: pctOrNull(a.accepted, a.accepted + a.declined + a.expired) };
  }

  private async series(branchId: string | undefined, w: Window, tz: string) {
    const unit = w.to.getTime() - w.from.getTime() <= 48 * 3600 * 1000 ? 'hour' : 'day';
    const branch = branchId ? Prisma.sql`AND branch_id = ${branchId}` : Prisma.empty;
    const points = await this.prisma.$queryRaw<{ bucket: string; requests: number; completed: number; cancelled: number }[]>`
      SELECT to_char(date_trunc(${unit}, created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz}), 'YYYY-MM-DD"T"HH24:MI') AS bucket,
        COUNT(*)::int AS requests,
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
        COUNT(*) FILTER (WHERE status IN ('CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_DRIVER', 'CANCELLED_BY_STAFF'))::int AS cancelled
      FROM go_rides
      WHERE replacement_of_ride_id IS NULL ${branch}
        AND created_at >= ${w.from} AND created_at < ${w.to}
      GROUP BY 1 ORDER BY 1`;
    return { unit, timezone: tz, points };
  }

  private async live(branchId: string | undefined) {
    const dispatch = await this.config.getDispatch();
    const staleBefore = new Date(Date.now() - dispatch.stale_location_seconds * 1000);
    const [byStatus, drivers, openAlerts] = await Promise.all([
      this.prisma.goRide.groupBy({
        by: ['status'],
        where: { status: { in: RADAR_RIDE_STATUSES }, ...(branchId ? { branch_id: branchId } : {}) },
        _count: { _all: true },
      }),
      this.radar.driverStates(branchId, undefined, 50_000),
      this.prisma.goOperationalAlert.groupBy({
        by: ['severity'],
        where: {
          status: { in: [GoOperationalAlertStatus.OPEN, GoOperationalAlertStatus.CLAIMED] },
          ...(branchId ? { branch_id: branchId } : {}),
        },
        _count: { _all: true },
      }),
    ]);
    const status = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Partial<Record<GoRideStatus, number>>;
    let available = 0;
    let stale = 0;
    let assigned = 0;
    for (const d of drivers) {
      const kind = classifyDriver(d, staleBefore);
      if (kind === 'available') available += 1;
      if (kind === 'stale') stale += 1;
      if (d.current_ride_id) assigned += 1;
    }
    const alertsBy = Object.fromEntries(openAlerts.map((a) => [a.severity, a._count._all])) as Partial<Record<GoAlertSeverity, number>>;
    return {
      at: new Date().toISOString(),
      stale_location_seconds: dispatch.stale_location_seconds,
      searching_now: status.SEARCHING ?? 0,
      active_rides:
        (status.DRIVER_ASSIGNED ?? 0) + (status.DRIVER_EN_ROUTE ?? 0) + (status.ARRIVED ?? 0) + (status.IN_PROGRESS ?? 0),
      by_status: status,
      online_drivers: drivers.length,
      available_drivers: available,
      assigned_drivers: assigned,
      stale_location_drivers: stale,
      open_alerts: Object.values(alertsBy).reduce((a, b) => a + (b ?? 0), 0),
      open_alerts_by_severity: alertsBy,
    };
  }

  async summary(actor: AuthUser, q: { branch_id?: string; from?: string; to?: string }) {
    const branchId = this.branchScope.resolveFilter(actor, q.branch_id);
    const window = this.radar.resolveWindow(q.from, q.to);
    const len = window.to.getTime() - window.from.getTime();
    const previous = { from: new Date(window.from.getTime() - len), to: window.from };
    const tz = await this.radar.timezone();
    const [cur, prev, acc, accPrev, series, live, snap, staleOnRide] = await Promise.all([
      this.cohort(branchId, window),
      this.cohort(branchId, previous),
      this.acceptance(branchId, window),
      this.acceptance(branchId, previous),
      this.series(branchId, window, tz),
      this.live(branchId),
      this.radar.snapshot(branchId, this.radar.liveWindow(), RADAR_DEFAULT_RESOLUTION),
      this.prisma.goOperationalAlert.findMany({
        where: {
          type: GoOperationalAlertType.LOCATION_STALE,
          status: { in: [GoOperationalAlertStatus.OPEN, GoOperationalAlertStatus.CLAIMED] },
          ...(branchId ? { branch_id: branchId } : {}),
        },
        select: { id: true, ride_id: true, started_at: true, ride: { select: { public_number: true } } },
        take: 20,
      }),
    ]);
    const period = this.cohortView(cur);
    const before = this.cohortView(prev);
    const cfg = await this.getConfig();
    return {
      generated_at: new Date().toISOString(),
      branch_id: branchId ?? null,
      timezone: tz,
      window: { from: window.from.toISOString(), to: window.to.toISOString() },
      previous_window: { from: previous.from.toISOString(), to: previous.to.toISOString() },
      live,
      period,
      previous: before,
      changes: {
        requests_pct: deltaPct(period.requests, before.requests),
        completed_pct: deltaPct(period.completed, before.completed),
        cancellation_rate_pts:
          period.cancellation_rate_pct != null && before.cancellation_rate_pct != null
            ? Math.round((period.cancellation_rate_pct - before.cancellation_rate_pct) * 10) / 10
            : null,
        avg_assignment_pct: deltaPct(period.avg_assignment_sec, before.avg_assignment_sec),
      },
      acceptance: acc,
      previous_acceptance: accPrev,
      series,
      insights: this.insights(period, before, snap, staleOnRide, cfg.cancellation_min_rides),
    };
  }

  private insights(
    period: ReturnType<CommandCenterService['cohortView']>,
    before: ReturnType<CommandCenterService['cohortView']>,
    snap: RadarSnapshot,
    staleOnRide: { id: string; ride_id: string | null; started_at: Date; ride: { public_number: string } | null }[],
    minRides: number,
  ): Insight[] {
    const out: Insight[] = [];
    const shortage = snap.cells.filter((c) => c.shortage.actual).sort((a, b) => b.live.unassigned - a.live.unassigned);
    for (const c of shortage.slice(0, 3)) {
      out.push({
        code: 'SHORTAGE_AREA',
        severity: c.live.available_drivers === 0 ? 'critical' : 'warning',
        recommendation: 'REVIEW_DRIVER_DISTRIBUTION',
        evidence: { cell: c.cell, center: c.center, waiting_requests: c.live.unassigned, available_drivers: c.live.available_drivers },
      });
    }
    if (snap.forecast.status === 'ok') {
      const fc = snap.cells
        .filter((c) => c.shortage.forecast && !c.shortage.actual)
        .sort((a, b) => (b.forecast?.expected_requests ?? 0) - (a.forecast?.expected_requests ?? 0));
      for (const c of fc.slice(0, 3)) {
        out.push({
          code: 'FORECAST_SHORTAGE',
          severity: 'info',
          recommendation: 'PREPARE_COVERAGE',
          evidence: {
            cell: c.cell,
            center: c.center,
            forecast_requests: c.forecast?.expected_requests ?? null,
            available_drivers: c.live.available_drivers,
            horizon: snap.forecast.horizon,
            weeks_used: snap.forecast.weeks_used,
          },
        });
      }
    }
    if (
      period.avg_assignment_sec != null &&
      before.avg_assignment_sec != null &&
      period.assignment_samples >= 5 &&
      before.assignment_samples >= 5 &&
      period.avg_assignment_sec >= 60 &&
      period.avg_assignment_sec >= before.avg_assignment_sec * 1.25
    ) {
      out.push({
        code: 'ASSIGNMENT_TIME_RISING',
        severity: 'warning',
        recommendation: 'INVESTIGATE_ASSIGNMENT_TIME',
        evidence: {
          avg_assignment_sec: period.avg_assignment_sec,
          previous_avg_assignment_sec: before.avg_assignment_sec,
          change_pct: deltaPct(period.avg_assignment_sec, before.avg_assignment_sec),
          samples: period.assignment_samples,
        },
      });
    }
    if (
      period.cancellation_rate_pct != null &&
      before.cancellation_rate_pct != null &&
      period.finished >= minRides &&
      before.finished >= minRides &&
      period.cancellation_rate_pct - before.cancellation_rate_pct >= 10
    ) {
      out.push({
        code: 'CANCELLATION_RISING',
        severity: 'warning',
        recommendation: 'REVIEW_CANCELLATIONS',
        evidence: {
          cancellation_rate_pct: period.cancellation_rate_pct,
          previous_cancellation_rate_pct: before.cancellation_rate_pct,
          cancelled: period.cancelled,
          finished: period.finished,
        },
      });
    }
    if (period.unserved > 0) {
      out.push({
        code: 'UNSERVED_REQUESTS',
        severity: (period.unserved_rate_pct ?? 0) >= 10 ? 'warning' : 'info',
        recommendation: 'REVIEW_UNSERVED',
        evidence: { unserved: period.unserved, unserved_rate_pct: period.unserved_rate_pct, finished: period.finished },
      });
    }
    for (const a of staleOnRide.slice(0, 5)) {
      out.push({
        code: 'STALE_DRIVER_ON_RIDE',
        severity: 'warning',
        recommendation: 'CHECK_DRIVER_CONNECTIVITY',
        evidence: { alert_id: a.id, ride_id: a.ride_id, public_number: a.ride?.public_number ?? null, since: a.started_at },
      });
    }
    return out;
  }

  // ---------- Finance ----------

  async finance(actor: AuthUser, q: { branch_id?: string; from?: string; to?: string }) {
    const branchId = this.branchScope.resolveFilter(actor, q.branch_id);
    const w = this.radar.resolveWindow(q.from, q.to);
    const timezone = await this.radar.timezone();
    const rideBranch = branchId ? Prisma.sql`AND r.branch_id = ${branchId}` : Prisma.empty;
    const driverBranch = branchId ? Prisma.sql`AND d.branch_id = ${branchId}` : Prisma.empty;
    const unit = w.to.getTime() - w.from.getTime() <= 48 * 3600 * 1000 ? 'hour' : 'day';

    const [fares, driverTx, customerTx, compensations, balances, fareSeries, walletSeries, topDrivers] =
      await Promise.all([
        this.prisma.$queryRaw<
          { rides: number; gross_fares: number; discounts: number; compensations: number; customer_payable: number }[]
        >`
        SELECT COUNT(*)::int AS rides,
          COALESCE(SUM(r.gross_final_fare), 0)::float8 AS gross_fares,
          COALESCE(SUM(r.discount_total), 0)::float8 AS discounts,
          COALESCE(SUM(r.compensation_total), 0)::float8 AS compensations,
          COALESCE(SUM(r.customer_payable), 0)::float8 AS customer_payable
        FROM go_rides r
        WHERE r.status = 'COMPLETED' AND r.completed_at >= ${w.from} AND r.completed_at < ${w.to} ${rideBranch}`,
        this.prisma.$queryRaw<{ type: string; reversed_type: string | null; n: number; effect: number }[]>`
        SELECT t.type::text AS type, o.type::text AS reversed_type, COUNT(*)::int AS n,
          COALESCE(SUM(t.balance_after - t.balance_before), 0)::float8 AS effect
        FROM go_driver_wallet_transactions t
        JOIN go_driver_profiles d ON d.id = t.driver_id
        LEFT JOIN go_driver_wallet_transactions o ON o.id = t.reversed_transaction_id
        WHERE t.created_at >= ${w.from} AND t.created_at < ${w.to} ${driverBranch}
        GROUP BY 1, 2`,
        branchId
          ? Promise.resolve(null)
          : this.prisma.$queryRaw<{ type: string; n: number; effect: number }[]>`
            SELECT t.type::text AS type, COUNT(*)::int AS n, COALESCE(SUM(t.balance_after - t.balance_before), 0)::float8 AS effect
            FROM go_customer_wallet_transactions t
            WHERE t.created_at >= ${w.from} AND t.created_at < ${w.to}
            GROUP BY 1`,
        this.prisma.$queryRaw<{ bearer: string; n: number; applied: number; beroya: number; driver: number }[]>`
        SELECT c.bearer::text AS bearer, COUNT(*)::int AS n,
          COALESCE(SUM(c.applied_amount), 0)::float8 AS applied,
          COALESCE(SUM(CASE WHEN c.bearer = 'BEROYA' THEN COALESCE(c.beroya_share, c.applied_amount)
                            WHEN c.bearer = 'SPLIT' THEN COALESCE(c.beroya_share, 0) ELSE 0 END), 0)::float8 AS beroya,
          COALESCE(SUM(CASE WHEN c.bearer = 'DRIVER' THEN COALESCE(c.driver_share, c.applied_amount)
                            WHEN c.bearer = 'SPLIT' THEN COALESCE(c.driver_share, 0) ELSE 0 END), 0)::float8 AS driver
        FROM go_ride_compensations c JOIN go_rides r ON r.id = c.ride_id
        WHERE c.created_at >= ${w.from} AND c.created_at < ${w.to} ${rideBranch}
        GROUP BY 1`,
        this.prisma.$queryRaw<{ wallets: number; balance: number; outstanding_due: number }[]>`
        SELECT COUNT(*)::int AS wallets, COALESCE(SUM(w.balance), 0)::float8 AS balance,
          COALESCE(SUM(w.outstanding_due), 0)::float8 AS outstanding_due
        FROM go_driver_wallets w JOIN go_driver_profiles d ON d.id = w.driver_id
        WHERE TRUE ${driverBranch}`,
        this.prisma.$queryRaw<{ bucket: string; rides: number; gross_fares: number }[]>`
        SELECT to_char(date_trunc(${unit}, r.completed_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}), 'YYYY-MM-DD"T"HH24:MI') AS bucket,
          COUNT(*)::int AS rides,
          COALESCE(SUM(r.gross_final_fare), 0)::float8 AS gross_fares
        FROM go_rides r
        WHERE r.status = 'COMPLETED' AND r.completed_at >= ${w.from} AND r.completed_at < ${w.to} ${rideBranch}
        GROUP BY 1 ORDER BY 1`,
        this.prisma.$queryRaw<
          { bucket: string; commission: number; penalties: number; incentives: number }[]
        >`
        SELECT to_char(date_trunc(${unit}, t.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}), 'YYYY-MM-DD"T"HH24:MI') AS bucket,
          COALESCE(SUM(CASE WHEN t.type = 'COMMISSION_DEDUCTION' THEN -(t.balance_after - t.balance_before) ELSE 0 END), 0)::float8 AS commission,
          COALESCE(SUM(CASE WHEN t.type = 'DRIVER_CANCEL_PENALTY' THEN -(t.balance_after - t.balance_before) ELSE 0 END), 0)::float8 AS penalties,
          COALESCE(SUM(CASE WHEN t.type = 'INCENTIVE_BONUS' THEN (t.balance_after - t.balance_before) ELSE 0 END), 0)::float8 AS incentives
        FROM go_driver_wallet_transactions t
        JOIN go_driver_profiles d ON d.id = t.driver_id
        WHERE t.created_at >= ${w.from} AND t.created_at < ${w.to}
          AND t.type IN ('COMMISSION_DEDUCTION', 'DRIVER_CANCEL_PENALTY', 'INCENTIVE_BONUS')
          ${driverBranch}
        GROUP BY 1 ORDER BY 1`,
        this.prisma.$queryRaw<
          { driver_id: string; full_name: string | null; phone: string | null; commission: number; tx_count: number }[]
        >`
        SELECT d.id AS driver_id, u.full_name, u.phone,
          COALESCE(SUM(-(t.balance_after - t.balance_before)), 0)::float8 AS commission,
          COUNT(*)::int AS tx_count
        FROM go_driver_wallet_transactions t
        JOIN go_driver_profiles d ON d.id = t.driver_id
        JOIN users u ON u.id = d.user_id
        WHERE t.type = 'COMMISSION_DEDUCTION'
          AND t.created_at >= ${w.from} AND t.created_at < ${w.to}
          ${driverBranch}
        GROUP BY d.id, u.full_name, u.phone
        ORDER BY commission DESC
        LIMIT 15`,
      ]);

    const effect = (type: string, reversedType?: string) =>
      driverTx
        .filter((t) => t.type === type && (reversedType === undefined || t.reversed_type === reversedType))
        .reduce((s, t) => s + t.effect, 0);
    const count = (type: string) => driverTx.filter((t) => t.type === type).reduce((s, t) => s + t.n, 0);
    const money = (n: number) => Math.round(n * 100) / 100;
    const commissionCollected = -effect('COMMISSION_DEDUCTION');
    const commissionReversed = effect('REVERSAL', 'COMMISSION_DEDUCTION');
    const netCommission = commissionCollected - commissionReversed;
    const penalties = -effect('DRIVER_CANCEL_PENALTY');
    const incentivesPaid = effect('INCENTIVE_BONUS');
    const beroyaComp = compensations.reduce((s, c) => s + c.beroya, 0);
    const companyRevenue = netCommission + penalties;
    const companyCosts = incentivesPaid + beroyaComp;
    const contribution = companyRevenue - companyCosts;
    const takeRatePct =
      fares[0].gross_fares > 0 ? Math.round((netCommission / fares[0].gross_fares) * 1000) / 10 : null;
    const comp = (bearer: string) => compensations.find((c) => c.bearer === bearer);
    const customerEffect = (type: string) => customerTx?.filter((t) => t.type === type).reduce((s, t) => s + t.effect, 0) ?? 0;
    const customerBalances = branchId
      ? null
      : await this.prisma.goCustomerWallet.aggregate({ _sum: { balance: true }, _count: { _all: true } });

    const buckets = new Map<
      string,
      { bucket: string; gross_fares: number; rides: number; commission: number; penalties: number; incentives: number }
    >();
    for (const row of fareSeries) {
      buckets.set(row.bucket, {
        bucket: row.bucket,
        gross_fares: money(row.gross_fares),
        rides: row.rides,
        commission: 0,
        penalties: 0,
        incentives: 0,
      });
    }
    for (const row of walletSeries) {
      const current = buckets.get(row.bucket) ?? {
        bucket: row.bucket,
        gross_fares: 0,
        rides: 0,
        commission: 0,
        penalties: 0,
        incentives: 0,
      };
      current.commission = money(row.commission);
      current.penalties = money(row.penalties);
      current.incentives = money(row.incentives);
      buckets.set(row.bucket, current);
    }

    return {
      generated_at: new Date().toISOString(),
      currency: 'SYP',
      timezone,
      branch_id: branchId ?? null,
      window: { from: w.from.toISOString(), to: w.to.toISOString() },
      ride_fares: {
        completed_rides: fares[0].rides,
        gross_fares: money(fares[0].gross_fares),
        discounts: money(fares[0].discounts),
        compensations_on_fares: money(fares[0].compensations),
        customer_payable: money(fares[0].customer_payable),
      },
      company_revenue: {
        commission_collected: money(commissionCollected),
        commission_reversed: money(commissionReversed),
        net_commission: money(netCommission),
        commission_transactions: count('COMMISSION_DEDUCTION'),
        driver_cancel_penalties: money(penalties),
        total: money(companyRevenue),
      },
      company_costs: {
        incentives_paid: money(incentivesPaid),
        incentive_transactions: count('INCENTIVE_BONUS'),
        compensation_borne_by_beroya: money(beroyaComp),
        total: money(companyCosts),
      },
      result: {
        contribution: money(contribution),
        take_rate_pct: takeRatePct,
      },
      compensations: {
        total_applied: money(compensations.reduce((s, c) => s + c.applied, 0)),
        count: compensations.reduce((s, c) => s + c.n, 0),
        unallocated: money(comp('UNASSIGNED')?.applied ?? 0),
        driver_borne: money(compensations.reduce((s, c) => s + c.driver, 0)),
        driver_wallet_debits: money(-effect('COMPENSATION_BEARER')),
      },
      driver_wallet_movements: {
        top_ups: money(effect('TOP_UP')),
        pos_recharges: money(effect('POS_RECHARGE')),
        pos_recharges_count: count('POS_RECHARGE'),
        adjustments: money(effect('ADJUSTMENT')),
        reversals_total: money(effect('REVERSAL')),
        by_type: driverTx.map((t) => ({ type: t.type, reversed_type: t.reversed_type, count: t.n, wallet_effect: money(t.effect) })),
      },
      customer_wallet_movements: customerTx
        ? {
            ride_payments: money(-customerEffect('RIDE_PAYMENT')),
            ride_refunds: money(customerEffect('RIDE_REFUND')),
            top_ups: money(customerEffect('TOP_UP')),
          }
        : null,
      balances_now: {
        driver_prepaid_balance: money(balances[0].balance),
        driver_wallets: balances[0].wallets,
        driver_outstanding_due: money(balances[0].outstanding_due),
        customer_wallet_balance: customerBalances ? money(Number(customerBalances._sum.balance ?? 0)) : null,
        customer_wallets: customerBalances?._count._all ?? null,
      },
      series: {
        unit,
        timezone,
        points: [...buckets.values()].sort((a, b) => a.bucket.localeCompare(b.bucket)),
      },
      top_commission_drivers: topDrivers.map((row) => ({
        driver_id: row.driver_id,
        full_name: row.full_name,
        phone: row.phone,
        commission: money(row.commission),
        tx_count: row.tx_count,
      })),
      notes: {
        customer_wallets_scope: branchId ? 'NOT_BRANCH_SCOPED' : 'ALL',
        gross_fares_are_not_revenue: true,
      },
    };
  }

  async exportFinanceCsv(
    actor: AuthUser,
    q: { branch_id?: string; from?: string; to?: string; lang?: string },
  ) {
    const data = await this.finance(actor, q);
    return buildFinanceCsv(data, q.lang);
  }

  // ---------- Alert engine ----------

  async evaluateAlerts(now = new Date()) {
    const cfg = await this.getConfig();
    if (!cfg.alerts_enabled) return { skipped: true };
    const raised: string[] = [];
    const branches = await this.radar.activeBranchIds();
    const window = this.radar.liveWindow(now);

    for (const branchId of branches) {
      const snap = await this.radar.snapshot(branchId, window, RADAR_DEFAULT_RESOLUTION, now);
      const breaches = coverageBreaches(
        snap.cells.map((c) => ({ cell: c.cell, unassigned: c.live.unassigned, available_drivers: c.live.available_drivers })),
        cfg.coverage_min_unassigned,
      );
      for (const b of breaches) {
        const a = await this.alerts.raise({
          branch_id: branchId,
          type: GoOperationalAlertType.DRIVER_COVERAGE_LOW,
          severity: b.severity,
          h3_cell: b.cell,
          measured_value: b.unassigned,
          threshold: cfg.coverage_min_unassigned,
          dedupe_key: `coverage:${branchId}:${b.cell}`,
          dedupe_minutes: cfg.dedupe_minutes,
          metadata: { available_nearby: b.available_nearby, snapshot_at: snap.generated_at },
        });
        raised.push(a.id);
      }
      await this.autoResolveArea(
        branchId,
        GoOperationalAlertType.DRIVER_COVERAGE_LOW,
        new Set(breaches.map((b) => b.cell)),
      );

      const cohortWindow = { from: new Date(now.getTime() - cfg.cancellation_window_minutes * 60_000), to: now };
      const c = this.cohortView(await this.cohort(branchId, cohortWindow));
      const rate = cancellationRate({ cancelled: c.cancelled, finished: c.finished }, cfg.cancellation_min_rides);
      const severity = rate == null ? null : cancellationSeverity(rate, Number(cfg.cancellation_rate_pct));
      if (rate != null && severity) {
        const a = await this.alerts.raise({
          branch_id: branchId,
          type: GoOperationalAlertType.CANCELLATION_RATE_HIGH,
          severity,
          measured_value: rate,
          threshold: Number(cfg.cancellation_rate_pct),
          dedupe_key: `cancel_rate:${branchId}`,
          dedupe_minutes: cfg.dedupe_minutes,
          metadata: { cancelled: c.cancelled, finished: c.finished, window_minutes: cfg.cancellation_window_minutes },
        });
        raised.push(a.id);
      }
    }

    const searching = await this.prisma.goRide.findMany({
      where: {
        status: GoRideStatus.SEARCHING,
        type: GoRideType.IMMEDIATE,
        created_at: { lte: new Date(now.getTime() - cfg.assignment_delay_seconds * 1000) },
      },
      select: { id: true, branch_id: true, created_at: true, public_number: true, pickup_h3: true },
      take: 500,
    });
    for (const r of searching) {
      const d = assignmentDelay(r.created_at, now, cfg.assignment_delay_seconds);
      if (!d) continue;
      const a = await this.alerts.raise({
        ride_id: r.id,
        branch_id: r.branch_id,
        type: GoOperationalAlertType.ASSIGNMENT_DELAYED,
        severity: d.severity,
        h3_cell: r.pickup_h3 || null,
        measured_value: d.waited_sec,
        threshold: cfg.assignment_delay_seconds,
        dedupe_key: `assign:${r.id}`,
        dedupe_minutes: cfg.dedupe_minutes,
        metadata: { public_number: r.public_number },
      });
      raised.push(a.id);
    }

    const inProgress = await this.prisma.goRide.findMany({
      where: { status: GoRideStatus.IN_PROGRESS, started_at: { not: null }, estimated_duration_sec: { gt: 0 } },
      select: { id: true, branch_id: true, started_at: true, estimated_duration_sec: true, public_number: true },
      take: 1000,
    });
    for (const r of inProgress) {
      const d = rideDelay(r.started_at, r.estimated_duration_sec, now, Number(cfg.ride_delay_factor), cfg.ride_delay_min_extra_seconds);
      if (!d) continue;
      const a = await this.alerts.raise({
        ride_id: r.id,
        branch_id: r.branch_id,
        type: GoOperationalAlertType.RIDE_DELAYED,
        severity: GoAlertSeverity.WARNING,
        measured_value: d.elapsed_sec,
        threshold: d.limit_sec,
        dedupe_key: `delay:${r.id}`,
        dedupe_minutes: cfg.dedupe_minutes,
        metadata: { public_number: r.public_number, estimated_sec: d.estimated_sec },
      });
      raised.push(a.id);
    }

    await this.autoResolveRideAlerts(GoOperationalAlertType.ASSIGNMENT_DELAYED, GoRideStatus.SEARCHING);
    await this.autoResolveRideAlerts(GoOperationalAlertType.RIDE_DELAYED, GoRideStatus.IN_PROGRESS);
    return { raised: raised.length };
  }

  /** Area alerts whose cell no longer breaches are closed automatically. */
  private async autoResolveArea(branchId: string, type: GoOperationalAlertType, stillBreaching: Set<string>) {
    const open = await this.prisma.goOperationalAlert.findMany({
      where: {
        branch_id: branchId,
        type,
        status: { in: [GoOperationalAlertStatus.OPEN, GoOperationalAlertStatus.CLAIMED] },
      },
      select: { id: true, h3_cell: true },
    });
    for (const a of open) {
      if (a.h3_cell && stillBreaching.has(a.h3_cell)) continue;
      await this.closeAuto(a.id, branchId, type);
    }
  }

  /** Ride alerts close once the ride has left the status that made it alert-worthy. */
  private async autoResolveRideAlerts(type: GoOperationalAlertType, whileStatus: GoRideStatus) {
    const open = await this.prisma.goOperationalAlert.findMany({
      where: {
        type,
        status: { in: [GoOperationalAlertStatus.OPEN, GoOperationalAlertStatus.CLAIMED] },
        ride: { status: { not: whileStatus } },
      },
      select: { id: true, branch_id: true },
      take: 500,
    });
    for (const a of open) await this.closeAuto(a.id, a.branch_id, type);
  }

  private async closeAuto(alertId: string, branchId: string, type: GoOperationalAlertType) {
    const res = await this.prisma.goOperationalAlert.updateMany({
      where: { id: alertId, status: { not: GoOperationalAlertStatus.RESOLVED } },
      data: { status: GoOperationalAlertStatus.RESOLVED, resolved_at: new Date(), auto_resolved: true },
    });
    if (res.count) this.realtime.emitToStaff(branchId, 'alert.resolved', { alert_id: alertId, auto_resolved: true, type });
  }
}

function jsonSafe(v: unknown) {
  return JSON.parse(JSON.stringify(v)) as unknown;
}
