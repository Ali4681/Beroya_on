import { GoEmergencySession, GoEmergencyStatus } from '@/generated/prisma/client';

/** HANDLED is still open for the customer; claiming shows up as `claimed`. */
export const OPEN_EMERGENCY_STATUSES = [GoEmergencyStatus.ACTIVE, GoEmergencyStatus.HANDLED];

type SessionSummary = Pick<GoEmergencySession, 'id' | 'status' | 'claimed_at' | 'started_at'>;

const num = (v: { toString(): string } | null) => (v == null ? null : Number(v));

/** `active_emergency` on customer / driver ride payloads. */
export function customerEmergencySummary(s: SessionSummary | null) {
  if (!s) return null;
  return {
    id: s.id,
    status: s.status === GoEmergencyStatus.CLOSED ? ('CLOSED' as const) : ('ACTIVE' as const),
    claimed: s.claimed_at != null,
    claimed_at: s.claimed_at,
    started_at: s.started_at,
  };
}

/** Driver ride payloads: only open sessions (null when closed / none). */
export function driverEmergencySummary(s: SessionSummary | null) {
  if (!s || s.status === GoEmergencyStatus.CLOSED) return null;
  return customerEmergencySummary(s);
}

/** Shared start / location response for customer + driver apps (no staff ids / storage keys). */
export function customerEmergencyView(s: GoEmergencySession) {
  return {
    ...customerEmergencySummary(s)!,
    ride_id: s.ride_id,
    ended_at: s.ended_at,
    started_by: s.started_by,
    started_lat: num(s.started_lat),
    started_lng: num(s.started_lng),
    last_lat: num(s.last_lat),
    last_lng: num(s.last_lng),
    last_location_at: s.last_location_at,
    recording_status: s.recording_status,
  };
}
