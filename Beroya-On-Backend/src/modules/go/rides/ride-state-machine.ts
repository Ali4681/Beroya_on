import { GoRideStatus, GoRideType } from '@/generated/prisma/client';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';

/** Ticket §31 — only these transitions are allowed. */
const ALLOWED: Record<GoRideStatus, readonly GoRideStatus[]> = {
  SEARCHING: [
    GoRideStatus.DRIVER_ASSIGNED,
    GoRideStatus.FAILED_NO_DRIVER,
    GoRideStatus.CANCELLED_BY_CUSTOMER,
    GoRideStatus.CANCELLED_BY_STAFF,
  ],
  DRIVER_ASSIGNED: [
    GoRideStatus.DRIVER_EN_ROUTE,
    GoRideStatus.CANCELLED_BY_CUSTOMER,
    GoRideStatus.CANCELLED_BY_DRIVER,
    GoRideStatus.CANCELLED_BY_STAFF,
  ],
  DRIVER_EN_ROUTE: [
    GoRideStatus.ARRIVED,
    GoRideStatus.SEARCHING,
    GoRideStatus.CANCELLED_BY_CUSTOMER,
    GoRideStatus.CANCELLED_BY_DRIVER,
    GoRideStatus.CANCELLED_BY_STAFF,
  ],
  ARRIVED: [
    GoRideStatus.IN_PROGRESS,
    GoRideStatus.NO_SHOW,
    GoRideStatus.SEARCHING,
    GoRideStatus.CANCELLED_BY_CUSTOMER,
    GoRideStatus.CANCELLED_BY_STAFF,
  ],
  IN_PROGRESS: [GoRideStatus.COMPLETED, GoRideStatus.INTERRUPTED, GoRideStatus.CANCELLED_BY_STAFF],
  COMPLETED: [],
  CANCELLED_BY_CUSTOMER: [],
  CANCELLED_BY_DRIVER: [],
  CANCELLED_BY_STAFF: [],
  NO_SHOW: [],
  INTERRUPTED: [GoRideStatus.REPLACED],
  REPLACED: [],
  FAILED_NO_DRIVER: [],
};

export const ACTIVE_RIDE_STATUSES: readonly GoRideStatus[] = [
  GoRideStatus.SEARCHING,
  GoRideStatus.DRIVER_ASSIGNED,
  GoRideStatus.DRIVER_EN_ROUTE,
  GoRideStatus.ARRIVED,
  GoRideStatus.IN_PROGRESS,
];

export function assertTransition(from: GoRideStatus, to: GoRideStatus): void {
  if (!ALLOWED[from].includes(to)) {
    throw new GoException(GoErrorCode.INVALID_RIDE_TRANSITION, `Cannot transition ${from} → ${to}`, {
      from,
      to,
      allowed: ALLOWED[from],
    });
  }
}

export function canCustomerCancel(status: GoRideStatus): boolean {
  return (
    status === GoRideStatus.SEARCHING ||
    status === GoRideStatus.DRIVER_ASSIGNED ||
    status === GoRideStatus.DRIVER_EN_ROUTE ||
    status === GoRideStatus.ARRIVED
  );
}

export function canDriverCancel(status: GoRideStatus): boolean {
  return status === GoRideStatus.DRIVER_ASSIGNED || status === GoRideStatus.DRIVER_EN_ROUTE;
}

export function canStaffCancel(status: GoRideStatus): boolean {
  return ACTIVE_RIDE_STATUSES.includes(status);
}

const DRIVER_LIVE_STATUSES: readonly GoRideStatus[] = [
  GoRideStatus.DRIVER_ASSIGNED,
  GoRideStatus.DRIVER_EN_ROUTE,
  GoRideStatus.ARRIVED,
  GoRideStatus.IN_PROGRESS,
];

const DRIVER_SCHEDULED_ACTIVE_STATUSES: readonly GoRideStatus[] = [
  GoRideStatus.DRIVER_EN_ROUTE,
  GoRideStatus.ARRIVED,
  GoRideStatus.IN_PROGRESS,
];

/**
 * GET /driver/rides/active — home “live” ride only.
 * Immediate: assigned through in-progress.
 * Scheduled: only after lifecycle promotion (EN_ROUTE+); reserved DRIVER_ASSIGNED stays on scheduled list.
 */
export function isDriverHomeActiveRide(ride: { type: GoRideType; status: GoRideStatus }): boolean {
  if (ride.type === GoRideType.SCHEDULED) {
    return DRIVER_SCHEDULED_ACTIVE_STATUSES.includes(ride.status);
  }
  return DRIVER_LIVE_STATUSES.includes(ride.status);
}
