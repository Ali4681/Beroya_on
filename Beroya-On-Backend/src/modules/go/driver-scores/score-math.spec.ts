import { GoDriverScoreBand } from '@/generated/prisma/client';
import { overlapHours } from '../driver-sessions/driver-sessions.service';
import { percentileRank, scoreBand, scoreDriver, type DriverMetrics, type ScoreWeights } from './score-math';

const weights: ScoreWeights = {
  rating: 30,
  acceptance: 25,
  hours: 20,
  earnings: 25,
  cancel: 0,
  bandKeep: 75,
  bandWatch: 50,
};

const driver = (id: string, over: Partial<DriverMetrics> = {}): DriverMetrics => ({
  driverId: id,
  rating: 5,
  ratingsCount: 10,
  acceptancePct: 100,
  offersCount: 10,
  onlineHours: 10,
  earnings: 100_000,
  completed: 10,
  cancelPct: 0,
  ...over,
});

describe('percentileRank', () => {
  it('uses mid-rank for ties', () => {
    expect(percentileRank(10, [5, 10, 10, 20])).toBe(50);
  });
  it('top value of a single-driver branch is 50', () => {
    expect(percentileRank(10, [10])).toBe(50);
  });
  it('zero activity is zero', () => {
    expect(percentileRank(0, [0, 0, 5])).toBe(0);
  });
});

describe('scoreBand', () => {
  it('uses inclusive thresholds', () => {
    expect(scoreBand(75, weights)).toBe(GoDriverScoreBand.KEEP);
    expect(scoreBand(74.99, weights)).toBe(GoDriverScoreBand.WATCH);
    expect(scoreBand(50, weights)).toBe(GoDriverScoreBand.WATCH);
    expect(scoreBand(49.99, weights)).toBe(GoDriverScoreBand.REPLACEABLE);
  });
});

describe('scoreDriver', () => {
  it('weights each metric and normalises by the weight sum', () => {
    const a = driver('a', { rating: 4, acceptancePct: 80, onlineHours: 20, earnings: 200_000 });
    const b = driver('b', { onlineHours: 10, earnings: 100_000 });
    const r = scoreDriver(a, [a, b], weights);
    // rating 80, acceptance 80, hours 75 (1.5/2), earnings 75
    expect(r.score).toBeCloseTo((80 * 30 + 80 * 25 + 75 * 20 + 75 * 25) / 100, 2);
    expect(r.breakdown.hours.points).toBe(75);
    expect(r.breakdown.rating.points).toBe(80);
  });

  it('skips metrics without data instead of scoring them zero', () => {
    const a = driver('a', { rating: null, acceptancePct: null });
    const r = scoreDriver(a, [a], { ...weights });
    // only hours (50) and earnings (50) count
    expect(r.score).toBe(50);
    expect(r.breakdown.rating.points).toBeNull();
  });

  it('a driver with no data scores zero and is replaceable', () => {
    const idle = driver('idle', { rating: null, acceptancePct: null, onlineHours: 0, earnings: 0, completed: 0, cancelPct: null, offersCount: 0 });
    const busy = driver('busy');
    const r = scoreDriver(idle, [idle, busy], weights);
    expect(r.score).toBe(0);
    expect(r.band).toBe(GoDriverScoreBand.REPLACEABLE);
  });

  it('subtracts the cancellation penalty and clamps at zero', () => {
    const a = driver('a', { cancelPct: 20 });
    const withPenalty = scoreDriver(a, [a], { ...weights, cancel: 50 });
    const without = scoreDriver(a, [a], weights);
    expect(without.score - withPenalty.score).toBeCloseTo(10, 2);
    const worst = driver('w', { rating: 1, acceptancePct: 0, cancelPct: 100, onlineHours: 0, earnings: 0 });
    expect(scoreDriver(worst, [worst], { ...weights, cancel: 100 }).score).toBe(0);
  });

  it('adds the driver to the peers when missing', () => {
    const a = driver('a', { onlineHours: 30 });
    const r = scoreDriver(a, [driver('b', { onlineHours: 10 })], weights);
    expect(r.breakdown.hours.points).toBe(75);
  });

  it('zero weight removes a metric', () => {
    const a = driver('a', { rating: 1 });
    const r = scoreDriver(a, [a], { ...weights, rating: 0 });
    expect(r.breakdown.rating.points).toBe(20);
    expect(r.score).toBeCloseTo((100 * 25 + 50 * 20 + 50 * 25) / 70, 2);
  });
});

describe('overlapHours', () => {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 12, h));
  it('clips a session to the window', () => {
    expect(overlapHours(at(2), at(8), at(4), at(10))).toBe(4);
  });
  it('is zero outside the window', () => {
    expect(overlapHours(at(1), at(3), at(4), at(10))).toBe(0);
  });
  it('counts a session fully inside', () => {
    expect(overlapHours(at(5), at(6), at(4), at(10))).toBe(1);
  });
});
