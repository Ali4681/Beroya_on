import { Prisma } from '../../../generated/prisma/client';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import type { PricingRates } from './fare.calculator';

export interface PricingSnapshot {
  base_fare: string;
  price_per_km: string;
  price_per_minute: string;
  minimum_fare: string;
  night_pct: string | null;
  currency: string;
  /** FLEET mix: frozen rates per category line at create time. */
  fleet_lines?: Array<{
    ride_category_id: string;
    count: number;
    base_fare: string;
    price_per_km: string;
    price_per_minute: string;
    minimum_fare: string;
    night_pct: string | null;
  }>;
  random_vehicles?: boolean;
  vehicles_count?: number;
}

type CategoryPricing = Omit<PricingRates, 'night_pct'> & { currency: string };

export function pricingSnapshot(pricing: CategoryPricing, nightPct?: Prisma.Decimal | number | null): PricingSnapshot {
  const night = nightPct != null && new Prisma.Decimal(nightPct).gt(0) ? new Prisma.Decimal(nightPct).toString() : null;
  return {
    base_fare: new Prisma.Decimal(pricing.base_fare).toString(),
    price_per_km: new Prisma.Decimal(pricing.price_per_km).toString(),
    price_per_minute: new Prisma.Decimal(pricing.price_per_minute).toString(),
    minimum_fare: new Prisma.Decimal(pricing.minimum_fare).toString(),
    night_pct: night,
    currency: pricing.currency,
  };
}

function isSnapshot(value: unknown): value is PricingSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return ['base_fare', 'price_per_km', 'price_per_minute', 'minimum_fare'].every((k) => v[k] != null);
}

/** Rates a ride is billed with: its creation snapshot, or the category's current pricing for older rides. */
export function ridePricing(snapshot: Prisma.JsonValue | null | undefined, current: CategoryPricing | null | undefined): PricingRates {
  if (isSnapshot(snapshot)) return snapshot;
  if (!current) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Pricing missing');
  return current;
}

export function asPricingSnapshot(value: Prisma.JsonValue | null | undefined): PricingSnapshot | null {
  return isSnapshot(value) ? value : null;
}
