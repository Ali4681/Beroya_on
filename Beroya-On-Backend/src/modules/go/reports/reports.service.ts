import { Injectable } from '@nestjs/common';
import {
  GoOperationalAlertStatus,
  GoOperationalAlertType,
  Prisma,
} from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BranchScopeService } from '../../../common/auth/branch-scope.service';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RadarService } from '../radar/radar.service';
import {
  alertLabel,
  asciiFilename,
  contentDisposition,
  csvBlank,
  csvExcelSepHint,
  csvPair,
  csvRow,
  csvSection,
  formatExportBucket,
  formatExportDate,
  localizedFilename,
  reportCopy,
  resolveReportLang,
  severityLabel,
  type ReportLang,
} from './reports-export';
import {
  cohortView,
  offerAcceptance,
  rideCohort,
  rideSeries,
  type ReportWindow,
} from './ride-window-metrics';

const DAY_MS = 24 * 3600 * 1000;
const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly radar: RadarService,
  ) {}

  resolveReportWindow(from?: string, to?: string, now = new Date()): ReportWindow {
    const end = to ? new Date(to) : now;
    const start = from ? new Date(from) : new Date(end.getTime() - DEFAULT_DAYS * DAY_MS);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'from/to must be valid ISO dates');
    }
    if (start >= end) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'from must be before to');
    }
    if (end.getTime() - start.getTime() > MAX_DAYS * DAY_MS) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, `Time range may not exceed ${MAX_DAYS} days`);
    }
    return { from: start, to: end };
  }

  private async context(actor: AuthUser, q: { branch_id?: string; from?: string; to?: string }) {
    const branchId = this.branchScope.resolveFilter(actor, q.branch_id);
    const window = this.resolveReportWindow(q.from, q.to);
    const timezone = await this.radar.timezone();
    return { branchId, window, timezone };
  }

  async overview(actor: AuthUser, q: { branch_id?: string; from?: string; to?: string }) {
    const { branchId, window, timezone } = await this.context(actor, q);
    const [cohort, acceptance, series] = await Promise.all([
      rideCohort(this.prisma, branchId, window),
      offerAcceptance(this.prisma, branchId, window),
      rideSeries(this.prisma, branchId, window, timezone),
    ]);
    const period = cohortView(cohort);
    return {
      generated_at: new Date().toISOString(),
      branch_id: branchId ?? null,
      timezone,
      window: { from: window.from.toISOString(), to: window.to.toISOString() },
      period,
      acceptance,
      series,
    };
  }

  async cancellations(actor: AuthUser, q: { branch_id?: string; from?: string; to?: string }) {
    const { branchId, window, timezone } = await this.context(actor, q);
    const [cohort, series] = await Promise.all([
      rideCohort(this.prisma, branchId, window),
      rideSeries(this.prisma, branchId, window, timezone),
    ]);
    const period = cohortView(cohort);
    return {
      generated_at: new Date().toISOString(),
      branch_id: branchId ?? null,
      timezone,
      window: { from: window.from.toISOString(), to: window.to.toISOString() },
      by_actor: {
        customer: period.cancelled_by_customer,
        driver: period.cancelled_by_driver,
        staff: period.cancelled_by_staff,
        total: period.cancelled,
      },
      cancellation_rate_pct: period.cancellation_rate_pct,
      finished: period.finished,
      series: {
        unit: series.unit,
        timezone: series.timezone,
        points: series.points.map((p) => ({ bucket: p.bucket, cancelled: p.cancelled, requests: p.requests })),
      },
    };
  }

  async assignment(actor: AuthUser, q: { branch_id?: string; from?: string; to?: string }) {
    const { branchId, window, timezone } = await this.context(actor, q);
    const cohort = await rideCohort(this.prisma, branchId, window);
    return {
      generated_at: new Date().toISOString(),
      branch_id: branchId ?? null,
      timezone,
      window: { from: window.from.toISOString(), to: window.to.toISOString() },
      avg_assignment_sec: cohort.avg_assignment_sec,
      p50_assignment_sec: cohort.p50_assignment_sec,
      p90_assignment_sec: cohort.p90_assignment_sec,
      avg_pickup_wait_sec: cohort.avg_pickup_wait_sec,
      assignment_samples: cohort.assignment_samples,
    };
  }

  async coverage(actor: AuthUser, q: { branch_id?: string; from?: string; to?: string }) {
    const { branchId, window, timezone } = await this.context(actor, q);

    const coverageTypes = [
      GoOperationalAlertType.DRIVER_COVERAGE_LOW,
      GoOperationalAlertType.ASSIGNMENT_DELAYED,
      GoOperationalAlertType.CANCELLATION_RATE_HIGH,
    ];

    const [alerts, onlineHours, openNow] = await Promise.all([
      this.prisma.goOperationalAlert.groupBy({
        by: ['type', 'severity'],
        where: {
          type: { in: coverageTypes },
          started_at: { gte: window.from, lt: window.to },
          ...(branchId ? { branch_id: branchId } : {}),
        },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ online_hours: number | null; sessions: number }[]>`
        SELECT
          (SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(ended_at, ${window.to}), ${window.to})
            - GREATEST(started_at, ${window.from})))) / 3600.0)::float8 AS online_hours,
          COUNT(*)::int AS sessions
        FROM go_driver_online_sessions s
        JOIN go_driver_profiles d ON d.id = s.driver_id
        WHERE s.started_at < ${window.to}
          AND (s.ended_at IS NULL OR s.ended_at > ${window.from})
          ${branchId ? Prisma.sql`AND d.branch_id = ${branchId}` : Prisma.empty}`,
      this.prisma.goOperationalAlert.count({
        where: {
          type: GoOperationalAlertType.DRIVER_COVERAGE_LOW,
          status: { in: [GoOperationalAlertStatus.OPEN, GoOperationalAlertStatus.CLAIMED] },
          ...(branchId ? { branch_id: branchId } : {}),
        },
      }),
    ]);

    const byType = alerts.map((a) => ({
      type: a.type,
      severity: a.severity,
      count: a._count._all,
    }));

    const hours = onlineHours[0];
    return {
      generated_at: new Date().toISOString(),
      branch_id: branchId ?? null,
      timezone,
      window: { from: window.from.toISOString(), to: window.to.toISOString() },
      coverage_alerts_open_now: openNow,
      alerts_in_window: byType,
      coverage_alert_count: byType
        .filter((a) => a.type === GoOperationalAlertType.DRIVER_COVERAGE_LOW)
        .reduce((sum, a) => sum + a.count, 0),
      driver_online_hours: hours?.online_hours == null ? null : Math.round(hours.online_hours * 10) / 10,
      online_sessions: hours?.sessions ?? 0,
    };
  }

  async drivers(
    actor: AuthUser,
    q: { branch_id?: string; from?: string; to?: string; sort?: string; limit?: number },
  ) {
    const { branchId, window, timezone } = await this.context(actor, q);
    const take = Math.min(100, Math.max(1, Math.trunc(Number(q.limit)) || 50));

    const rows = await this.prisma.$queryRaw<
      {
        driver_id: string;
        full_name: string | null;
        phone: string | null;
        completed: number;
        cancelled_by_driver: number;
        accepted: number;
        declined: number;
        expired: number;
        avg_stars: number | null;
        rating_count: number;
      }[]
    >`
      WITH ride_stats AS (
        SELECT
          driver_id,
          COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
          COUNT(*) FILTER (WHERE status = 'CANCELLED_BY_DRIVER')::int AS cancelled_by_driver
        FROM go_rides
        WHERE replacement_of_ride_id IS NULL
          AND driver_id IS NOT NULL
          AND created_at >= ${window.from} AND created_at < ${window.to}
          ${branchId ? Prisma.sql`AND branch_id = ${branchId}` : Prisma.empty}
        GROUP BY driver_id
      ),
      offer_stats AS (
        SELECT
          o.driver_id,
          COUNT(*) FILTER (WHERE o.status = 'ACCEPTED')::int AS accepted,
          COUNT(*) FILTER (WHERE o.status = 'DECLINED')::int AS declined,
          COUNT(*) FILTER (WHERE o.status = 'EXPIRED')::int AS expired
        FROM go_ride_offers o
        JOIN go_rides r ON r.id = o.ride_id
        WHERE o.offered_at >= ${window.from} AND o.offered_at < ${window.to}
          ${branchId ? Prisma.sql`AND r.branch_id = ${branchId}` : Prisma.empty}
        GROUP BY o.driver_id
      ),
      rating_stats AS (
        SELECT
          d.id AS driver_id,
          AVG(rt.stars)::float8 AS avg_stars,
          COUNT(*)::int AS rating_count
        FROM go_ride_ratings rt
        JOIN go_driver_profiles d ON d.user_id = rt.to_user_id
        WHERE rt.direction = 'CUSTOMER_TO_DRIVER'
          AND rt.created_at >= ${window.from} AND rt.created_at < ${window.to}
          ${branchId ? Prisma.sql`AND d.branch_id = ${branchId}` : Prisma.empty}
        GROUP BY d.id
      )
      SELECT
        d.id AS driver_id,
        u.full_name,
        u.phone,
        COALESCE(rs.completed, 0)::int AS completed,
        COALESCE(rs.cancelled_by_driver, 0)::int AS cancelled_by_driver,
        COALESCE(os.accepted, 0)::int AS accepted,
        COALESCE(os.declined, 0)::int AS declined,
        COALESCE(os.expired, 0)::int AS expired,
        rt.avg_stars,
        COALESCE(rt.rating_count, 0)::int AS rating_count
      FROM go_driver_profiles d
      JOIN users u ON u.id = d.user_id
      LEFT JOIN ride_stats rs ON rs.driver_id = d.id
      LEFT JOIN offer_stats os ON os.driver_id = d.id
      LEFT JOIN rating_stats rt ON rt.driver_id = d.id
      WHERE u.is_active = true
        ${branchId ? Prisma.sql`AND d.branch_id = ${branchId}` : Prisma.empty}
        AND (
          COALESCE(rs.completed, 0) + COALESCE(rs.cancelled_by_driver, 0)
          + COALESCE(os.accepted, 0) + COALESCE(os.declined, 0) + COALESCE(os.expired, 0) > 0
        )
      ORDER BY COALESCE(rs.completed, 0) DESC, COALESCE(os.accepted, 0) DESC
      LIMIT ${take}`;

    const sort = q.sort === 'rating' ? 'rating' : q.sort === 'accepts' ? 'accepts' : 'completed';
    const items = [...rows]
      .map((row) => ({
        driver_id: row.driver_id,
        full_name: row.full_name,
        phone: row.phone,
        completed: row.completed,
        cancelled_by_driver: row.cancelled_by_driver,
        accepted: row.accepted,
        declined: row.declined,
        expired: row.expired,
        accept_rate_pct:
          row.accepted + row.declined + row.expired > 0
            ? Math.round((row.accepted / (row.accepted + row.declined + row.expired)) * 1000) / 10
            : null,
        avg_stars: row.avg_stars == null ? null : Math.round(row.avg_stars * 10) / 10,
        rating_count: row.rating_count,
      }))
      .sort((a, b) => {
        if (sort === 'rating') return (b.avg_stars ?? 0) - (a.avg_stars ?? 0);
        if (sort === 'accepts') return (b.accept_rate_pct ?? 0) - (a.accept_rate_pct ?? 0);
        return b.completed - a.completed;
      });

    return {
      generated_at: new Date().toISOString(),
      branch_id: branchId ?? null,
      timezone,
      window: { from: window.from.toISOString(), to: window.to.toISOString() },
      sort,
      items,
    };
  }

  async exportCsv(
    actor: AuthUser,
    q: { branch_id?: string; from?: string; to?: string; kind?: string; lang?: string },
  ): Promise<{ filename: string; filenameUtf8: string; disposition: string; body: string }> {
    const lang = resolveReportLang(q.lang);
    const kind = q.kind === 'drivers' ? 'drivers' : 'overview';
    if (kind === 'drivers') {
      return this.exportDriversCsv(actor, q, lang);
    }
    return this.exportOverviewCsv(actor, q, lang);
  }

  private async exportDriversCsv(
    actor: AuthUser,
    q: { branch_id?: string; from?: string; to?: string },
    lang: ReportLang,
  ) {
    const data = await this.drivers(actor, { ...q, limit: 100 });
    const L = reportCopy(lang);
    const lines: string[] = [
      csvExcelSepHint(),
      csvSection(L.brand),
      csvSection(L.driversTitle),
      csvBlank(),
      csvPair(L.generatedAt, formatExportDate(data.generated_at, lang)),
      csvPair(L.windowFrom, formatExportDate(data.window.from, lang)),
      csvPair(L.windowTo, formatExportDate(data.window.to, lang)),
      csvPair(L.timezone, data.timezone),
      csvPair(L.branch, data.branch_id ?? L.allBranches),
      csvBlank(),
      csvSection(L.driversTitle),
      csvRow([
        L.rank,
        L.fullName,
        L.phone,
        L.driverCompleted,
        L.driverCancelled,
        L.driverAccepted,
        L.driverDeclined,
        L.driverExpired,
        L.acceptRate,
        L.avgStars,
        L.ratingCount,
        L.driverId,
      ]),
      ...data.items.map((row, index) =>
        csvRow([
          index + 1,
          row.full_name,
          row.phone,
          row.completed,
          row.cancelled_by_driver,
          row.accepted,
          row.declined,
          row.expired,
          row.accept_rate_pct,
          row.avg_stars,
          row.rating_count,
          row.driver_id,
        ]),
      ),
    ];

    const ascii = asciiFilename('beroya-driver-performance', data.window.from, data.window.to);
    const utf8 = localizedFilename(L.filenameDrivers, data.window.from, data.window.to);
    return {
      filename: ascii,
      filenameUtf8: utf8,
      disposition: contentDisposition(ascii, utf8),
      body: `\uFEFF${lines.join('\r\n')}`,
    };
  }

  private async exportOverviewCsv(
    actor: AuthUser,
    q: { branch_id?: string; from?: string; to?: string },
    lang: ReportLang,
  ) {
    const [data, coverage] = await Promise.all([this.overview(actor, q), this.coverage(actor, q)]);
    const L = reportCopy(lang);
    const p = data.period;
    const lines: string[] = [
      csvExcelSepHint(),
      csvSection(L.brand),
      csvSection(L.overviewTitle),
      csvBlank(),
      csvPair(L.generatedAt, formatExportDate(data.generated_at, lang)),
      csvPair(L.windowFrom, formatExportDate(data.window.from, lang)),
      csvPair(L.windowTo, formatExportDate(data.window.to, lang)),
      csvPair(L.timezone, data.timezone),
      csvPair(L.branch, data.branch_id ?? L.allBranches),
      csvBlank(),
      csvSection(L.overviewSection),
      csvRow([L.metric, L.value]),
      csvPair(L.requests, p.requests),
      csvPair(L.completed, p.completed),
      csvPair(L.cancelled, p.cancelled),
      csvPair(L.finished, p.finished),
      csvPair(L.unserved, p.unserved),
      csvPair(L.completionRate, p.completion_rate_pct),
      csvPair(L.cancellationRate, p.cancellation_rate_pct),
      csvBlank(),
      csvSection(L.cancellationsSection),
      csvRow([L.metric, L.value]),
      csvPair(L.cancelledByCustomer, p.cancelled_by_customer),
      csvPair(L.cancelledByDriver, p.cancelled_by_driver),
      csvPair(L.cancelledByStaff, p.cancelled_by_staff),
      csvBlank(),
      csvSection(L.assignmentSection),
      csvRow([L.metric, L.value]),
      csvPair(L.avgAssignment, p.avg_assignment_sec),
      csvPair(L.p50Assignment, p.p50_assignment_sec),
      csvPair(L.p90Assignment, p.p90_assignment_sec),
      csvPair(L.assignmentSamples, p.assignment_samples),
      csvBlank(),
      csvSection(L.acceptanceSection),
      csvRow([L.metric, L.value]),
      csvPair(L.accepted, data.acceptance.accepted),
      csvPair(L.declined, data.acceptance.declined),
      csvPair(L.expired, data.acceptance.expired),
      csvPair(L.acceptanceRate, data.acceptance.rate_pct),
      csvBlank(),
      csvSection(L.coverageSection),
      csvRow([L.metric, L.value]),
      csvPair(L.coverageAlerts, coverage.coverage_alert_count),
      csvPair(L.coverageOpenNow, coverage.coverage_alerts_open_now),
      csvPair(L.onlineHours, coverage.driver_online_hours),
      csvPair(L.onlineSessions, coverage.online_sessions),
    ];

    if (coverage.alerts_in_window.length > 0) {
      lines.push(
        csvBlank(),
        csvSection(L.alertsSection),
        csvRow([L.alertType, L.alertSeverity, L.alertCount]),
        ...coverage.alerts_in_window
          .slice()
          .sort((a, b) => b.count - a.count)
          .map((a) => csvRow([alertLabel(lang, a.type), severityLabel(lang, a.severity), a.count])),
      );
    }

    if (data.series.points.length > 0) {
      const withTime = data.series.unit === 'hour';
      lines.push(
        csvBlank(),
        csvSection(L.seriesSection),
        csvRow([L.bucket, L.seriesRequests, L.seriesCompleted, L.seriesCancelled]),
        ...data.series.points.map((point) =>
          csvRow([
            formatExportBucket(point.bucket, lang, withTime),
            point.requests,
            point.completed,
            point.cancelled,
          ]),
        ),
      );
    }

    const ascii = asciiFilename('beroya-ops-overview', data.window.from, data.window.to);
    const utf8 = localizedFilename(L.filenameOverview, data.window.from, data.window.to);
    return {
      filename: ascii,
      filenameUtf8: utf8,
      disposition: contentDisposition(ascii, utf8),
      body: `\uFEFF${lines.join('\r\n')}`,
    };
  }
}
