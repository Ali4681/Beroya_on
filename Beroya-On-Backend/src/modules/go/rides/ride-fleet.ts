import { GoServiceCode, Prisma } from '@/generated/prisma/client';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { calculateFare, decimalToNumber, type PricingRates } from '../pricing/fare.calculator';
import { MAX_VEHICLES_PER_RIDE } from './ride-service-booking';

export const FLEET_EXCLUDED_CATEGORY_CODE = 'TAXI';

export type FleetVehicleLineInput = {
  ride_category_id: string;
  count: number;
};

export type FleetVehicleLine = {
  ride_category_id: string;
  count: number;
};

export type FleetBookingResolved = {
  service_code: typeof GoServiceCode.FLEET;
  vehicles_count: number;
  random_vehicles: boolean;
  /** Null when random_vehicles. */
  fleet_vehicles: FleetVehicleLine[] | null;
  passengers_count: number | null;
};

type CategoryRow = {
  id: string;
  code: string;
  is_active: boolean;
  pricing: PricingRates & { currency: string; is_active?: boolean } | null;
};

/** Validates FLEET vehicle mix / random flags (categories loaded by the caller). */
export function resolveFleetBooking(
  input: {
    vehicles_count?: number | null;
    random_vehicles?: boolean | null;
    vehicles?: FleetVehicleLineInput[] | null;
    passengers_count?: number | null;
  },
  primary: { id: string; code: string },
  categoriesById: Map<string, CategoryRow>,
): FleetBookingResolved {
  if (primary.code === FLEET_EXCLUDED_CATEGORY_CODE) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [{ field: 'ride_category_id', messages: ['TAXI cannot be used for FLEET'] }],
    });
  }

  if (input.vehicles_count == null) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [{ field: 'vehicles_count', messages: ['vehicles_count is required for FLEET'] }],
    });
  }
  const vehicles_count = assertIntInRange(input.vehicles_count, 1, MAX_VEHICLES_PER_RIDE, 'vehicles_count');
  const random_vehicles = input.random_vehicles === true;
  const passengers_count =
    input.passengers_count == null ? null : assertMinInt(input.passengers_count, 1, 'passengers_count');

  if (random_vehicles) {
    return {
      service_code: GoServiceCode.FLEET,
      vehicles_count,
      random_vehicles: true,
      fleet_vehicles: null,
      passengers_count,
    };
  }

  const raw = input.vehicles;
  if (!raw?.length) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [{ field: 'vehicles', messages: ['vehicles is required when random_vehicles is false'] }],
    });
  }

  const merged = new Map<string, number>();
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i];
    const field = `vehicles[${i}]`;
    if (!line?.ride_category_id) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: `${field}.ride_category_id`, messages: ['ride_category_id is required'] }],
      });
    }
    const count = assertIntInRange(line.count, 1, MAX_VEHICLES_PER_RIDE, `${field}.count`);
    const cat = categoriesById.get(line.ride_category_id);
    if (!cat?.is_active || !cat.pricing?.is_active) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: `${field}.ride_category_id`, messages: ['Unknown or inactive ride category'] }],
      });
    }
    if (cat.code === FLEET_EXCLUDED_CATEGORY_CODE) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: `${field}.ride_category_id`, messages: ['TAXI cannot be used for FLEET'] }],
      });
    }
    merged.set(line.ride_category_id, (merged.get(line.ride_category_id) ?? 0) + count);
  }

  const fleet_vehicles = [...merged.entries()].map(([ride_category_id, count]) => ({ ride_category_id, count }));
  const sum = fleet_vehicles.reduce((n, l) => n + l.count, 0);
  if (sum !== vehicles_count) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [
        {
          field: 'vehicles',
          messages: [`sum of vehicles[].count (${sum}) must equal vehicles_count (${vehicles_count})`],
        },
      ],
    });
  }

  return {
    service_code: GoServiceCode.FLEET,
    vehicles_count,
    random_vehicles: false,
    fleet_vehicles,
    passengers_count,
  };
}

export type FleetFareLine = {
  ride_category_id: string;
  count: number;
  rates: PricingRates;
};

/** Sum of per-category fares (mix) or primary × vehicles_count (random). */
export function calculateFleetFare(
  distanceMeters: number,
  billableSeconds: number,
  opts: { random_vehicles: boolean; vehicles_count: number; primary: PricingRates; lines?: FleetFareLine[] },
): { final_fare: Prisma.Decimal; calculated: Prisma.Decimal } {
  if (opts.random_vehicles || !opts.lines?.length) {
    return calculateFare(opts.primary, distanceMeters, billableSeconds, opts.vehicles_count);
  }
  let final = new Prisma.Decimal(0);
  let calculated = new Prisma.Decimal(0);
  for (const line of opts.lines) {
    const part = calculateFare(line.rates, distanceMeters, billableSeconds, line.count);
    final = final.plus(part.final_fare);
    calculated = calculated.plus(part.calculated);
  }
  return { final_fare: final.toDecimalPlaces(2), calculated };
}

export function fleetLinesForSnapshot(
  lines: FleetFareLine[],
): Array<FleetVehicleLine & PricingRates> {
  return lines.map((l) => ({
    ride_category_id: l.ride_category_id,
    count: l.count,
    base_fare: String(l.rates.base_fare),
    price_per_km: String(l.rates.price_per_km),
    price_per_minute: String(l.rates.price_per_minute),
    minimum_fare: String(l.rates.minimum_fare),
    night_pct: l.rates.night_pct != null ? String(l.rates.night_pct) : null,
  }));
}

export function parseFleetVehiclesJson(value: Prisma.JsonValue | null | undefined): FleetVehicleLine[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  const out: FleetVehicleLine[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    if (typeof r.ride_category_id !== 'string' || typeof r.count !== 'number') continue;
    out.push({ ride_category_id: r.ride_category_id, count: r.count });
  }
  return out.length ? out : null;
}

export function publicFleetVehicles(
  lines: FleetVehicleLine[] | null,
  categories: Map<string, { id: string; code: string; name_ar: string; name_en: string | null }>,
  fallback: { id: string; code: string; name_ar: string; name_en: string | null },
  vehiclesCount: number,
  random: boolean,
) {
  if (random || !lines?.length) {
    return [
      {
        ride_category_id: fallback.id,
        count: vehiclesCount,
        random: true,
        category: fallback,
      },
    ];
  }
  return lines.map((l) => {
    const category = categories.get(l.ride_category_id) ?? fallback;
    return {
      ride_category_id: l.ride_category_id,
      count: l.count,
      random: false,
      category,
    };
  });
}

export function fleetFareNumber(
  distanceMeters: number,
  billableSeconds: number,
  opts: Parameters<typeof calculateFleetFare>[2],
) {
  return decimalToNumber(calculateFleetFare(distanceMeters, billableSeconds, opts).final_fare);
}

/** Bill a stored ride using fleet_lines in the pricing snapshot when present. */
export function fareFromPricingSnapshot(
  snapshot: Prisma.JsonValue | null | undefined,
  current: PricingRates | null | undefined,
  distanceMeters: number,
  billableSeconds: number,
  vehiclesCount = 1,
): { final_fare: Prisma.Decimal; calculated: Prisma.Decimal } {
  const snap =
    snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
      ? (snapshot as Record<string, unknown>)
      : null;
  const fleetLines = Array.isArray(snap?.fleet_lines) ? snap!.fleet_lines : null;
  const random = snap?.random_vehicles === true;
  const primary = (() => {
    if (snap && ['base_fare', 'price_per_km', 'price_per_minute', 'minimum_fare'].every((k) => snap[k] != null)) {
      return {
        base_fare: snap.base_fare as string,
        price_per_km: snap.price_per_km as string,
        price_per_minute: snap.price_per_minute as string,
        minimum_fare: snap.minimum_fare as string,
        night_pct: (snap.night_pct as string | null) ?? null,
      };
    }
    if (!current) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Pricing missing');
    return current;
  })();

  if (!random && fleetLines?.length) {
    const lines: FleetFareLine[] = [];
    for (const row of fleetLines) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      const r = row as Record<string, unknown>;
      if (typeof r.ride_category_id !== 'string' || typeof r.count !== 'number') continue;
      lines.push({
        ride_category_id: r.ride_category_id,
        count: r.count,
        rates: {
          base_fare: String(r.base_fare ?? primary.base_fare),
          price_per_km: String(r.price_per_km ?? primary.price_per_km),
          price_per_minute: String(r.price_per_minute ?? primary.price_per_minute),
          minimum_fare: String(r.minimum_fare ?? primary.minimum_fare),
          night_pct: (r.night_pct as string | null | undefined) ?? primary.night_pct ?? null,
        },
      });
    }
    if (lines.length) {
      return calculateFleetFare(distanceMeters, billableSeconds, {
        random_vehicles: false,
        vehicles_count: vehiclesCount,
        primary,
        lines,
      });
    }
  }

  if (snap?.rental === true) {
    const duration =
      typeof snap.rental_duration_sec === 'number' && snap.rental_duration_sec > 0
        ? snap.rental_duration_sec
        : billableSeconds;
    return calculateFare(primary, 0, duration, 1);
  }

  const count =
    typeof snap?.vehicles_count === 'number' && snap.vehicles_count > 0 ? snap.vehicles_count : vehiclesCount;
  return calculateFare(primary, distanceMeters, billableSeconds, count);
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
