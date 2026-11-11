import { randomBytes } from 'crypto';
import { GoRideStatus } from '@/generated/prisma/client';
import { ACTIVE_RIDE_STATUSES } from './ride-state-machine';

/** 192 random bits, URL-safe: 32 chars. */
export function newTrackingToken() {
  return randomBytes(24).toString('base64url');
}

export const TRACKING_TOKEN_FORMAT = /^[A-Za-z0-9_-]{32}$/;

export function isTrackableStatus(status: GoRideStatus) {
  return ACTIVE_RIDE_STATUSES.includes(status);
}

/** Website tracking page: `<APP_PUBLIC_URL>/t/<token>`; relative `/t/<token>` when unset. */
export function trackingPageUrl(publicUrl: string, token: string) {
  return `${publicUrl}/t/${token}`;
}

/** The link is handed out only once a driver is assigned and while the ride is still running. */
export function rideSharesTracking(ride: { share_tracking_link: boolean; driver_id: string | null; status: GoRideStatus }) {
  return ride.share_tracking_link && !!ride.driver_id && isTrackableStatus(ride.status);
}
