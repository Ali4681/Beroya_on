import { GoRideStatus, GoRideType } from '@/generated/prisma/client';
import { findSlotConflict, pickActiveRide, type SlotRide } from './customer-ride-slots';

const NOW = Date.parse('2026-10-13T10:00:00Z');
const at = (min: number) => new Date(NOW + min * 60_000);

function scheduled(id: string, startMin: number, durationMin = 20, status: GoRideStatus = GoRideStatus.DRIVER_ASSIGNED): SlotRide {
  return { id, type: GoRideType.SCHEDULED, status, scheduled_at: at(startMin), started_at: null, estimated_duration_sec: durationMin * 60 };
}

const immediate: SlotRide = {
  id: 'now',
  type: GoRideType.IMMEDIATE,
  status: GoRideStatus.SEARCHING,
  scheduled_at: null,
  started_at: null,
  estimated_duration_sec: 20 * 60,
};

const newScheduled = (startMin: number, durationMin = 20) => ({
  type: GoRideType.SCHEDULED,
  scheduled_at: at(startMin),
  estimated_duration_sec: durationMin * 60,
});
const newImmediate = { type: GoRideType.IMMEDIATE, scheduled_at: null, estimated_duration_sec: 20 * 60 };

describe('customer ride slots', () => {
  it('allows several scheduled rides that keep trip + 30 min apart', () => {
    const rides = [scheduled('a', 120), scheduled('b', 240)];
    expect(findSlotConflict(rides, newScheduled(360), NOW)).toBeNull();
    // a ends at 120 + 20 + 30 = 170
    expect(findSlotConflict(rides, newScheduled(170), NOW)).toBeNull();
    expect(findSlotConflict(rides, newScheduled(165), NOW)).toMatchObject({ reason: 'TIME_OVERLAP', ride: { id: 'a' } });
    // a 60-min trip at 70 runs into a (ends 70 + 60 + 30 = 160 > 120)
    expect(findSlotConflict(rides, newScheduled(70, 60), NOW)).toMatchObject({ reason: 'TIME_OVERLAP', ride: { id: 'a' } });
  });

  it('allows one immediate ride, and only when it ends before the next scheduled one', () => {
    expect(findSlotConflict([immediate], newImmediate, NOW)).toMatchObject({ reason: 'ACTIVE_RIDE', ride: { id: 'now' } });
    expect(findSlotConflict([scheduled('a', 120)], newImmediate, NOW)).toBeNull();
    expect(findSlotConflict([scheduled('a', 40)], newImmediate, NOW)).toMatchObject({ reason: 'TIME_OVERLAP' });
    // A scheduled ride whose driver is on the way counts as live
    const enRoute = scheduled('a', 20, 20, GoRideStatus.DRIVER_EN_ROUTE);
    expect(findSlotConflict([enRoute], newImmediate, NOW)).toMatchObject({ reason: 'ACTIVE_RIDE' });
  });

  it('blocks a scheduled ride inside a live immediate ride', () => {
    expect(findSlotConflict([immediate], newScheduled(30), NOW)).toMatchObject({ reason: 'TIME_OVERLAP', ride: { id: 'now' } });
    expect(findSlotConflict([immediate], newScheduled(60), NOW)).toBeNull();
  });

  it('follows the live ride first, else the next scheduled one', () => {
    expect(pickActiveRide([scheduled('b', 240), immediate, scheduled('a', 120)], NOW)?.id).toBe('now');
    expect(pickActiveRide([scheduled('b', 240), scheduled('a', 120)], NOW)?.id).toBe('a');
    expect(pickActiveRide([], NOW)).toBeNull();
  });
});
