import { GoIncentiveKind, GoRideBonusStack } from '@/generated/prisma/client';
import {
  combineRideBonus,
  longestCleanStreak,
  rideBonusPayouts,
  serviceAreaCentroid,
  withinDailyCap,
  type StreakEvent,
} from './incentive-math';

const at = (minute: number) => new Date(Date.UTC(2026, 9, 13, 10, minute));
const done = (minute: number): StreakEvent => ({ at: at(minute), type: 'COMPLETED' });
const brk = (minute: number): StreakEvent => ({ at: at(minute), type: 'BREAK' });

describe('longestCleanStreak', () => {
  it('counts completed rides in a row', () => {
    expect(longestCleanStreak([done(1), done(2), done(3)])).toEqual({ longest: 3, current: 3 });
  });
  it('a decline / expiry / driver cancel resets the run', () => {
    expect(longestCleanStreak([done(1), done(2), brk(3), done(4)])).toEqual({ longest: 2, current: 1 });
  });
  it('keeps the longest run even after a later break', () => {
    expect(longestCleanStreak([done(1), done(2), done(3), brk(4), done(5)])).toEqual({ longest: 3, current: 1 });
  });
  it('sorts events by time first', () => {
    expect(longestCleanStreak([done(5), brk(1), done(3), done(4)])).toEqual({ longest: 3, current: 3 });
  });
  it('is zero without rides', () => {
    expect(longestCleanStreak([])).toEqual({ longest: 0, current: 0 });
    expect(longestCleanStreak([brk(1)])).toEqual({ longest: 0, current: 0 });
  });
});

const square = (x0: number, y0: number, size: number) => [
  [x0, y0],
  [x0 + size, y0],
  [x0 + size, y0 + size],
  [x0, y0 + size],
  [x0, y0],
];

describe('withinDailyCap', () => {
  it('never blocks without a cap', () => {
    expect(withinDailyCap(1_000_000, 5, null)).toBe(true);
  });
  it('allows reaching the cap exactly, blocks above it', () => {
    expect(withinDailyCap(900, 100, 1000)).toBe(true);
    expect(withinDailyCap(900, 101, 1000)).toBe(false);
  });
});

describe('serviceAreaCentroid', () => {
  it('returns the centre of a square polygon', () => {
    const c = serviceAreaCentroid({ type: 'Polygon', coordinates: [square(36.2, 33.4, 0.2)] })!;
    expect(c.lat).toBeCloseTo(33.5, 6);
    expect(c.lng).toBeCloseTo(36.3, 6);
  });
  it('weights multipolygon parts by area', () => {
    const c = serviceAreaCentroid({
      type: 'MultiPolygon',
      coordinates: [[square(0, 0, 2)], [square(10, 0, 1)]],
    })!;
    // areas 4 and 1 → lng = (1*4 + 10.5*1) / 5
    expect(c.lng).toBeCloseTo(2.9, 6);
  });
  it('returns null for missing or unsupported shapes', () => {
    expect(serviceAreaCentroid(null)).toBeNull();
    expect(serviceAreaCentroid({ type: 'Point', coordinates: [1, 2] })).toBeNull();
  });
  it('falls back to the mean of points for a zero-area ring', () => {
    const c = serviceAreaCentroid({ type: 'Polygon', coordinates: [[[0, 0], [2, 0], [4, 0], [0, 0]]] })!;
    expect(c.lat).toBeCloseTo(0, 6);
    expect(c.lng).toBeCloseTo(1.5, 6);
  });
});

const rejection = (pct: number | null, cap: number | null = null) => ({ kind: GoIncentiveKind.RIDE_REJECTION, pct, cap });
const distance = (pct: number | null, cap: number | null = null) => ({ kind: GoIncentiveKind.RIDE_DISTANCE, pct, cap });

describe('combineRideBonus', () => {
  it('is empty when no part is active', () => {
    expect(combineRideBonus([rejection(null), distance(0)], GoRideBonusStack.MAX)).toEqual({
      percentage: null,
      reason: null,
    });
  });
  it('MAX keeps the larger percent', () => {
    const r = combineRideBonus([rejection(15), distance(10)], GoRideBonusStack.MAX);
    expect(r.percentage!.toNumber()).toBe(15);
    expect(r.reason).toBe('REJECTION');
  });
  it('SUM adds both and joins reasons', () => {
    const r = combineRideBonus([rejection(15), distance(10)], GoRideBonusStack.SUM);
    expect(r.percentage!.toNumber()).toBe(25);
    expect(r.reason).toBe('REJECTION+DISTANCE');
  });
});

describe('rideBonusPayouts', () => {
  it('pays gross × pct', () => {
    const p = rideBonusPayouts(20_000, [distance(10)], GoRideBonusStack.MAX);
    expect(p).toHaveLength(1);
    expect(p[0].amount.toNumber()).toBe(2000);
  });
  it('applies each cap before choosing under MAX', () => {
    // rejection 15% = 3000 capped to 1000; distance 10% = 2000 → distance wins.
    const p = rideBonusPayouts(20_000, [rejection(15, 1000), distance(10)], GoRideBonusStack.MAX);
    expect(p.map((x) => [x.kind, x.amount.toNumber()])).toEqual([[GoIncentiveKind.RIDE_DISTANCE, 2000]]);
  });
  it('pays every capped part under SUM', () => {
    const p = rideBonusPayouts(20_000, [rejection(15, 1000), distance(10)], GoRideBonusStack.SUM);
    expect(p.map((x) => [x.kind, x.amount.toNumber()])).toEqual([
      [GoIncentiveKind.RIDE_REJECTION, 1000],
      [GoIncentiveKind.RIDE_DISTANCE, 2000],
    ]);
  });
  it('skips zero parts and zero gross', () => {
    expect(rideBonusPayouts(0, [rejection(15)], GoRideBonusStack.SUM)).toEqual([]);
    expect(rideBonusPayouts(10_000, [rejection(0), distance(null)], GoRideBonusStack.SUM)).toEqual([]);
  });
});
