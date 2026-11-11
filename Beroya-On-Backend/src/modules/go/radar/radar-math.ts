import { cellToBoundary, cellToLatLng, cellToParent, getResolution, isValidCell } from 'h3-js';
import { haversineM } from '../dispatch/h3.util';

/** Rides and driver states are stored at H3 res 9; Radar displays res 7 (district) or 8 (neighbourhood). */
export const RADAR_BASE_RESOLUTION = 9;
export const RADAR_RESOLUTIONS = [7, 8] as const;
export type RadarResolution = (typeof RADAR_RESOLUTIONS)[number];
export const RADAR_DEFAULT_RESOLUTION: RadarResolution = 8;

/** Seasonal forecast looks back this many weeks at the same hour of the week. */
export const FORECAST_MAX_WEEKS = 4;
/** Fewer full weeks of history than this → no forecast. */
export const FORECAST_MIN_WEEKS = 2;
/** Fewer requests across all look-back windows than this → too sparse to forecast. */
export const FORECAST_MIN_SAMPLES = 5;

export type DemandLevel = 'high' | 'medium' | 'low' | 'none';

export type CellCounts = {
  requests: number;
  assigned: number;
  completed: number;
  unserved: number;
  cancelled_before_assignment: number;
  assignment_sec_sum: number;
  assignment_samples: number;
};

export type CellCountsRow = CellCounts & { h3: string };

export const emptyCounts = (): CellCounts => ({
  requests: 0,
  assigned: 0,
  completed: 0,
  unserved: 0,
  cancelled_before_assignment: 0,
  assignment_sec_sum: 0,
  assignment_samples: 0,
});

/** Parent of a stored cell at the display resolution, or null when the stored value is not a usable H3 index. */
export function parentCell(h3: string | null | undefined, res: number): string | null {
  if (!h3 || !isValidCell(h3)) return null;
  const own = getResolution(h3);
  if (own < res) return null;
  return own === res ? h3 : cellToParent(h3, res);
}

/** Sums res-9 rows into their parent cells. Invalid cells are dropped and counted. */
export function rollUp(rows: CellCountsRow[], res: number): { cells: Map<string, CellCounts>; dropped: number } {
  const cells = new Map<string, CellCounts>();
  let dropped = 0;
  for (const row of rows) {
    const parent = parentCell(row.h3, res);
    if (!parent) {
      dropped += row.requests;
      continue;
    }
    const acc = cells.get(parent) ?? emptyCounts();
    acc.requests += row.requests;
    acc.assigned += row.assigned;
    acc.completed += row.completed;
    acc.unserved += row.unserved;
    acc.cancelled_before_assignment += row.cancelled_before_assignment;
    acc.assignment_sec_sum += row.assignment_sec_sum;
    acc.assignment_samples += row.assignment_samples;
    cells.set(parent, acc);
  }
  return { cells, dropped };
}

/** Counts items (drivers, unassigned rides) per parent cell. */
export function countByCell(cellsOfItems: (string | null | undefined)[], res: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const h3 of cellsOfItems) {
    const parent = parentCell(h3, res);
    if (!parent) continue;
    out.set(parent, (out.get(parent) ?? 0) + 1);
  }
  return out;
}

export function avgAssignmentSec(c: CellCounts): number | null {
  return c.assignment_samples > 0 ? Math.round(c.assignment_sec_sum / c.assignment_samples) : null;
}

/** Percent change vs the previous equal-length window. Null when there is no previous demand to compare with. */
export function trendPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/**
 * Relative demand level inside the returned area: among cells with at least one request,
 * the top 15% are high, the next 35% medium, the rest low. Ties share the higher level.
 */
export function demandLevels(requestsByCell: Map<string, number>): Map<string, DemandLevel> {
  const out = new Map<string, DemandLevel>();
  const positive = [...requestsByCell.values()].filter((n) => n > 0).sort((a, b) => b - a);
  const highCut = positive.length ? positive[Math.max(0, Math.ceil(positive.length * 0.15) - 1)] : Infinity;
  const mediumCut = positive.length ? positive[Math.max(0, Math.ceil(positive.length * 0.5) - 1)] : Infinity;
  for (const [cell, n] of requestsByCell) {
    if (n <= 0) out.set(cell, 'none');
    else if (n >= highCut) out.set(cell, 'high');
    else if (n >= mediumCut) out.set(cell, 'medium');
    else out.set(cell, 'low');
  }
  return out;
}

export const HEAT_STEPS = 5;

/**
 * Heat-map shade 0..5 inside the returned area: cells with a positive value are ranked and split into
 * five equal bands (5 = busiest). Equal values share the band of their middle rank; zero stays 0.
 */
export function heatSteps(valueByCell: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  const positive = [...valueByCell.values()].filter((n) => n > 0).sort((a, b) => b - a);
  const ranks = new Map<number, { first: number; last: number }>();
  positive.forEach((n, i) => {
    const r = ranks.get(n);
    if (r) r.last = i;
    else ranks.set(n, { first: i, last: i });
  });
  for (const [cell, n] of valueByCell) {
    const r = n > 0 ? ranks.get(n)! : null;
    out.set(cell, r ? HEAT_STEPS - Math.floor((((r.first + r.last) / 2) * HEAT_STEPS) / positive.length) : 0);
  }
  return out;
}

export type ForecastWindow = { from: Date; to: Date; week: number };

/** The same clock window 1..N weeks before the horizon. */
export function forecastWindows(horizonStart: Date, horizonEnd: Date, weeks = FORECAST_MAX_WEEKS): ForecastWindow[] {
  const weekMs = 7 * 24 * 3600 * 1000;
  return Array.from({ length: weeks }, (_, i) => ({
    week: i + 1,
    from: new Date(horizonStart.getTime() - (i + 1) * weekMs),
    to: new Date(horizonEnd.getTime() - (i + 1) * weekMs),
  }));
}

/** Full weeks of history available before the horizon, capped at FORECAST_MAX_WEEKS. */
export function weeksOfHistory(earliestDemandAt: Date | null, horizonStart: Date): number {
  if (!earliestDemandAt) return 0;
  const weeks = Math.floor((horizonStart.getTime() - earliestDemandAt.getTime()) / (7 * 24 * 3600 * 1000));
  return Math.max(0, Math.min(FORECAST_MAX_WEEKS, weeks));
}

export type ForecastStatus =
  | { status: 'ok'; weeks_used: number; samples: number }
  | { status: 'insufficient_data'; reason: 'NOT_ENOUGH_HISTORY' | 'TOO_FEW_REQUESTS'; weeks_used: number; samples: number };

export function forecastStatus(weeksUsed: number, samples: number): ForecastStatus {
  if (weeksUsed < FORECAST_MIN_WEEKS) return { status: 'insufficient_data', reason: 'NOT_ENOUGH_HISTORY', weeks_used: weeksUsed, samples };
  if (samples < FORECAST_MIN_SAMPLES) return { status: 'insufficient_data', reason: 'TOO_FEW_REQUESTS', weeks_used: weeksUsed, samples };
  return { status: 'ok', weeks_used: weeksUsed, samples };
}

/**
 * Seasonal average: per cell, the mean request count of the same hour-of-week across `weeksUsed` past weeks.
 * `weekly[i]` holds the per-cell counts of week i+1. Weeks beyond `weeksUsed` are ignored.
 */
export function seasonalAverage(weekly: Map<string, number>[], weeksUsed: number): Map<string, number> {
  const out = new Map<string, number>();
  if (weeksUsed <= 0) return out;
  for (const week of weekly.slice(0, weeksUsed)) {
    for (const [cell, n] of week) out.set(cell, (out.get(cell) ?? 0) + n);
  }
  for (const [cell, sum] of out) out.set(cell, Math.round((sum / weeksUsed) * 100) / 100);
  return out;
}

export type ShortageFlags = { actual: boolean; forecast: boolean };

/** Actual: requests waiting now outnumber available drivers. Forecast: the expected next-hour demand does. */
export function shortageFlags(unassigned: number, availableDrivers: number, forecast: number | null): ShortageFlags {
  return {
    actual: unassigned > 0 && unassigned > availableDrivers,
    forecast: forecast != null && forecast >= 1 && forecast > availableDrivers,
  };
}

export type SuggestionInput = {
  cell: string;
  center: { lat: number; lng: number };
  unassigned: number;
  recent_requests: number;
  forecast: number | null;
  available_drivers: number;
};

export type SuggestionReason = 'WAITING_REQUESTS' | 'FORECAST_DEMAND' | 'RECENT_DEMAND';

export type Suggestion = {
  cell: string;
  center: { lat: number; lng: number };
  distance_m: number;
  score: number;
  reasons: SuggestionReason[];
};

/**
 * Areas near the driver where demand outweighs available drivers.
 * score = 3 × waiting requests + (forecast, or recent requests when no forecast) − available drivers.
 * Only positive scores are suggested; ties go to the closer area.
 */
export function suggestAreas(
  cells: SuggestionInput[],
  driver: { lat: number; lng: number },
  opts: { radiusM: number; limit: number },
): Suggestion[] {
  const out: Suggestion[] = [];
  for (const c of cells) {
    const distance_m = Math.round(haversineM(driver, c.center));
    if (distance_m > opts.radiusM) continue;
    const expected = c.forecast ?? c.recent_requests;
    const score = Math.round((c.unassigned * 3 + expected - c.available_drivers) * 100) / 100;
    if (score <= 0) continue;
    const reasons: SuggestionReason[] = [];
    if (c.unassigned > 0) reasons.push('WAITING_REQUESTS');
    if (c.forecast != null && c.forecast >= 1) reasons.push('FORECAST_DEMAND');
    else if (c.forecast == null && c.recent_requests > 0) reasons.push('RECENT_DEMAND');
    if (!reasons.length) continue;
    out.push({ cell: c.cell, center: c.center, distance_m, score, reasons });
  }
  out.sort((a, b) => b.score - a.score || a.distance_m - b.distance_m);
  return out.slice(0, opts.limit);
}

export function cellGeometry(cell: string) {
  const [lat, lng] = cellToLatLng(cell);
  return {
    center: { lat: round6(lat), lng: round6(lng) },
    boundary: cellToBoundary(cell).map(([a, b]) => [round6(a), round6(b)] as [number, number]),
  };
}

function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}
