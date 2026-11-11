/** Validated bounds for go_dispatch_config.driver_offer_radius_m (meters). */
export const DRIVER_OFFER_RADIUS_MIN_M = 200;
export const DRIVER_OFFER_RADIUS_MAX_M = 5000;
export const DEFAULT_DRIVER_OFFER_RADIUS_M = 500;

/**
 * Option A — single fixed offer radius.
 * Map circle on the driver app and dispatch haversine filter share this value.
 * Search does not expand beyond it; exhausted candidates → FAILED_NO_DRIVER.
 */
export function normalizeDriverOfferRadiusM(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_DRIVER_OFFER_RADIUS_M;
  return Math.min(DRIVER_OFFER_RADIUS_MAX_M, Math.max(DRIVER_OFFER_RADIUS_MIN_M, n));
}

/** Search radii for dispatch — one step equal to the driver offer circle. */
export function driverOfferSearchRadii(driverOfferRadiusM: unknown): number[] {
  return [normalizeDriverOfferRadiusM(driverOfferRadiusM)];
}

/** True when driver→pickup distance is within the configured offer circle. */
export function isWithinDriverOfferRadius(distanceM: number, driverOfferRadiusM: unknown): boolean {
  return distanceM <= normalizeDriverOfferRadiusM(driverOfferRadiusM);
}
