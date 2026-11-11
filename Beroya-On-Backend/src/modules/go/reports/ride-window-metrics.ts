import { Prisma } from '@/generated/prisma/client';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import { pctOrNull } from '../command-center/ops-rules';

export type ReportWindow = { from: Date; to: Date };

export type RideCohort = {
  requests: number;
  completed: number;
  cancelled_by_customer: number;
  cancelled_by_driver: number;
  cancelled_by_staff: number;
  no_show: number;
  unserved: number;
  interrupted: number;
  avg_assignment_sec: number | null;
  avg_pickup_wait_sec: number | null;
  assignment_samples: number;
  p50_assignment_sec: number | null;
  p90_assignment_sec: number | null;
};

export async function rideCohort(
  prisma: PrismaService,
  branchId: string | undefined,
  w: ReportWindow,
): Promise<RideCohort> {
  const branch = branchId ? Prisma.sql`AND branch_id = ${branchId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<
    {
      requests: number;
      completed: number;
      cancelled_by_customer: number;
      cancelled_by_driver: number;
      cancelled_by_staff: number;
      no_show: number;
      unserved: number;
      interrupted: number;
      avg_assignment_sec: number | null;
      avg_pickup_wait_sec: number | null;
      assignment_samples: number;
    }[]
  >`
    SELECT
      COUNT(*)::int AS requests,
      COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
      COUNT(*) FILTER (WHERE status = 'CANCELLED_BY_CUSTOMER')::int AS cancelled_by_customer,
      COUNT(*) FILTER (WHERE status = 'CANCELLED_BY_DRIVER')::int AS cancelled_by_driver,
      COUNT(*) FILTER (WHERE status = 'CANCELLED_BY_STAFF')::int AS cancelled_by_staff,
      COUNT(*) FILTER (WHERE status = 'NO_SHOW')::int AS no_show,
      COUNT(*) FILTER (WHERE status = 'FAILED_NO_DRIVER')::int AS unserved,
      COUNT(*) FILTER (WHERE status IN ('INTERRUPTED', 'REPLACED'))::int AS interrupted,
      (AVG(EXTRACT(EPOCH FROM (assigned_at - created_at)))
        FILTER (WHERE type = 'IMMEDIATE' AND assigned_at IS NOT NULL))::float8 AS avg_assignment_sec,
      (AVG(EXTRACT(EPOCH FROM (arrived_at - created_at)))
        FILTER (WHERE type = 'IMMEDIATE' AND arrived_at IS NOT NULL))::float8 AS avg_pickup_wait_sec,
      COUNT(*) FILTER (WHERE type = 'IMMEDIATE' AND assigned_at IS NOT NULL)::int AS assignment_samples
    FROM go_rides
    WHERE replacement_of_ride_id IS NULL ${branch}
      AND created_at >= ${w.from} AND created_at < ${w.to}`;

  const percentiles = await prisma.$queryRaw<{ p50: number | null; p90: number | null }[]>`
    SELECT
      (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY secs))::float8 AS p50,
      (PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY secs))::float8 AS p90
    FROM (
      SELECT EXTRACT(EPOCH FROM (assigned_at - created_at)) AS secs
      FROM go_rides
      WHERE replacement_of_ride_id IS NULL ${branch}
        AND created_at >= ${w.from} AND created_at < ${w.to}
        AND type = 'IMMEDIATE' AND assigned_at IS NOT NULL
    ) t`;

  const r = rows[0];
  const p = percentiles[0];
  const round = (v: number | null | undefined) => (v == null ? null : Math.round(v));
  return {
    ...r,
    avg_assignment_sec: round(r.avg_assignment_sec),
    avg_pickup_wait_sec: round(r.avg_pickup_wait_sec),
    p50_assignment_sec: round(p?.p50),
    p90_assignment_sec: round(p?.p90),
  };
}

export function cohortView(c: RideCohort) {
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

export async function rideSeries(
  prisma: PrismaService,
  branchId: string | undefined,
  w: ReportWindow,
  tz: string,
) {
  const unit = w.to.getTime() - w.from.getTime() <= 48 * 3600 * 1000 ? 'hour' : 'day';
  const branch = branchId ? Prisma.sql`AND branch_id = ${branchId}` : Prisma.empty;
  const points = await prisma.$queryRaw<
    { bucket: string; requests: number; completed: number; cancelled: number }[]
  >`
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

export async function offerAcceptance(
  prisma: PrismaService,
  branchId: string | undefined,
  w: ReportWindow,
) {
  const branch = branchId ? Prisma.sql`AND r.branch_id = ${branchId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ accepted: number; declined: number; expired: number }[]>`
    SELECT
      COUNT(*) FILTER (WHERE o.status = 'ACCEPTED')::int AS accepted,
      COUNT(*) FILTER (WHERE o.status = 'DECLINED')::int AS declined,
      COUNT(*) FILTER (WHERE o.status = 'EXPIRED')::int AS expired
    FROM go_ride_offers o JOIN go_rides r ON r.id = o.ride_id
    WHERE o.offered_at >= ${w.from} AND o.offered_at < ${w.to} ${branch}`;
  const a = rows[0];
  return { ...a, rate_pct: pctOrNull(a.accepted, a.accepted + a.declined + a.expired) };
}
