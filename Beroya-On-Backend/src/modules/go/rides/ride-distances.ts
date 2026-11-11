import { GoRideStatus, Prisma } from '@/generated/prisma/client';
import { haversineM } from '../dispatch/h3.util';

/** Planned pickup → destination at booking (does not include later destination changes). */
export function plannedTripDistanceM(ride: { estimated_distance_m?: number | null }) {
  if (ride.estimated_distance_m != null && ride.estimated_distance_m > 0) return ride.estimated_distance_m;
  return null;
}

/**
 * Kilometers driven with the customer aboard (GPS track during IN_PROGRESS).
 * Includes detours, added stops, and destination changes.
 */
export function withCustomerDistanceM(ride: { actual_distance_m?: number | null }) {
  if (ride.actual_distance_m != null && ride.actual_distance_m > 0) return ride.actual_distance_m;
  return null;
}

/** @deprecated Prefer plannedTripDistanceM / withCustomerDistanceM — kept for call sites. */
export function toDestinationDistanceM(ride: {
  actual_distance_m?: number | null;
  estimated_distance_m?: number | null;
}) {
  return withCustomerDistanceM(ride) ?? plannedTripDistanceM(ride);
}

/** True when the final drop-off is meaningfully away from the booked destination. */
export function destinationChanged(ride: {
  original_destination_lat?: number | Prisma.Decimal | null;
  original_destination_lng?: number | Prisma.Decimal | null;
  actual_dropoff_lat?: number | Prisma.Decimal | null;
  actual_dropoff_lng?: number | Prisma.Decimal | null;
}, thresholdM = 150) {
  if (ride.actual_dropoff_lat == null || ride.actual_dropoff_lng == null) return false;
  if (ride.original_destination_lat == null || ride.original_destination_lng == null) return false;
  const meters = haversineM(
    { lat: Number(ride.original_destination_lat), lng: Number(ride.original_destination_lng) },
    { lat: Number(ride.actual_dropoff_lat), lng: Number(ride.actual_dropoff_lng) },
  );
  return Number.isFinite(meters) && meters >= thresholdM;
}

/** Straight-line meters from a point to pickup (assignment snapshot / fallback). */
export function toPickupHaversineM(
  from: { lat: number; lng: number } | null | undefined,
  pickup: { lat: number | Prisma.Decimal; lng: number | Prisma.Decimal },
) {
  if (!from) return null;
  const meters = haversineM(from, { lat: Number(pickup.lat), lng: Number(pickup.lng) });
  return Number.isFinite(meters) ? Math.max(0, Math.round(meters)) : null;
}

/**
 * Prefer live navigation distance while heading to pickup; else stored assignment snapshot;
 * 0 once ARRIVED (at pickup).
 */
export function resolveToCustomerDistanceM(input: {
  status: GoRideStatus;
  storedToPickupM?: number | null;
  livePickupDistanceM?: number | null;
}) {
  if (input.status === GoRideStatus.ARRIVED) return 0;
  if (
    (input.status === GoRideStatus.DRIVER_ASSIGNED || input.status === GoRideStatus.DRIVER_EN_ROUTE) &&
    input.livePickupDistanceM != null
  ) {
    return input.livePickupDistanceM;
  }
  if (input.storedToPickupM != null) return input.storedToPickupM;
  return null;
}
