import { GoRideStatus, GoRideType } from '@/generated/prisma/client';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import {
  assertTransition,
  canCustomerCancel,
  canDriverCancel,
  canStaffCancel,
  isDriverHomeActiveRide,
} from './ride-state-machine';

describe('ride state machine', () => {
  it('allows happy path', () => {
    expect(() => assertTransition(GoRideStatus.SEARCHING, GoRideStatus.DRIVER_ASSIGNED)).not.toThrow();
    expect(() => assertTransition(GoRideStatus.DRIVER_ASSIGNED, GoRideStatus.DRIVER_EN_ROUTE)).not.toThrow();
    expect(() => assertTransition(GoRideStatus.IN_PROGRESS, GoRideStatus.COMPLETED)).not.toThrow();
  });

  it('lets the customer cancel through arrived', () => {
    expect(canCustomerCancel(GoRideStatus.SEARCHING)).toBe(true);
    expect(canCustomerCancel(GoRideStatus.DRIVER_ASSIGNED)).toBe(true);
    expect(canCustomerCancel(GoRideStatus.DRIVER_EN_ROUTE)).toBe(true);
    expect(canCustomerCancel(GoRideStatus.ARRIVED)).toBe(true);
    expect(canCustomerCancel(GoRideStatus.IN_PROGRESS)).toBe(false);
    expect(() => assertTransition(GoRideStatus.DRIVER_EN_ROUTE, GoRideStatus.CANCELLED_BY_CUSTOMER)).not.toThrow();
    expect(() => assertTransition(GoRideStatus.ARRIVED, GoRideStatus.CANCELLED_BY_CUSTOMER)).not.toThrow();
    expect(() => assertTransition(GoRideStatus.IN_PROGRESS, GoRideStatus.CANCELLED_BY_CUSTOMER)).toThrow(GoException);
  });

  it('lets the driver cancel only while assigned or en route', () => {
    expect(canDriverCancel(GoRideStatus.DRIVER_ASSIGNED)).toBe(true);
    expect(canDriverCancel(GoRideStatus.DRIVER_EN_ROUTE)).toBe(true);
    expect(canDriverCancel(GoRideStatus.ARRIVED)).toBe(false);
    expect(() => assertTransition(GoRideStatus.DRIVER_ASSIGNED, GoRideStatus.CANCELLED_BY_DRIVER)).not.toThrow();
    expect(() => assertTransition(GoRideStatus.ARRIVED, GoRideStatus.CANCELLED_BY_DRIVER)).toThrow(GoException);
  });

  it('lets staff cancel any active ride', () => {
    expect(canStaffCancel(GoRideStatus.SEARCHING)).toBe(true);
    expect(canStaffCancel(GoRideStatus.IN_PROGRESS)).toBe(true);
    expect(canStaffCancel(GoRideStatus.COMPLETED)).toBe(false);
    expect(() => assertTransition(GoRideStatus.SEARCHING, GoRideStatus.CANCELLED_BY_STAFF)).not.toThrow();
    expect(() => assertTransition(GoRideStatus.IN_PROGRESS, GoRideStatus.CANCELLED_BY_STAFF)).not.toThrow();
  });

  it('allows returning to SEARCHING after breakdown before pickup', () => {
    expect(() => assertTransition(GoRideStatus.DRIVER_EN_ROUTE, GoRideStatus.SEARCHING)).not.toThrow();
    expect(() => assertTransition(GoRideStatus.ARRIVED, GoRideStatus.SEARCHING)).not.toThrow();
  });

  it('blocks illegal jumps', () => {
    try {
      assertTransition(GoRideStatus.SEARCHING, GoRideStatus.COMPLETED);
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(GoException);
      expect((e as GoException).code).toBe(GoErrorCode.INVALID_RIDE_TRANSITION);
    }
  });

  it('driver home active excludes reserved scheduled DRIVER_ASSIGNED', () => {
    expect(
      isDriverHomeActiveRide({ type: GoRideType.IMMEDIATE, status: GoRideStatus.DRIVER_ASSIGNED }),
    ).toBe(true);
    expect(
      isDriverHomeActiveRide({ type: GoRideType.SCHEDULED, status: GoRideStatus.DRIVER_ASSIGNED }),
    ).toBe(false);
    expect(
      isDriverHomeActiveRide({ type: GoRideType.SCHEDULED, status: GoRideStatus.DRIVER_EN_ROUTE }),
    ).toBe(true);
    expect(
      isDriverHomeActiveRide({ type: GoRideType.SCHEDULED, status: GoRideStatus.ARRIVED }),
    ).toBe(true);
    expect(
      isDriverHomeActiveRide({ type: GoRideType.SCHEDULED, status: GoRideStatus.IN_PROGRESS }),
    ).toBe(true);
  });
});
