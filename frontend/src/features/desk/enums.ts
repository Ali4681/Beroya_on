import { enumLabel } from "@/features/desk/present";

/** Values accepted by the backend validators and Prisma enums. */
export const STAFF_ENUMS = {
  rideStatus: ["SEARCHING", "DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED", "CANCELLED_BY_CUSTOMER", "CANCELLED_BY_DRIVER", "CANCELLED_BY_STAFF", "NO_SHOW", "INTERRUPTED", "REPLACED", "FAILED_NO_DRIVER"],
  liveRideStatus: ["SEARCHING", "DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "ARRIVED", "IN_PROGRESS", "INTERRUPTED"],
  alertType: ["LONG_STOP", "LOCATION_STALE", "MAJOR_ROUTE_DEVIATION", "SCHEDULED_DRIVER_OFFLINE", "SCHEDULED_DRIVER_DELAY", "URGENT_COMPLAINT", "EMERGENCY", "DRIVER_COVERAGE_LOW", "ASSIGNMENT_DELAYED", "RIDE_DELAYED", "CANCELLATION_RATE_HIGH", "REPLACEMENT_NEEDED"],
  alertSeverity: ["CRITICAL", "WARNING", "INFO"],
  alertStatus: ["OPEN", "CLAIMED", "RESOLVED"],
  longStopReason: ["TRAFFIC", "VEHICLE_BREAKDOWN", "WAITING_FOR_CUSTOMER", "ACCIDENT", "ROAD_CLOSED", "CUSTOMER_REQUESTED_STOP", "OTHER"],
  complaintStatus: ["OPEN", "IN_REVIEW", "RESOLVED", "CLOSED"],
  complaintUpdateStatus: ["OPEN", "IN_REVIEW", "RESOLVED"],
  complaintPriority: ["NORMAL", "URGENT"],
  emergencyStatus: ["ACTIVE", "HANDLED", "CLOSED"],
  caseType: ["ACCIDENT", "BREAKDOWN"],
  breakdownSubtype: ["ENGINE", "TIRE", "FUEL", "ACCIDENT", "OTHER"],
  caseStatus: ["OPEN", "IN_REVIEW", "CLOSED"],
  caseUpdateStatus: ["OPEN", "IN_REVIEW"],
  accidentSeverity: ["SIMPLE", "MEDIUM", "SEVERE"],
  compensationType: ["PERCENTAGE", "FIXED_AMOUNT"],
  fareStackDecision: ["DISCOUNT_ONLY", "COMPENSATION_ONLY", "BOTH"],
  compensationBearer: ["UNASSIGNED", "BEROYA", "DRIVER", "SPLIT"],
  entitlementStatus: ["CALCULATED", "UNDER_REVIEW", "APPROVED", "PARTIAL", "REJECTED", "SETTLED"],
  grantStatus: ["PENDING", "APPROVED", "REJECTED"],
  driverGender: ["MALE", "FEMALE", "UNSPECIFIED"],
  driverKind: ["EXTERNAL", "BEROYA"],
  commissionBase: ["GROSS_FINAL_FARE", "CUSTOMER_PAYABLE"],
  discountStatus: ["ACTIVE", "INACTIVE", "EXPIRED", "CONSUMED"],
  documentType: ["LICENSE", "VEHICLE_REGISTRATION", "INSURANCE", "IDENTITY"],
  vehicleCapability: ["CHILD_SEAT", "EXTRA_LUGGAGE", "ACCESSIBILITY"],
  rewardType: ["SCORE", "DISCOUNT_CODE", "SCORE_AND_DISCOUNT"],
  staffRole: ["CUSTOMER_SERVICE", "CUSTOMER_SERVICE_SUPERVISOR", "OPERATIONS", "WALLET_OPERATOR", "FINANCE", "ADMIN", "SUPER_ADMIN"],
} as const;

export type EnumKind = keyof typeof STAFF_ENUMS;

export const FIELD_ENUMS: Record<string, EnumKind> = {
  commission_base: "commissionBase",
  gender: "driverGender",
};

export function enumOptions(kind: EnumKind) {
  return STAFF_ENUMS[kind].map((value) => ({ value, label: enumLabel(value) }));
}
