const FALLBACK_DURATION_SEC = 30 * 60;

/**
 * Expected trip end for customer UI («ينتهي في …»).
 * completed → completed_at; RENTAL → rental_ends_at; else start + estimated_duration_sec.
 */
export function rideEndsAt(ride: {
  started_at: Date | null;
  scheduled_at: Date | null;
  created_at: Date;
  completed_at: Date | null;
  estimated_duration_sec: number | null;
  rental_ends_at?: Date | null;
}): string | null {
  if (ride.completed_at) return ride.completed_at.toISOString();
  if (ride.rental_ends_at) return ride.rental_ends_at.toISOString();
  const durationSec = ride.estimated_duration_sec != null && ride.estimated_duration_sec > 0
    ? ride.estimated_duration_sec
    : FALLBACK_DURATION_SEC;
  const start = ride.started_at ?? ride.scheduled_at ?? ride.created_at;
  return new Date(start.getTime() + durationSec * 1000).toISOString();
}
