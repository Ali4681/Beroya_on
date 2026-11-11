import { GoDriverScoreBand } from '@/generated/prisma/client';

export interface DriverMetrics {
  driverId: string;
  /** Average customer stars (1–5). Null = not rated in the window. */
  rating: number | null;
  ratingsCount: number;
  /** ACCEPTED / (ACCEPTED + DECLINED + EXPIRED) × 100. Null = no answered offers. */
  acceptancePct: number | null;
  offersCount: number;
  onlineHours: number;
  earnings: number;
  completed: number;
  /** Driver cancellations / (completed + driver cancellations) × 100. Null = no rides. */
  cancelPct: number | null;
}

export interface ScoreWeights {
  rating: number;
  acceptance: number;
  hours: number;
  earnings: number;
  /** Points removed per 100% cancel rate. */
  cancel: number;
  bandKeep: number;
  bandWatch: number;
}

export type ScoreMetric = 'rating' | 'acceptance' | 'hours' | 'earnings';

export interface MetricPoints {
  value: number | null;
  points: number | null;
  weight: number;
}

export interface DriverScore {
  score: number;
  band: GoDriverScoreBand;
  breakdown: Record<ScoreMetric, MetricPoints> & {
    cancel: { value: number | null; penalty: number; weight: number };
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Mid-rank percentile of `value` among `peers` (the driver included): below + half of the ties.
 * Zero activity scores zero, so idle drivers do not get the middle of the pack.
 */
export function percentileRank(value: number, peers: number[]) {
  if (value <= 0 || !peers.length) return 0;
  let below = 0;
  let equal = 0;
  for (const p of peers) {
    if (p < value) below += 1;
    else if (p === value) equal += 1;
  }
  return ((below + equal / 2) / peers.length) * 100;
}

export function scoreBand(score: number, weights: Pick<ScoreWeights, 'bandKeep' | 'bandWatch'>) {
  if (score >= weights.bandKeep) return GoDriverScoreBand.KEEP;
  if (score >= weights.bandWatch) return GoDriverScoreBand.WATCH;
  return GoDriverScoreBand.REPLACEABLE;
}

/**
 * 0–100 score: weighted average of the metrics that have data (weights normalised by their sum),
 * minus the cancellation penalty. Hours and earnings rank the driver against `peers` (same branch).
 */
export function scoreDriver(metrics: DriverMetrics, peers: DriverMetrics[], weights: ScoreWeights): DriverScore {
  const pool = peers.some((p) => p.driverId === metrics.driverId) ? peers : [...peers, metrics];
  const points: Record<ScoreMetric, number | null> = {
    rating: metrics.rating == null ? null : (Math.min(Math.max(metrics.rating, 0), 5) / 5) * 100,
    acceptance: metrics.acceptancePct,
    hours: percentileRank(metrics.onlineHours, pool.map((p) => p.onlineHours)),
    earnings: percentileRank(metrics.earnings, pool.map((p) => p.earnings)),
  };
  const values: Record<ScoreMetric, number | null> = {
    rating: metrics.rating,
    acceptance: metrics.acceptancePct,
    hours: metrics.onlineHours,
    earnings: metrics.earnings,
  };

  let weighted = 0;
  let weightSum = 0;
  const breakdown = {} as DriverScore['breakdown'];
  for (const key of ['rating', 'acceptance', 'hours', 'earnings'] as ScoreMetric[]) {
    const weight = Math.max(weights[key], 0);
    const p = points[key];
    if (p != null && weight > 0) {
      weighted += p * weight;
      weightSum += weight;
    }
    breakdown[key] = { value: values[key] == null ? null : round2(values[key]!), points: p == null ? null : round2(p), weight };
  }
  const base = weightSum > 0 ? weighted / weightSum : 0;
  const penalty = metrics.cancelPct == null ? 0 : (metrics.cancelPct * Math.max(weights.cancel, 0)) / 100;
  breakdown.cancel = { value: metrics.cancelPct == null ? null : round2(metrics.cancelPct), penalty: round2(penalty), weight: weights.cancel };

  const score = round2(Math.min(Math.max(base - penalty, 0), 100));
  return { score, band: scoreBand(score, weights), breakdown };
}
