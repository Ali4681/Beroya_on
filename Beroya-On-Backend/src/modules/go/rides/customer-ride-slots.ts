import { GoRideStatus, GoRideType } from '@/generated/prisma/client';

/** Gap kept free after a ride's estimated end before the customer's next booking may start. */
export const RIDE_SLOT_BUFFER_SEC = 30 * 60;
const FALLBACK_DURATION_SEC = 30 * 60;

const STARTED_STATUSES = new Set<GoRideStatus>([
  GoRideStatus.DRIVER_EN_ROUTE,
  GoRideStatus.ARRIVED,
  GoRideStatus.IN_PROGRESS,
]);

export interface SlotRide {
  id: string;
  type: GoRideType;
  status: GoRideStatus;
  scheduled_at: Date | null;
  started_at: Date | null;
  estimated_duration_sec: number | null;
}

export type SlotCandidate = Pick<SlotRide, 'type' | 'scheduled_at' | 'estimated_duration_sec'>;

/** Happening now: any immediate ride, or a scheduled one whose driver is on the way or whose time has come. */
export function isLiveRide(ride: SlotRide, now = Date.now()) {
  if (ride.type === GoRideType.IMMEDIATE || STARTED_STATUSES.has(ride.status)) return true;
  return !ride.scheduled_at || ride.scheduled_at.getTime() <= now;
}

/** [start, end) in ms: estimated trip time plus the buffer. */
export function rideWindow(ride: SlotRide, now = Date.now()) {
  const span = ((ride.estimated_duration_sec ?? FALLBACK_DURATION_SEC) + RIDE_SLOT_BUFFER_SEC) * 1000;
  if (!isLiveRide(ride, now)) {
    const start = ride.scheduled_at!.getTime();
    return { start, end: start + span };
  }
  const from = ride.started_at?.getTime() ?? now;
  return { start: now, end: Math.max(now + RIDE_SLOT_BUFFER_SEC * 1000, from + span) };
}

/**
 * One live ride at a time; any number of scheduled rides as long as no two windows overlap.
 * Returns the ride that blocks the candidate, or null.
 */
export function findSlotConflict(existing: SlotRide[], candidate: SlotCandidate, now = Date.now()) {
  if (candidate.type === GoRideType.IMMEDIATE) {
    const live = existing.find((ride) => isLiveRide(ride, now));
    if (live) return { reason: 'ACTIVE_RIDE' as const, ride: live };
  }
  const mine = rideWindow(
    { ...candidate, id: '', status: GoRideStatus.SEARCHING, started_at: null },
    now,
  );
  const hit = existing.find((ride) => {
    const other = rideWindow(ride, now);
    return other.start < mine.end && mine.start < other.end;
  });
  return hit ? { reason: 'TIME_OVERLAP' as const, ride: hit } : null;
}

/** The ride the home screen should follow: the live one, else the next scheduled one. */
export function pickActiveRide<T extends SlotRide>(rides: T[], now = Date.now()): T | null {
  const live = rides.find((ride) => isLiveRide(ride, now));
  if (live) return live;
  const upcoming = [...rides].sort((a, b) => (a.scheduled_at?.getTime() ?? 0) - (b.scheduled_at?.getTime() ?? 0));
  return upcoming[0] ?? null;
}
