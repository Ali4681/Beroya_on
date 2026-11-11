import { gridDisk } from 'h3-js';
import { GoAlertSeverity } from '@/generated/prisma/client';

export type CoverageCell = { cell: string; unassigned: number; available_drivers: number };

export type CoverageBreach = {
  cell: string;
  unassigned: number;
  available_nearby: number;
  severity: GoAlertSeverity;
};

/**
 * A: an area has at least `minUnassigned` waiting requests and more of them than available drivers
 * in the area plus its adjacent ring (drivers one cell away can still reach the pickup quickly).
 */
export function coverageBreaches(cells: CoverageCell[], minUnassigned: number): CoverageBreach[] {
  const availableBy = new Map(cells.map((c) => [c.cell, c.available_drivers]));
  const out: CoverageBreach[] = [];
  for (const c of cells) {
    if (c.unassigned < Math.max(1, minUnassigned)) continue;
    const nearby = gridDisk(c.cell, 1).reduce((sum, n) => sum + (availableBy.get(n) ?? 0), 0);
    if (c.unassigned <= nearby) continue;
    out.push({
      cell: c.cell,
      unassigned: c.unassigned,
      available_nearby: nearby,
      severity: c.unassigned >= minUnassigned * 2 && nearby === 0 ? GoAlertSeverity.CRITICAL : GoAlertSeverity.WARNING,
    });
  }
  return out;
}

/** B: seconds an immediate request has been searching, or null when it is still under the threshold. */
export function assignmentDelay(createdAt: Date, now: Date, thresholdSec: number) {
  const waited = Math.floor((now.getTime() - createdAt.getTime()) / 1000);
  if (waited < thresholdSec) return null;
  return {
    waited_sec: waited,
    severity: waited >= thresholdSec * 2 ? GoAlertSeverity.CRITICAL : GoAlertSeverity.WARNING,
  };
}

/**
 * C: an in-progress ride is delayed when elapsed > estimate × factor AND elapsed > estimate + minExtra.
 * Rides without a recorded estimate or start are never flagged.
 */
export function rideDelay(
  startedAt: Date | null,
  estimatedSec: number | null,
  now: Date,
  factor: number,
  minExtraSec: number,
) {
  if (!startedAt || !estimatedSec || estimatedSec <= 0) return null;
  const elapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
  const limit = Math.max(Math.ceil(estimatedSec * factor), estimatedSec + minExtraSec);
  if (elapsed <= limit) return null;
  return { elapsed_sec: elapsed, estimated_sec: estimatedSec, limit_sec: limit };
}

export type CancellationCohort = { cancelled: number; finished: number };

/** E: cancelled ÷ finished among rides requested in the window. Null below the minimum sample. */
export function cancellationRate(c: CancellationCohort, minRides: number): number | null {
  if (c.finished < Math.max(1, minRides)) return null;
  return Math.round((c.cancelled / c.finished) * 1000) / 10;
}

export function cancellationSeverity(ratePct: number, thresholdPct: number): GoAlertSeverity | null {
  if (ratePct < thresholdPct) return null;
  return ratePct >= thresholdPct * 1.5 ? GoAlertSeverity.CRITICAL : GoAlertSeverity.WARNING;
}

export function pctOrNull(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export function deltaPct(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
