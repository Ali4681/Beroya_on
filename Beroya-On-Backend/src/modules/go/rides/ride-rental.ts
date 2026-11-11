import { Prisma } from '@/generated/prisma/client';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { calculateFare, decimalToNumber, type PricingRates } from '../pricing/fare.calculator';

/** Soft lead time: scheduled_at must be at least this far in the future. */
export const MIN_RENTAL_LEAD_SEC = 15 * 60;

export type RentalWindow = {
  scheduled_at: Date;
  ends_at: Date;
  duration_sec: number;
  duration_hours: number;
};

/**
 * Resolves RENTAL start/end from `ends_at` ISO or `duration_hours`.
 * No minimum duration — only requires ends_at > scheduled_at.
 */
export function resolveRentalWindow(input: {
  scheduled_at?: string | null;
  ends_at?: string | null;
  duration_hours?: number | null;
  now?: Date;
}): RentalWindow {
  if (!input.scheduled_at) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [{ field: 'scheduled_at', messages: ['scheduled_at is required for RENTAL'] }],
    });
  }
  const scheduled_at = new Date(input.scheduled_at);
  if (Number.isNaN(scheduled_at.getTime())) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [{ field: 'scheduled_at', messages: ['scheduled_at must be a valid ISO datetime'] }],
    });
  }
  const now = input.now ?? new Date();
  if (scheduled_at.getTime() <= now.getTime() + MIN_RENTAL_LEAD_SEC * 1000) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [
        {
          field: 'scheduled_at',
          messages: [`scheduled_at must be at least ${MIN_RENTAL_LEAD_SEC / 60} minutes in the future`],
        },
      ],
    });
  }

  let ends_at: Date;
  if (input.ends_at) {
    ends_at = new Date(input.ends_at);
    if (Number.isNaN(ends_at.getTime())) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: 'ends_at', messages: ['ends_at must be a valid ISO datetime'] }],
      });
    }
  } else if (input.duration_hours != null) {
    if (!(input.duration_hours > 0) || !Number.isFinite(input.duration_hours)) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: 'duration_hours', messages: ['duration_hours must be a number > 0'] }],
      });
    }
    ends_at = new Date(scheduled_at.getTime() + input.duration_hours * 3600 * 1000);
  } else {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [{ field: 'ends_at', messages: ['ends_at or duration_hours is required for RENTAL'] }],
    });
  }

  const duration_sec = Math.round((ends_at.getTime() - scheduled_at.getTime()) / 1000);
  if (duration_sec <= 0) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [{ field: 'ends_at', messages: ['ends_at must be after scheduled_at'] }],
    });
  }

  return {
    scheduled_at,
    ends_at,
    duration_sec,
    duration_hours: Math.round((duration_sec / 3600) * 100) / 100,
  };
}

/**
 * RENTAL fare = duration pricing (no route distance):
 * calculated = base_fare + billable_minutes × price_per_minute
 * final = max(calculated, minimum_fare) × (1 + night_pct/100)
 */
export function calculateRentalFare(rates: PricingRates, durationSec: number) {
  return calculateFare(rates, 0, durationSec, 1);
}

export function rentalPricingBasis(rates: PricingRates, window: RentalWindow) {
  const fare = calculateRentalFare(rates, window.duration_sec);
  return {
    model: 'DURATION' as const,
    description:
      'base_fare + billable_minutes × price_per_minute, then max(minimum_fare), then night surcharge if any',
    base_fare: decimalToNumber(rates.base_fare),
    price_per_minute: decimalToNumber(rates.price_per_minute),
    minimum_fare: decimalToNumber(rates.minimum_fare),
    night_pct: rates.night_pct != null ? decimalToNumber(rates.night_pct) : 0,
    billable_minutes: decimalToNumber(fare.billable_minutes),
    duration_sec: window.duration_sec,
    duration_hours: window.duration_hours,
    calculated: decimalToNumber(fare.calculated),
  };
}

export function rentalSyntheticRoute(durationSec: number) {
  return {
    route_id: 'rental-duration',
    summary: 'RENTAL',
    distance_m: 0,
    duration_sec: durationSec,
    encoded_polyline: '',
    source: 'RENTAL' as const,
  };
}

export function asDecimalFare(fare: { final_fare: Prisma.Decimal }) {
  return fare.final_fare;
}
