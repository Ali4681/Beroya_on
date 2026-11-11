import { Injectable, Logger } from '@nestjs/common';
import { cellToChildren, getResolution, isValidCell } from 'h3-js';
import { GoDriverAvailability, GoRideStatus, GoRideType, Prisma } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BranchScopeService } from '../../../common/auth/branch-scope.service';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { GoConfigService } from '../config/config.service';
import { haversineM, isValidLatLng, safeH3Index } from '../dispatch/h3.util';
import {
  CellCounts,
  CellCountsRow,
  DemandLevel,
  RADAR_BASE_RESOLUTION,
  RADAR_DEFAULT_RESOLUTION,
  RadarResolution,
  ShortageFlags,
  avgAssignmentSec,
  cellGeometry,
  countByCell,
  demandLevels,
  heatSteps,
  emptyCounts,
  forecastStatus,
  forecastWindows,
  rollUp,
  seasonalAverage,
  shortageFlags,
  suggestAreas,
  trendPct,
  weeksOfHistory,
  type ForecastStatus,
} from './radar-math';

const SNAPSHOT_TTL_SEC = 30;
const MAX_WINDOW_MS = 31 * 24 * 3600 * 1000;
const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const FORECAST_HORIZON_MS = 60 * 60 * 1000;
/** Scheduled requests still SEARCHING count as waiting demand once they are this close to pickup. */
const SCHEDULED_WAITING_LEAD_MS = 60 * 60 * 1000;
const BACKFILL_BATCH = 2000;
/** Rows returned to a map layer. */
const MAP_LIMIT = 2000;
/** Rows read to count supply / waiting demand for a snapshot. */
const AGGREGATE_LIMIT = 50_000;
/** Marks a ride whose pickup has no usable coordinates so the backfill does not pick it again. */
const INVALID_CELL = '';

export const FORECAST_METHOD =
  'Seasonal average: per area, the mean number of requests in the same hour of the week over the previous 2–4 weeks.';

export type RadarWindow = { from: Date; to: Date };

export type RadarCell = {
  cell: string;
  resolution: number;
  center: { lat: number; lng: number };
  boundary: [number, number][];
  level: DemandLevel;
  /** Heat-map shade 0..5 of demand (requests in the window, or requests waiting now if more), relative to the returned area. */
  heat: number;
  observed: {
    requests: number;
    previous_requests: number;
    trend_pct: number | null;
    assigned: number;
    completed: number;
    unserved: number;
    cancelled_before_assignment: number;
    avg_assignment_sec: number | null;
  };
  live: { unassigned: number; available_drivers: number; busy_drivers: number; stale_drivers: number };
  forecast: { expected_requests: number; heat: number } | null;
  shortage: ShortageFlags;
};

export type RadarSnapshot = {
  generated_at: string;
  branch_id: string | null;
  resolution: number;
  window: { from: string; to: string };
  previous_window: { from: string; to: string };
  live_at: string;
  stale_location_seconds: number;
  forecast: ForecastStatus & { method: string; horizon: { from: string; to: string } };
  totals: {
    requests: number;
    previous_requests: number;
    trend_pct: number | null;
    assigned: number;
    completed: number;
    unserved: number;
    cancelled_before_assignment: number;
    avg_assignment_sec: number | null;
    unassigned_now: number;
    available_drivers: number;
    busy_drivers: number;
    stale_drivers: number;
    forecast_requests: number | null;
    shortage_cells: number;
    forecast_shortage_cells: number;
  };
  data_quality: { requests_without_location: number; requests_pending_index: number };
  cells: RadarCell[];
};

type DriverRow = {
  driver_id: string;
  availability: GoDriverAvailability;
  h3_index: string | null;
  last_lat: Prisma.Decimal | null;
  last_lng: Prisma.Decimal | null;
  last_location_at: Date | null;
  current_ride_id: string | null;
  driver: { branch_id: string | null; user: { full_name: string | null } };
};

type WaitingRow = {
  id: string;
  public_number: string;
  type: GoRideType;
  status: GoRideStatus;
  created_at: Date;
  scheduled_at: Date | null;
  pickup_lat: Prisma.Decimal;
  pickup_lng: Prisma.Decimal;
  pickup_h3: string | null;
  branch_id: string;
};

export function classifyDriver(row: Pick<DriverRow, 'availability' | 'current_ride_id' | 'last_location_at' | 'last_lat' | 'last_lng'>, staleBefore: Date) {
  const fresh = !!row.last_location_at && row.last_location_at >= staleBefore && row.last_lat != null && row.last_lng != null;
  if (!fresh) return 'stale' as const;
  if (row.availability === GoDriverAvailability.ONLINE && !row.current_ride_id) return 'available' as const;
  return 'busy' as const;
}

@Injectable()
export class RadarService {
  private readonly logger = new Logger(RadarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: GoConfigService,
    private readonly branchScope: BranchScopeService,
  ) {}

  // ---------- Inputs ----------

  resolveWindow(from?: string, to?: string, now = new Date()): RadarWindow {
    const end = to ? new Date(to) : now;
    const start = from ? new Date(from) : new Date(end.getTime() - DEFAULT_WINDOW_MS);
    if (Number.isNaN(end.getTime()) || Number.isNaN(start.getTime())) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'from / to must be ISO dates');
    }
    if (start >= end) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'from must be before to');
    if (end.getTime() - start.getTime() > MAX_WINDOW_MS) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Time range may not exceed 31 days');
    }
    return { from: start, to: end.getTime() > now.getTime() ? now : end };
  }

  async timezone(): Promise<string> {
    const cfg = await this.prisma.goIncentiveConfig.findUnique({ where: { id: 'default' }, select: { timezone: true } });
    return cfg?.timezone || 'Asia/Damascus';
  }

  // ---------- Aggregation (shared by desk + driver app) ----------

  /**
   * Requests per stored res-9 cell. A request is a ride row, excluding staff replacement rides.
   * Demand time is created_at for immediate rides and scheduled_at for scheduled ones.
   */
  async aggregate(branchId: string | undefined, window: RadarWindow, cells?: string[]): Promise<CellCountsRow[]> {
    const branch = branchId ? Prisma.sql`AND branch_id = ${branchId}` : Prisma.empty;
    const cellFilter = cells?.length ? Prisma.sql`AND pickup_h3 = ANY(${cells}::varchar[])` : Prisma.empty;
    return this.prisma.$queryRaw<CellCountsRow[]>`
      SELECT pickup_h3 AS h3,
        COUNT(*)::int AS requests,
        COUNT(*) FILTER (WHERE assigned_at IS NOT NULL)::int AS assigned,
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
        COUNT(*) FILTER (WHERE status = 'FAILED_NO_DRIVER')::int AS unserved,
        COUNT(*) FILTER (WHERE status = 'CANCELLED_BY_CUSTOMER' AND assigned_at IS NULL)::int AS cancelled_before_assignment,
        COALESCE(SUM(EXTRACT(EPOCH FROM (assigned_at - created_at)))
          FILTER (WHERE type = 'IMMEDIATE' AND assigned_at IS NOT NULL), 0)::float8 AS assignment_sec_sum,
        COUNT(*) FILTER (WHERE type = 'IMMEDIATE' AND assigned_at IS NOT NULL)::int AS assignment_samples
      FROM go_rides
      WHERE pickup_h3 IS NOT NULL
        AND replacement_of_ride_id IS NULL
        ${branch}
        ${cellFilter}
        AND (
          (type = 'IMMEDIATE' AND created_at >= ${window.from} AND created_at < ${window.to})
          OR (type = 'SCHEDULED' AND scheduled_at >= ${window.from} AND scheduled_at < ${window.to})
        )
      GROUP BY pickup_h3`;
  }

  private async pendingIndexCount(branchId: string | undefined, window: RadarWindow): Promise<number> {
    const branch = branchId ? Prisma.sql`AND branch_id = ${branchId}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM go_rides
      WHERE pickup_h3 IS NULL AND replacement_of_ride_id IS NULL ${branch}
        AND created_at >= ${window.from} AND created_at < ${window.to}`;
    return rows[0]?.n ?? 0;
  }

  private async earliestDemandAt(branchId: string | undefined): Promise<Date | null> {
    const branch = branchId ? Prisma.sql`AND branch_id = ${branchId}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ at: Date | null }[]>`
      SELECT MIN(created_at) AS at FROM go_rides WHERE replacement_of_ride_id IS NULL ${branch}`;
    return rows[0]?.at ?? null;
  }

  /** Last full 60 minutes, minute-aligned so the tick, desk and driver app share one cached snapshot. */
  liveWindow(now = new Date()): RadarWindow {
    const to = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
    return { from: new Date(to.getTime() - DEFAULT_WINDOW_MS), to };
  }

  async driverStates(branchId: string | undefined, bbox?: BBox, take = MAP_LIMIT): Promise<DriverRow[]> {
    return this.prisma.goDriverState.findMany({
      where: {
        availability: { in: [GoDriverAvailability.ONLINE, GoDriverAvailability.BUSY] },
        driver: {
          is_suspended: false,
          operational_blocked: false,
          user: { is_active: true },
          ...(branchId ? { branch_id: branchId } : {}),
        },
        ...(bbox
          ? {
              last_lat: { gte: bbox.min_lat, lte: bbox.max_lat },
              last_lng: { gte: bbox.min_lng, lte: bbox.max_lng },
            }
          : {}),
      },
      select: {
        driver_id: true,
        availability: true,
        h3_index: true,
        last_lat: true,
        last_lng: true,
        last_location_at: true,
        current_ride_id: true,
        driver: { select: { branch_id: true, user: { select: { full_name: true } } } },
      },
      take,
    });
  }

  /** SEARCHING requests: every immediate one, and scheduled ones whose pickup is within the next hour. */
  async waitingRequests(branchId: string | undefined, now = new Date(), cells?: string[], take = MAP_LIMIT): Promise<WaitingRow[]> {
    return this.prisma.goRide.findMany({
      where: {
        status: GoRideStatus.SEARCHING,
        replacement_of_ride_id: null,
        ...(branchId ? { branch_id: branchId } : {}),
        ...(cells?.length ? { pickup_h3: { in: cells } } : {}),
        OR: [
          { type: GoRideType.IMMEDIATE },
          { type: GoRideType.SCHEDULED, scheduled_at: { lte: new Date(now.getTime() + SCHEDULED_WAITING_LEAD_MS) } },
        ],
      },
      select: {
        id: true,
        public_number: true,
        type: true,
        status: true,
        created_at: true,
        scheduled_at: true,
        pickup_lat: true,
        pickup_lng: true,
        pickup_h3: true,
        branch_id: true,
      },
      orderBy: { created_at: 'asc' },
      take,
    });
  }

  /**
   * One computation used by the desk map, the Command Center, the driver Radar and the alert engine.
   * Cached for 30 s per (branch, resolution, window rounded to the minute).
   */
  async snapshot(branchId: string | undefined, window: RadarWindow, res: RadarResolution, now = new Date()): Promise<RadarSnapshot> {
    const minute = (d: Date) => Math.floor(d.getTime() / 60_000);
    const key = `radar:snap:${branchId ?? 'all'}:${res}:${minute(window.from)}:${minute(window.to)}`;
    const cached = await this.redis.get(key);
    if (cached) {
      try {
        return JSON.parse(cached) as RadarSnapshot;
      } catch {
        /* recompute */
      }
    }
    const snap = await this.compute(branchId, window, res, now);
    await this.redis.set(key, JSON.stringify(snap), SNAPSHOT_TTL_SEC);
    return snap;
  }

  private async compute(branchId: string | undefined, window: RadarWindow, res: RadarResolution, now: Date): Promise<RadarSnapshot> {
    const len = window.to.getTime() - window.from.getTime();
    const previous: RadarWindow = { from: new Date(window.from.getTime() - len), to: window.from };
    const horizon = { from: now, to: new Date(now.getTime() + FORECAST_HORIZON_MS) };
    const dispatch = await this.config.getDispatch();
    const staleBefore = new Date(now.getTime() - dispatch.stale_location_seconds * 1000);

    const [currentRows, previousRows, pending, earliest, drivers, waiting] = await Promise.all([
      this.aggregate(branchId, window),
      this.aggregate(branchId, previous),
      this.pendingIndexCount(branchId, window),
      this.earliestDemandAt(branchId),
      this.driverStates(branchId, undefined, AGGREGATE_LIMIT),
      this.waitingRequests(branchId, now, undefined, AGGREGATE_LIMIT),
    ]);

    const weeksUsed = weeksOfHistory(earliest, horizon.from);
    const weeklyRows = weeksUsed
      ? await Promise.all(forecastWindows(horizon.from, horizon.to, weeksUsed).map((w) => this.aggregate(branchId, w)))
      : [];
    const weekly = weeklyRows.map((rows) => {
      const { cells } = rollUp(rows, res);
      return new Map([...cells].map(([cell, c]) => [cell, c.requests]));
    });
    const samples = weekly.reduce((sum, m) => sum + [...m.values()].reduce((a, b) => a + b, 0), 0);
    const fStatus = forecastStatus(weeksUsed, samples);
    const forecast = fStatus.status === 'ok' ? seasonalAverage(weekly, weeksUsed) : new Map<string, number>();

    const current = rollUp(currentRows, res);
    const prev = rollUp(previousRows, res);

    const available: (string | null)[] = [];
    const busy: (string | null)[] = [];
    const stale: (string | null)[] = [];
    for (const d of drivers) {
      const cell = d.h3_index ?? safeH3Index(d.last_lat, d.last_lng);
      const kind = classifyDriver(d, staleBefore);
      (kind === 'available' ? available : kind === 'busy' ? busy : stale).push(cell);
    }
    const availableBy = countByCell(available, res);
    const busyBy = countByCell(busy, res);
    const staleBy = countByCell(stale, res);
    const waitingBy = countByCell(
      waiting.map((r) => r.pickup_h3 || safeH3Index(r.pickup_lat, r.pickup_lng)),
      res,
    );

    const allCells = new Set<string>([
      ...current.cells.keys(),
      ...prev.cells.keys(),
      ...availableBy.keys(),
      ...busyBy.keys(),
      ...staleBy.keys(),
      ...waitingBy.keys(),
      ...[...forecast].filter(([, n]) => n > 0).map(([c]) => c),
    ]);
    const requestsBy = new Map([...allCells].map((c) => [c, current.cells.get(c)?.requests ?? 0]));
    const levels = demandLevels(requestsBy);
    const heat = heatSteps(new Map([...allCells].map((c) => [c, Math.max(requestsBy.get(c) ?? 0, waitingBy.get(c) ?? 0)])));
    const forecastHeat = heatSteps(new Map([...allCells].map((c) => [c, forecast.get(c) ?? 0])));

    const cells: RadarCell[] = [...allCells].map((cell) => {
      const c = current.cells.get(cell) ?? emptyCounts();
      const p = prev.cells.get(cell) ?? emptyCounts();
      const unassigned = waitingBy.get(cell) ?? 0;
      const availableDrivers = availableBy.get(cell) ?? 0;
      const f = fStatus.status === 'ok' ? (forecast.get(cell) ?? 0) : null;
      return {
        cell,
        resolution: res,
        ...cellGeometry(cell),
        level: levels.get(cell) ?? 'none',
        heat: heat.get(cell) ?? 0,
        observed: {
          requests: c.requests,
          previous_requests: p.requests,
          trend_pct: trendPct(c.requests, p.requests),
          assigned: c.assigned,
          completed: c.completed,
          unserved: c.unserved,
          cancelled_before_assignment: c.cancelled_before_assignment,
          avg_assignment_sec: avgAssignmentSec(c),
        },
        live: {
          unassigned,
          available_drivers: availableDrivers,
          busy_drivers: busyBy.get(cell) ?? 0,
          stale_drivers: staleBy.get(cell) ?? 0,
        },
        forecast: f == null ? null : { expected_requests: f, heat: forecastHeat.get(cell) ?? 0 },
        shortage: shortageFlags(unassigned, availableDrivers, f),
      };
    });
    cells.sort((a, b) => b.observed.requests - a.observed.requests || b.live.unassigned - a.live.unassigned);

    const sum = (m: Map<string, CellCounts>) => {
      const t = emptyCounts();
      for (const c of m.values()) {
        t.requests += c.requests;
        t.assigned += c.assigned;
        t.completed += c.completed;
        t.unserved += c.unserved;
        t.cancelled_before_assignment += c.cancelled_before_assignment;
        t.assignment_sec_sum += c.assignment_sec_sum;
        t.assignment_samples += c.assignment_samples;
      }
      return t;
    };
    const tc = sum(current.cells);
    const tp = sum(prev.cells);

    return {
      generated_at: new Date().toISOString(),
      branch_id: branchId ?? null,
      resolution: res,
      window: { from: window.from.toISOString(), to: window.to.toISOString() },
      previous_window: { from: previous.from.toISOString(), to: previous.to.toISOString() },
      live_at: now.toISOString(),
      stale_location_seconds: dispatch.stale_location_seconds,
      forecast: {
        ...fStatus,
        method: FORECAST_METHOD,
        horizon: { from: horizon.from.toISOString(), to: horizon.to.toISOString() },
      },
      totals: {
        requests: tc.requests,
        previous_requests: tp.requests,
        trend_pct: trendPct(tc.requests, tp.requests),
        assigned: tc.assigned,
        completed: tc.completed,
        unserved: tc.unserved,
        cancelled_before_assignment: tc.cancelled_before_assignment,
        avg_assignment_sec: avgAssignmentSec(tc),
        unassigned_now: waiting.length,
        available_drivers: available.length,
        busy_drivers: busy.length,
        stale_drivers: stale.length,
        forecast_requests:
          fStatus.status === 'ok' ? Math.round([...forecast.values()].reduce((a, b) => a + b, 0) * 100) / 100 : null,
        shortage_cells: cells.filter((c) => c.shortage.actual).length,
        forecast_shortage_cells: cells.filter((c) => c.shortage.forecast).length,
      },
      data_quality: {
        requests_without_location: current.dropped,
        requests_pending_index: pending,
      },
      cells,
    };
  }

  // ---------- Staff API ----------

  async staffSnapshot(actor: AuthUser, q: RadarQuery) {
    const branchId = this.branchScope.resolveFilter(actor, q.branch_id);
    const window = this.resolveWindow(q.from, q.to);
    return this.snapshot(branchId, window, q.resolution ?? RADAR_DEFAULT_RESOLUTION);
  }

  async staffCell(actor: AuthUser, cell: string, q: RadarQuery) {
    if (!isValidCell(cell)) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Invalid H3 cell');
    const res = getResolution(cell);
    if (res > RADAR_BASE_RESOLUTION || res < 5) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Cell resolution must be between 5 and 9');
    }
    const branchId = this.branchScope.resolveFilter(actor, q.branch_id);
    const window = this.resolveWindow(q.from, q.to);
    const children = res === RADAR_BASE_RESOLUTION ? [cell] : cellToChildren(cell, RADAR_BASE_RESOLUTION);
    const len = window.to.getTime() - window.from.getTime();
    const previous = { from: new Date(window.from.getTime() - len), to: window.from };
    const tz = await this.timezone();
    const branch = branchId ? Prisma.sql`AND branch_id = ${branchId}` : Prisma.empty;

    const [cur, prev, hourly, weekday, waiting, snap] = await Promise.all([
      this.aggregate(branchId, window, children),
      this.aggregate(branchId, previous, children),
      this.prisma.$queryRaw<{ bucket: number; requests: number }[]>`
        SELECT EXTRACT(HOUR FROM (demand_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz}))::int AS bucket, COUNT(*)::int AS requests
        FROM (
          SELECT CASE WHEN type = 'SCHEDULED' THEN scheduled_at ELSE created_at END AS demand_at
          FROM go_rides
          WHERE pickup_h3 = ANY(${children}::varchar[]) AND replacement_of_ride_id IS NULL ${branch}
            AND ((type = 'IMMEDIATE' AND created_at >= ${window.from} AND created_at < ${window.to})
              OR (type = 'SCHEDULED' AND scheduled_at >= ${window.from} AND scheduled_at < ${window.to}))
        ) d GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ bucket: number; requests: number }[]>`
        SELECT EXTRACT(ISODOW FROM (demand_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz}))::int AS bucket, COUNT(*)::int AS requests
        FROM (
          SELECT CASE WHEN type = 'SCHEDULED' THEN scheduled_at ELSE created_at END AS demand_at
          FROM go_rides
          WHERE pickup_h3 = ANY(${children}::varchar[]) AND replacement_of_ride_id IS NULL ${branch}
            AND ((type = 'IMMEDIATE' AND created_at >= ${window.from} AND created_at < ${window.to})
              OR (type = 'SCHEDULED' AND scheduled_at >= ${window.from} AND scheduled_at < ${window.to}))
        ) d GROUP BY 1 ORDER BY 1`,
      this.waitingRequests(branchId, new Date(), children),
      res === 7 || res === 8 ? this.snapshot(branchId, window, res as RadarResolution) : Promise.resolve(null),
    ]);
    const sumRows = (rows: CellCountsRow[]) =>
      rows.reduce((acc, r) => {
        acc.requests += r.requests;
        acc.assigned += r.assigned;
        acc.completed += r.completed;
        acc.unserved += r.unserved;
        acc.cancelled_before_assignment += r.cancelled_before_assignment;
        acc.assignment_sec_sum += r.assignment_sec_sum;
        acc.assignment_samples += r.assignment_samples;
        return acc;
      }, emptyCounts());
    const c = sumRows(cur);
    const p = sumRows(prev);
    const fromSnap = snap?.cells.find((x) => x.cell === cell) ?? null;
    const now = Date.now();
    return {
      cell,
      resolution: res,
      ...cellGeometry(cell),
      timezone: tz,
      window: { from: window.from.toISOString(), to: window.to.toISOString() },
      previous_window: { from: previous.from.toISOString(), to: previous.to.toISOString() },
      generated_at: new Date().toISOString(),
      observed: {
        requests: c.requests,
        previous_requests: p.requests,
        trend_pct: trendPct(c.requests, p.requests),
        assigned: c.assigned,
        completed: c.completed,
        unserved: c.unserved,
        cancelled_before_assignment: c.cancelled_before_assignment,
        avg_assignment_sec: avgAssignmentSec(c),
      },
      live: fromSnap?.live ?? null,
      forecast: fromSnap ? fromSnap.forecast : null,
      forecast_status: snap?.forecast ?? null,
      shortage: fromSnap?.shortage ?? null,
      by_hour: hourly,
      by_weekday: weekday,
      waiting_requests: waiting.map((r) => ({
        id: r.id,
        public_number: r.public_number,
        type: r.type,
        created_at: r.created_at,
        scheduled_at: r.scheduled_at,
        waiting_sec: Math.max(0, Math.round((now - r.created_at.getTime()) / 1000)),
      })),
    };
  }

  /** Map layer B: latest known position of online / busy drivers. Staleness is explicit, never hidden. */
  async staffDrivers(actor: AuthUser, q: RadarMapQuery) {
    const branchId = this.branchScope.resolveFilter(actor, q.branch_id);
    const dispatch = await this.config.getDispatch();
    const now = Date.now();
    const staleBefore = new Date(now - dispatch.stale_location_seconds * 1000);
    const rows = await this.driverStates(branchId, bboxOf(q));
    return {
      generated_at: new Date(now).toISOString(),
      stale_location_seconds: dispatch.stale_location_seconds,
      truncated: rows.length >= MAP_LIMIT,
      items: rows
        .filter((d) => d.last_lat != null && d.last_lng != null && isValidLatLng(d.last_lat, d.last_lng))
        .map((d) => {
          const kind = classifyDriver(d, staleBefore);
          return {
            driver_id: d.driver_id,
            name: d.driver.user.full_name,
            branch_id: d.driver.branch_id,
            availability: d.availability,
            state: kind,
            on_ride: !!d.current_ride_id,
            ride_id: d.current_ride_id,
            lat: Number(d.last_lat),
            lng: Number(d.last_lng),
            last_location_at: d.last_location_at,
            location_age_sec: d.last_location_at ? Math.round((now - d.last_location_at.getTime()) / 1000) : null,
          };
        }),
    };
  }

  /** Map layers C + D: active rides and waiting requests. No customer identity or phone. */
  async staffRides(actor: AuthUser, q: RadarMapQuery & { status?: GoRideStatus }) {
    const branchId = this.branchScope.resolveFilter(actor, q.branch_id);
    const bbox = bboxOf(q);
    const dispatch = await this.config.getDispatch();
    const now = Date.now();
    const staleBefore = new Date(now - dispatch.stale_location_seconds * 1000);
    const statuses = q.status ? [q.status] : RADAR_RIDE_STATUSES;
    const rows = await this.prisma.goRide.findMany({
      where: {
        status: { in: statuses },
        ...(branchId ? { branch_id: branchId } : {}),
        ...(bbox
          ? { pickup_lat: { gte: bbox.min_lat, lte: bbox.max_lat }, pickup_lng: { gte: bbox.min_lng, lte: bbox.max_lng } }
          : {}),
      },
      select: {
        id: true,
        public_number: true,
        status: true,
        type: true,
        branch_id: true,
        created_at: true,
        scheduled_at: true,
        assigned_at: true,
        started_at: true,
        pickup_lat: true,
        pickup_lng: true,
        original_destination_lat: true,
        original_destination_lng: true,
        estimated_duration_sec: true,
        driver: { select: { state: { select: { last_lat: true, last_lng: true, last_location_at: true } } } },
      },
      orderBy: { created_at: 'asc' },
      take: MAP_LIMIT,
    });
    return {
      generated_at: new Date(now).toISOString(),
      stale_location_seconds: dispatch.stale_location_seconds,
      truncated: rows.length >= MAP_LIMIT,
      items: rows
        .filter((r) => isValidLatLng(r.pickup_lat, r.pickup_lng))
        .map((r) => {
          const st = r.driver?.state;
          const driverFresh = !!st?.last_location_at && st.last_location_at >= staleBefore;
          return {
            id: r.id,
            public_number: r.public_number,
            status: r.status,
            type: r.type,
            branch_id: r.branch_id,
            created_at: r.created_at,
            scheduled_at: r.scheduled_at,
            assigned_at: r.assigned_at,
            started_at: r.started_at,
            waiting_sec:
              r.status === GoRideStatus.SEARCHING ? Math.max(0, Math.round((now - r.created_at.getTime()) / 1000)) : null,
            pickup: { lat: Number(r.pickup_lat), lng: Number(r.pickup_lng) },
            destination: isValidLatLng(r.original_destination_lat, r.original_destination_lng)
              ? { lat: Number(r.original_destination_lat), lng: Number(r.original_destination_lng) }
              : null,
            driver_location:
              st?.last_lat != null && st.last_lng != null
                ? {
                    lat: Number(st.last_lat),
                    lng: Number(st.last_lng),
                    last_location_at: st.last_location_at,
                    stale: !driverFresh,
                  }
                : null,
          };
        }),
    };
  }

  // ---------- Driver API ----------

  /**
   * PEERS-001 — nearby peer dots for the driver home map.
   * Privacy: lat/lng/on_ride only. No ids, names, phones, plates, or ride ids.
   */
  async driverPeers(user: AuthUser, q: DriverRadarQuery) {
    const allowed = await this.redis.incr(`radar:peers:rl:${user.id}:${Math.floor(Date.now() / 60_000)}`, 70);
    if (allowed > DRIVER_REQUESTS_PER_MINUTE) {
      throw new GoException(GoErrorCode.RATE_LIMITED, 'Radar peers refresh limit reached; try again in a minute');
    }
    const profile = await this.prisma.goDriverProfile.findUnique({
      where: { user_id: user.id },
      select: { id: true, branch_id: true, state: { select: { last_lat: true, last_lng: true } } },
    });
    if (!profile) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Driver profile not found');

    const center = this.resolveDriverRadarCenter(profile.state, q);
    const radiusM = Math.min(q.radius_m ?? DRIVER_DEFAULT_RADIUS_M, DRIVER_MAX_RADIUS_M);
    const dispatch = await this.config.getDispatch();
    const now = Date.now();
    const staleBefore = new Date(now - dispatch.stale_location_seconds * 1000);
    const bbox = radiusBBox(center.lat, center.lng, radiusM);
    const rows = await this.driverStates(profile.branch_id ?? undefined, bbox, MAP_LIMIT);

    const items: { lat: number; lng: number; on_ride: boolean }[] = [];
    let truncated = false;
    for (const d of rows) {
      if (d.driver_id === profile.id) continue;
      if (d.last_lat == null || d.last_lng == null || !isValidLatLng(d.last_lat, d.last_lng)) continue;
      if (classifyDriver(d, staleBefore) === 'stale') continue;
      const peer = { lat: Number(d.last_lat), lng: Number(d.last_lng) };
      if (haversineM(center, peer) > radiusM) continue;
      if (items.length >= PEER_MAP_LIMIT) {
        truncated = true;
        break;
      }
      items.push({ lat: peer.lat, lng: peer.lng, on_ride: !!d.current_ride_id });
    }

    return {
      generated_at: new Date(now).toISOString(),
      location: { lat: center.lat, lng: center.lng, source: center.source },
      radius_m: radiusM,
      stale_location_seconds: dispatch.stale_location_seconds,
      truncated,
      items,
    };
  }

  async driverRadar(user: AuthUser, q: DriverRadarQuery) {
    const allowed = await this.redis.incr(`radar:rl:${user.id}:${Math.floor(Date.now() / 60_000)}`, 70);
    if (allowed > DRIVER_REQUESTS_PER_MINUTE) {
      throw new GoException(GoErrorCode.RATE_LIMITED, 'Radar refresh limit reached; try again in a minute');
    }
    const profile = await this.prisma.goDriverProfile.findUnique({
      where: { user_id: user.id },
      select: { id: true, branch_id: true, state: { select: { last_lat: true, last_lng: true, last_location_at: true } } },
    });
    if (!profile) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Driver profile not found');

    const center = this.resolveDriverRadarCenter(profile.state, q);
    const lat = center.lat;
    const lng = center.lng;
    const fromQuery = center.source === 'request';
    const radiusM = Math.min(q.radius_m ?? DRIVER_DEFAULT_RADIUS_M, DRIVER_MAX_RADIUS_M);
    const now = new Date();
    const snap = await this.snapshot(profile.branch_id ?? undefined, this.liveWindow(now), RADAR_DEFAULT_RESOLUTION, now);
    const here = { lat, lng };
    const nearby = snap.cells.filter((c) => haversineM(here, c.center) <= radiusM);
    const suggestions = suggestAreas(
      nearby.map((c) => ({
        cell: c.cell,
        center: c.center,
        unassigned: c.live.unassigned,
        recent_requests: c.observed.requests,
        forecast: c.forecast?.expected_requests ?? null,
        available_drivers: c.live.available_drivers,
      })),
      here,
      { radiusM, limit: 3 },
    );
    return {
      generated_at: snap.generated_at,
      location: { lat, lng, source: fromQuery ? 'request' : 'last_reported' },
      radius_m: radiusM,
      resolution: snap.resolution,
      observed_window: snap.window,
      forecast: {
        status: snap.forecast.status,
        reason: snap.forecast.status === 'insufficient_data' ? snap.forecast.reason : null,
        horizon: snap.forecast.horizon,
        method: snap.forecast.method,
      },
      cells: nearby
        .filter((c) => c.observed.requests > 0 || c.live.unassigned > 0 || (c.forecast?.expected_requests ?? 0) > 0)
        .map((c) => ({
          cell: c.cell,
          center: c.center,
          boundary: c.boundary,
          level: c.level,
          heat: c.heat,
          forecast_heat: c.forecast?.heat ?? null,
          recent_requests: c.observed.requests,
          waiting_requests: c.live.unassigned,
          forecast_requests: c.forecast?.expected_requests ?? null,
          distance_m: Math.round(haversineM(here, c.center)),
        })),
      suggestions,
      notice: 'NO_GUARANTEE',
    };
  }

  private resolveDriverRadarCenter(
    state: { last_lat: Prisma.Decimal | null; last_lng: Prisma.Decimal | null } | null | undefined,
    q: DriverRadarQuery,
  ): { lat: number; lng: number; source: 'request' | 'last_reported' } {
    const fromQuery = q.lat != null && q.lng != null;
    const lat = fromQuery ? q.lat! : state?.last_lat != null ? Number(state.last_lat) : null;
    const lng = fromQuery ? q.lng! : state?.last_lng != null ? Number(state.last_lng) : null;
    if (lat == null || lng == null || !isValidLatLng(lat, lng)) {
      throw new GoException(
        GoErrorCode.VALIDATION_ERROR,
        'A valid lat/lng is required (send it or report a location first)',
      );
    }
    return { lat, lng, source: fromQuery ? 'request' : 'last_reported' };
  }

  // ---------- Background ----------

  /** Fills pickup_h3 for older rides in batches. Safe to rerun: only touches rows still NULL. */
  async backfillPickupCells(limit = BACKFILL_BATCH): Promise<number> {
    const rows = await this.prisma.goRide.findMany({
      where: { pickup_h3: null },
      select: { id: true, pickup_lat: true, pickup_lng: true },
      take: limit,
    });
    if (!rows.length) return 0;
    const ids = rows.map((r) => r.id);
    const cells = rows.map((r) => safeH3Index(r.pickup_lat, r.pickup_lng) ?? INVALID_CELL);
    await this.prisma.$executeRaw`
      UPDATE go_rides AS r SET pickup_h3 = v.h3
      FROM (SELECT unnest(${ids}::text[]) AS id, unnest(${cells}::text[]) AS h3) AS v
      WHERE r.id = v.id AND r.pickup_h3 IS NULL`;
    if (rows.length === limit) this.logger.log(`Radar backfill indexed ${rows.length} rides; more pending`);
    return rows.length;
  }

  async activeBranchIds(): Promise<string[]> {
    const rows = await this.prisma.goBranch.findMany({ where: { is_active: true }, select: { id: true } });
    return rows.map((r) => r.id);
  }
}

export const RADAR_RIDE_STATUSES: GoRideStatus[] = [
  GoRideStatus.SEARCHING,
  GoRideStatus.DRIVER_ASSIGNED,
  GoRideStatus.DRIVER_EN_ROUTE,
  GoRideStatus.ARRIVED,
  GoRideStatus.IN_PROGRESS,
];

const DRIVER_REQUESTS_PER_MINUTE = 30;
const DRIVER_DEFAULT_RADIUS_M = 5000;
const DRIVER_MAX_RADIUS_M = 10000;
/** Driver-facing peer dots — lower than staff MAP_LIMIT. */
const PEER_MAP_LIMIT = 200;

export type BBox = { min_lat: number; min_lng: number; max_lat: number; max_lng: number };

export type RadarQuery = { branch_id?: string; from?: string; to?: string; resolution?: RadarResolution };
export type RadarMapQuery = { branch_id?: string } & Partial<BBox>;
export type DriverRadarQuery = { lat?: number; lng?: number; radius_m?: number };

function bboxOf(q: Partial<BBox>): BBox | undefined {
  const { min_lat, min_lng, max_lat, max_lng } = q;
  if ([min_lat, min_lng, max_lat, max_lng].some((v) => v == null || !Number.isFinite(v))) return undefined;
  if (min_lat! > max_lat! || min_lng! > max_lng!) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Invalid viewport bounds');
  }
  return { min_lat: min_lat!, min_lng: min_lng!, max_lat: max_lat!, max_lng: max_lng! };
}

/** Rough bounding box for a radius query before exact haversine filter. */
function radiusBBox(lat: number, lng: number, radiusM: number): BBox {
  const degLat = radiusM / 111_320;
  const cos = Math.cos((lat * Math.PI) / 180);
  const degLng = radiusM / (111_320 * (Math.abs(cos) < 1e-6 ? 1e-6 : cos));
  return {
    min_lat: lat - degLat,
    max_lat: lat + degLat,
    min_lng: lng - degLng,
    max_lng: lng + degLng,
  };
}
