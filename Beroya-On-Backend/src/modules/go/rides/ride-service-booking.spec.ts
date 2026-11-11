import { GoServiceCode } from '@/generated/prisma/client';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { resolveRideServiceBooking } from './ride-service-booking';

describe('resolveRideServiceBooking', () => {
  const category = { max_passengers: 4 };
  const daily = { code: GoServiceCode.DAILY, is_available: true };
  const intercity = { code: GoServiceCode.INTERCITY, is_available: true };
  const tourist = { code: GoServiceCode.TOURIST, is_available: true };

  it('defaults to DAILY with 1 vehicle', () => {
    expect(resolveRideServiceBooking({}, category, daily)).toEqual({
      service_code: GoServiceCode.DAILY,
      passengers_count: null,
      vehicles_count: 1,
    });
  });

  it('rejects TOURIST without passengers_count', () => {
    try {
      resolveRideServiceBooking({ service_type: GoServiceCode.TOURIST, vehicles_count: 2 }, category, tourist);
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(GoException);
      expect((err as GoException).code).toBe(GoErrorCode.VALIDATION_ERROR);
    }
  });

  it('accepts TOURIST multi-vehicle without capacity cap', () => {
    expect(
      resolveRideServiceBooking(
        { service_type: GoServiceCode.TOURIST, passengers_count: 20, vehicles_count: 4 },
        category,
        tourist,
      ),
    ).toEqual({
      service_code: GoServiceCode.TOURIST,
      passengers_count: 20,
      vehicles_count: 4,
    });
  });

  it('rejects unavailable service', () => {
    try {
      resolveRideServiceBooking(
        { service_type: GoServiceCode.TOURIST, passengers_count: 2 },
        category,
        { ...tourist, is_available: false },
      );
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(GoException);
      expect((err as GoException).code).toBe(GoErrorCode.VALIDATION_ERROR);
    }
  });

  it('accepts INTERCITY like DAILY (1 vehicle)', () => {
    expect(
      resolveRideServiceBooking({ service_type: GoServiceCode.INTERCITY, passengers_count: 2 }, category, intercity),
    ).toEqual({
      service_code: GoServiceCode.INTERCITY,
      passengers_count: 2,
      vehicles_count: 1,
    });
  });

  it('accepts ACCESSIBILITY like DAILY (1 vehicle)', () => {
    const accessibility = { code: GoServiceCode.ACCESSIBILITY, is_available: true };
    expect(
      resolveRideServiceBooking(
        { service_type: GoServiceCode.ACCESSIBILITY, passengers_count: 1 },
        category,
        accessibility,
      ),
    ).toEqual({
      service_code: GoServiceCode.ACCESSIBILITY,
      passengers_count: 1,
      vehicles_count: 1,
    });
  });

  it('accepts AMBULANCE like DAILY (1 vehicle)', () => {
    const ambulance = { code: GoServiceCode.AMBULANCE, is_available: true };
    expect(
      resolveRideServiceBooking(
        { service_type: GoServiceCode.AMBULANCE, passengers_count: 2 },
        { max_passengers: 3 },
        ambulance,
      ),
    ).toEqual({
      service_code: GoServiceCode.AMBULANCE,
      passengers_count: 2,
      vehicles_count: 1,
    });
  });

  it('rejects INTERCITY with vehicles_count !== 1', () => {
    try {
      resolveRideServiceBooking(
        { service_type: GoServiceCode.INTERCITY, vehicles_count: 2 },
        category,
        intercity,
      );
      fail('expected throw');
    } catch (err) {
      expect((err as GoException).code).toBe(GoErrorCode.VALIDATION_ERROR);
    }
  });
});
