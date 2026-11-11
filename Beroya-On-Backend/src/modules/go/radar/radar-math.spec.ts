import { cellToParent, gridDisk, latLngToCell } from 'h3-js';
import { GoDriverAvailability, Prisma } from '@/generated/prisma/client';
import {
  countByCell,
  demandLevels,
  heatSteps,
  emptyCounts,
  forecastStatus,
  forecastWindows,
  parentCell,
  rollUp,
  seasonalAverage,
  shortageFlags,
  suggestAreas,
  trendPct,
  weeksOfHistory,
} from './radar-math';
import { classifyDriver } from './radar.service';

const DAMASCUS = { lat: 33.5138, lng: 36.2765 };
const base = latLngToCell(DAMASCUS.lat, DAMASCUS.lng, 9);
const [, neighbour9] = gridDisk(base, 1);

describe('radar math', () => {
  it('rolls res-9 rows up to the display resolution and counts unusable cells', () => {
    const row = (h3: string, requests: number) => ({ ...emptyCounts(), h3, requests, assigned: requests });
    const { cells, dropped } = rollUp([row(base, 2), row(neighbour9, 3), row('', 4), row('not-a-cell', 1)], 7);
    const parent = cellToParent(base, 7);
    expect(cells.get(parent)?.requests).toBe(cellToParent(neighbour9, 7) === parent ? 5 : 2);
    expect(dropped).toBe(5);
  });

  it('never maps a coarser stored cell to a finer display cell', () => {
    expect(parentCell(cellToParent(base, 6), 8)).toBeNull();
    expect(parentCell(base, 9)).toBe(base);
  });

  it('counts items per cell and skips missing positions', () => {
    const m = countByCell([base, base, null, undefined, 'x'], 8);
    expect([...m.values()]).toEqual([2]);
  });

  it('reports no trend when there was no previous demand', () => {
    expect(trendPct(5, 0)).toBeNull();
    expect(trendPct(15, 10)).toBe(50);
    expect(trendPct(5, 10)).toBe(-50);
  });

  it('assigns relative demand levels from quantiles, ties share the higher level', () => {
    const counts = new Map<string, number>([
      ['a', 20],
      ['b', 10],
      ['c', 10],
      ['d', 2],
      ['e', 1],
      ['f', 0],
    ]);
    const levels = demandLevels(counts);
    expect(levels.get('a')).toBe('high');
    expect(levels.get('b')).toBe('medium');
    expect(levels.get('c')).toBe('medium');
    expect(levels.get('e')).toBe('low');
    expect(levels.get('f')).toBe('none');
  });

  it('gives equal values the shade of their middle rank', () => {
    const counts = new Map<string, number>(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((k, i) => [k, i < 2 ? 6 : 4]));
    expect([...heatSteps(counts).values()]).toEqual([5, 5, 3, 3, 3, 3, 3, 3]);
  });

  it('splits positive cells into five heat shades', () => {
    const counts = new Map<string, number>([
      ['a', 20],
      ['b', 10],
      ['c', 10],
      ['d', 2],
      ['e', 1],
      ['f', 0],
    ]);
    const heat = heatSteps(counts);
    expect([...heat.values()]).toEqual([5, 4, 4, 2, 1, 0]);
    expect(heatSteps(new Map([['only', 3]])).get('only')).toBe(5);
    expect(heatSteps(new Map([['x', 0]])).get('x')).toBe(0);
  });

  it('builds forecast windows at the same hour of the week', () => {
    const from = new Date('2026-10-15T10:00:00Z');
    const to = new Date('2026-10-15T11:00:00Z');
    const w = forecastWindows(from, to, 2);
    expect(w.map((x) => x.from.toISOString())).toEqual(['2026-10-08T10:00:00.000Z', '2026-10-01T10:00:00.000Z']);
    expect(w[1].to.toISOString()).toBe('2026-10-01T11:00:00.000Z');
  });

  it('refuses to forecast without enough history or samples', () => {
    const at = new Date('2026-10-15T10:00:00Z');
    expect(weeksOfHistory(null, at)).toBe(0);
    expect(weeksOfHistory(new Date('2026-10-05T10:00:00Z'), at)).toBe(1);
    expect(weeksOfHistory(new Date('2025-01-01T00:00:00Z'), at)).toBe(4);
    expect(forecastStatus(1, 100)).toMatchObject({ status: 'insufficient_data', reason: 'NOT_ENOUGH_HISTORY' });
    expect(forecastStatus(3, 4)).toMatchObject({ status: 'insufficient_data', reason: 'TOO_FEW_REQUESTS' });
    expect(forecastStatus(2, 5)).toMatchObject({ status: 'ok' });
  });

  it('averages only the weeks actually used', () => {
    const weeks = [new Map([['a', 4]]), new Map([['a', 2], ['b', 1]]), new Map([['a', 100]])];
    const avg = seasonalAverage(weeks, 2);
    expect(avg.get('a')).toBe(3);
    expect(avg.get('b')).toBe(0.5);
    expect(seasonalAverage(weeks, 0).size).toBe(0);
  });

  it('separates actual from forecast shortage', () => {
    expect(shortageFlags(3, 1, null)).toEqual({ actual: true, forecast: false });
    expect(shortageFlags(0, 0, null)).toEqual({ actual: false, forecast: false });
    expect(shortageFlags(0, 1, 2.5)).toEqual({ actual: false, forecast: true });
    expect(shortageFlags(0, 0, 0.5)).toEqual({ actual: false, forecast: false });
  });

  it('suggests nearby areas with positive demand-over-supply, best first, within the radius', () => {
    const near = { lat: DAMASCUS.lat + 0.005, lng: DAMASCUS.lng };
    const far = { lat: DAMASCUS.lat + 0.2, lng: DAMASCUS.lng };
    const out = suggestAreas(
      [
        { cell: 'busy', center: near, unassigned: 2, recent_requests: 4, forecast: null, available_drivers: 1 },
        { cell: 'covered', center: near, unassigned: 0, recent_requests: 1, forecast: null, available_drivers: 3 },
        { cell: 'forecast', center: near, unassigned: 0, recent_requests: 0, forecast: 2, available_drivers: 0 },
        { cell: 'far', center: far, unassigned: 10, recent_requests: 10, forecast: null, available_drivers: 0 },
      ],
      DAMASCUS,
      { radiusM: 5000, limit: 3 },
    );
    expect(out.map((s) => s.cell)).toEqual(['busy', 'forecast']);
    expect(out[0].reasons).toEqual(['WAITING_REQUESTS', 'RECENT_DEMAND']);
    expect(out[1].reasons).toEqual(['FORECAST_DEMAND']);
  });
});

describe('classifyDriver', () => {
  const now = new Date('2026-10-15T10:00:00Z');
  const staleBefore = new Date(now.getTime() - 60_000);
  const loc = { last_lat: new Prisma.Decimal(33.5), last_lng: new Prisma.Decimal(36.3) };

  it('treats an online driver without a ride and a fresh location as available', () => {
    expect(
      classifyDriver({ availability: GoDriverAvailability.ONLINE, current_ride_id: null, last_location_at: now, ...loc }, staleBefore),
    ).toBe('available');
  });

  it('marks drivers on a ride as busy', () => {
    expect(
      classifyDriver({ availability: GoDriverAvailability.BUSY, current_ride_id: 'r1', last_location_at: now, ...loc }, staleBefore),
    ).toBe('busy');
  });

  it('never counts a stale or missing location as available', () => {
    const old = new Date(now.getTime() - 120_000);
    expect(
      classifyDriver({ availability: GoDriverAvailability.ONLINE, current_ride_id: null, last_location_at: old, ...loc }, staleBefore),
    ).toBe('stale');
    expect(
      classifyDriver(
        { availability: GoDriverAvailability.ONLINE, current_ride_id: null, last_location_at: now, last_lat: null, last_lng: null },
        staleBefore,
      ),
    ).toBe('stale');
  });
});
