import { gridDisk, latLngToCell } from 'h3-js';
import { GoAlertSeverity } from '@/generated/prisma/client';
import {
  assignmentDelay,
  cancellationRate,
  cancellationSeverity,
  coverageBreaches,
  deltaPct,
  pctOrNull,
  rideDelay,
} from './ops-rules';

const cell = latLngToCell(33.5138, 36.2765, 8);
const ring = gridDisk(cell, 1).filter((c) => c !== cell);
const farCell = gridDisk(cell, 3).find((c) => !gridDisk(cell, 1).includes(c))!;

describe('coverage alert rule', () => {
  it('fires when waiting requests exceed available drivers in the area and its ring', () => {
    const out = coverageBreaches(
      [
        { cell, unassigned: 4, available_drivers: 1 },
        { cell: ring[0], unassigned: 0, available_drivers: 2 },
      ],
      3,
    );
    expect(out).toEqual([{ cell, unassigned: 4, available_nearby: 3, severity: GoAlertSeverity.WARNING }]);
  });

  it('does not fire when neighbouring drivers cover the demand', () => {
    const out = coverageBreaches(
      [
        { cell, unassigned: 3, available_drivers: 0 },
        { cell: ring[0], unassigned: 0, available_drivers: 3 },
      ],
      3,
    );
    expect(out).toEqual([]);
  });

  it('ignores drivers outside the ring and escalates when nobody is nearby', () => {
    const out = coverageBreaches(
      [
        { cell, unassigned: 6, available_drivers: 0 },
        { cell: farCell, unassigned: 0, available_drivers: 10 },
      ],
      3,
    );
    expect(out[0]).toMatchObject({ available_nearby: 0, severity: GoAlertSeverity.CRITICAL });
  });

  it('stays quiet below the minimum waiting requests', () => {
    expect(coverageBreaches([{ cell, unassigned: 2, available_drivers: 0 }], 3)).toEqual([]);
  });
});

describe('assignment and ride delay rules', () => {
  const now = new Date('2026-10-15T10:00:00Z');

  it('flags a request searching past the threshold', () => {
    expect(assignmentDelay(new Date(now.getTime() - 100_000), now, 180)).toBeNull();
    expect(assignmentDelay(new Date(now.getTime() - 200_000), now, 180)).toEqual({
      waited_sec: 200,
      severity: GoAlertSeverity.WARNING,
    });
    expect(assignmentDelay(new Date(now.getTime() - 400_000), now, 180)?.severity).toBe(GoAlertSeverity.CRITICAL);
  });

  it('requires both the factor and the minimum extra time before flagging a ride', () => {
    const start = (sec: number) => new Date(now.getTime() - sec * 1000);
    // 10-min estimate: limit = max(15 min, 20 min) = 20 min
    expect(rideDelay(start(1100), 600, now, 1.5, 600)).toBeNull();
    expect(rideDelay(start(1300), 600, now, 1.5, 600)).toEqual({ elapsed_sec: 1300, estimated_sec: 600, limit_sec: 1200 });
    // 60-min estimate: limit = max(90 min, 70 min) = 90 min
    expect(rideDelay(start(5000), 3600, now, 1.5, 600)).toBeNull();
  });

  it('never flags rides without an estimate or start time', () => {
    expect(rideDelay(null, 600, now, 1.5, 600)).toBeNull();
    expect(rideDelay(new Date(0), null, now, 1.5, 600)).toBeNull();
    expect(rideDelay(new Date(0), 0, now, 1.5, 600)).toBeNull();
  });
});

describe('cancellation rate rule', () => {
  it('needs a minimum number of finished rides', () => {
    expect(cancellationRate({ cancelled: 5, finished: 9 }, 10)).toBeNull();
    expect(cancellationRate({ cancelled: 4, finished: 10 }, 10)).toBe(40);
  });

  it('grades severity against the threshold', () => {
    expect(cancellationSeverity(29.9, 30)).toBeNull();
    expect(cancellationSeverity(30, 30)).toBe(GoAlertSeverity.WARNING);
    expect(cancellationSeverity(45, 30)).toBe(GoAlertSeverity.CRITICAL);
  });
});

describe('kpi helpers', () => {
  it('returns null rather than a fake 0% when there is no base', () => {
    expect(pctOrNull(1, 0)).toBeNull();
    expect(pctOrNull(1, 3)).toBe(33.3);
    expect(deltaPct(10, null)).toBeNull();
    expect(deltaPct(10, 0)).toBeNull();
    expect(deltaPct(12, 10)).toBe(20);
  });
});
