import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';

export type IntercityCityIds = {
  pickup_city_id?: string | null;
  destination_city_id?: string | null;
};

/**
 * Optional city pair for INTERCITY. If either id is set, both are required and must differ.
 */
export function assertIntercityCityPairIds(input: IntercityCityIds): {
  pickup_city_id: string;
  destination_city_id: string;
} | null {
  const pickup = input.pickup_city_id?.trim() || null;
  const destination = input.destination_city_id?.trim() || null;
  if (!pickup && !destination) return null;
  if (!pickup) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [{ field: 'pickup_city_id', messages: ['pickup_city_id is required when destination_city_id is set'] }],
    });
  }
  if (!destination) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [
        {
          field: 'destination_city_id',
          messages: ['destination_city_id is required when pickup_city_id is set'],
        },
      ],
    });
  }
  if (pickup === destination) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [
        {
          field: 'destination_city_id',
          messages: ['pickup_city_id and destination_city_id must be different cities'],
        },
      ],
    });
  }
  return { pickup_city_id: pickup, destination_city_id: destination };
}
