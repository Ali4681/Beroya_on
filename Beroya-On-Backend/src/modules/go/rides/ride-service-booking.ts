import { GoServiceCode } from '@/generated/prisma/client';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';

/** Services that can be booked via POST /customer/rides today. */
export const BOOKABLE_SERVICE_CODES = [
  GoServiceCode.DAILY,
  GoServiceCode.TOURIST,
  GoServiceCode.FLEET,
  GoServiceCode.RENTAL,
  GoServiceCode.INTERCITY,
  GoServiceCode.ACCESSIBILITY,
  GoServiceCode.AMBULANCE,
] as const;

export type BookableServiceCode = (typeof BOOKABLE_SERVICE_CODES)[number];

export const MAX_VEHICLES_PER_RIDE = 20;

export type RideServiceBookingInput = {
  service_type?: GoServiceCode | null;
  passengers_count?: number | null;
  vehicles_count?: number | null;
};

export type RideServiceBooking = {
  service_code: GoServiceCode;
  passengers_count: number | null;
  vehicles_count: number;
};

/**
 * Normalizes and validates service / passenger / vehicle fields for DAILY + TOURIST.
 * FLEET is resolved via `resolveFleetBooking` in rides.service.
 */
export function resolveRideServiceBooking(
  input: RideServiceBookingInput,
  category: { max_passengers: number },
  serviceRow: { code: GoServiceCode; is_available: boolean } | null,
): RideServiceBooking {
  const service_code = input.service_type ?? GoServiceCode.DAILY;
  if (!BOOKABLE_SERVICE_CODES.includes(service_code as BookableServiceCode)) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [{ field: 'service_type', messages: [`service_type ${service_code} cannot be booked yet`] }],
    });
  }
  if (service_code === GoServiceCode.FLEET) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [{ field: 'service_type', messages: ['FLEET booking must use fleet vehicle fields'] }],
    });
  }
  if (service_code === GoServiceCode.RENTAL) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [{ field: 'service_type', messages: ['RENTAL booking must use rental duration fields'] }],
    });
  }
  if (!serviceRow || serviceRow.code !== service_code) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [{ field: 'service_type', messages: ['Unknown service'] }],
    });
  }
  if (!serviceRow.is_available) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [{ field: 'service_type', messages: ['This service is not available yet'] }],
    });
  }

  // DAILY + INTERCITY + ACCESSIBILITY + AMBULANCE: one vehicle, destination required, distance pricing.
  if (
    service_code === GoServiceCode.DAILY ||
    service_code === GoServiceCode.INTERCITY ||
    service_code === GoServiceCode.ACCESSIBILITY ||
    service_code === GoServiceCode.AMBULANCE
  ) {
    if (input.vehicles_count != null && input.vehicles_count !== 1) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: 'vehicles_count', messages: [`${service_code} rides use exactly 1 vehicle`] }],
      });
    }
    const passengers =
      input.passengers_count == null
        ? null
        : assertIntInRange(input.passengers_count, 1, category.max_passengers, 'passengers_count');
    return { service_code, passengers_count: passengers, vehicles_count: 1 };
  }

  // TOURIST — headcount is informational; do not cap by category.max_passengers × vehicles.
  if (input.passengers_count == null) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [{ field: 'passengers_count', messages: ['passengers_count is required for TOURIST'] }],
    });
  }
  const vehicles_count = assertIntInRange(
    input.vehicles_count ?? 1,
    1,
    MAX_VEHICLES_PER_RIDE,
    'vehicles_count',
  );
  const passengers_count = assertMinInt(input.passengers_count, 1, 'passengers_count');
  return { service_code, passengers_count, vehicles_count };
}

function assertIntInRange(value: number, min: number, max: number, field: string) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [{ field, messages: [`${field} must be an integer between ${min} and ${max}`] }],
    });
  }
  return value;
}

function assertMinInt(value: number, min: number, field: string) {
  if (!Number.isInteger(value) || value < min) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [{ field, messages: [`${field} must be an integer ≥ ${min}`] }],
    });
  }
  return value;
}
