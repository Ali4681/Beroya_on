import { GoRideRequirementType, GoServiceCode } from '@/generated/prisma/client';

/** Requirements a category always carries, whatever the app sends. */
const CATEGORY_FORCED_REQUIREMENTS: Record<string, GoRideRequirementType[]> = {
  WOMEN: [GoRideRequirementType.FEMALE_DRIVER],
};

/** Requirements a service always carries (in addition to category + client list). */
const SERVICE_FORCED_REQUIREMENTS: Partial<Record<GoServiceCode, GoRideRequirementType[]>> = {
  [GoServiceCode.ACCESSIBILITY]: [GoRideRequirementType.ACCESSIBILITY],
};

export function requirementsForCategory(
  categoryCode: string,
  requested: GoRideRequirementType[] = [],
  serviceCode?: GoServiceCode | null,
): GoRideRequirementType[] {
  const forced = [
    ...(CATEGORY_FORCED_REQUIREMENTS[categoryCode] ?? []),
    ...(serviceCode ? (SERVICE_FORCED_REQUIREMENTS[serviceCode] ?? []) : []),
  ];
  return [...new Set([...requested, ...forced])];
}

/**
 * Strict dispatch match: ride category must be one of the vehicle's categories.
 * Accepts a single legacy id or an array. No upgrade path (e.g. VIP → ECONOMY).
 */
export function vehicleMatchesRideCategory(
  vehicleRideCategoryIds: string | readonly string[] | null | undefined,
  rideCategoryId: string,
): boolean {
  if (!rideCategoryId) return false;
  if (Array.isArray(vehicleRideCategoryIds)) {
    return vehicleRideCategoryIds.includes(rideCategoryId);
  }
  return !!vehicleRideCategoryIds && vehicleRideCategoryIds === rideCategoryId;
}

/** Collect category ids from join rows + legacy singular FK. */
export function vehicleCategoryIds(vehicle: {
  ride_category_id?: string | null;
  ride_categories?: { ride_category_id: string }[] | null;
} | null | undefined): string[] {
  if (!vehicle) return [];
  const ids = [
    ...(vehicle.ride_categories?.map((row) => row.ride_category_id) ?? []),
    ...(vehicle.ride_category_id ? [vehicle.ride_category_id] : []),
  ];
  return [...new Set(ids.filter(Boolean))];
}

/**
 * Default cancel / waiting rules (Ticket §5.6, §9.2–9.3 + cancel policy gaps).
 * Passport Config may override later — not hard-wired into business logic paths beyond these defaults.
 */
export const RideDefaults = {
  /** Immediate: free cancel window after driver accept (seconds). */
  IMMEDIATE_CANCEL_FREE_AFTER_ACCEPT_SEC: 2 * 60,
  /** Scheduled: free cancel window after driver accept (seconds). */
  SCHEDULED_CANCEL_FREE_AFTER_ACCEPT_SEC: 1 * 60,
  /** Hidden score penalty when cancel is late (Passport applies later). */
  LATE_CANCEL_HIDDEN_SCORE: 10,
  /** Customer cancel after driver en route / arrived — higher than late cancel. */
  EN_ROUTE_CANCEL_HIDDEN_SCORE: 25,
  /** Free waiting at pickup before billable waiting. */
  FREE_WAITING_SEC: 2 * 60,
  /** No-show allowed after arrived_at + this. */
  NO_SHOW_AFTER_ARRIVED_SEC: 10 * 60,
  /** Default no-show hidden score (Passport Config later). */
  NO_SHOW_HIDDEN_SCORE: 15,
  /** Driver passport score when driver cancels assigned/en-route ride. */
  DRIVER_CANCEL_HIDDEN_SCORE: 20,
  /** Fallback wallet penalty if wallet config row missing (SYP). */
  DRIVER_CANCEL_WALLET_PENALTY: 2000,
} as const;
