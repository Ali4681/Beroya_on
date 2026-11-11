import { Prisma } from '../../../generated/prisma/client';

const Decimal = Prisma.Decimal;

export interface PricingRates {
  base_fare: Prisma.Decimal | number | string;
  price_per_km: Prisma.Decimal | number | string;
  price_per_minute: Prisma.Decimal | number | string;
  minimum_fare: Prisma.Decimal | number | string;
  /** Night surcharge in percent, applied after the minimum. Null/0 = day fare. */
  night_pct?: Prisma.Decimal | number | string | null;
}

/**
 * Ticket §2.3–2.4: no surge. Immediate and Scheduled use the same formula.
 * Calculated = base + distanceKm * perKm + billableMinutes * perMinute
 * Final = max(Calculated, minimum) × (1 + night_pct / 100)
 */
export function calculateFare(
  rates: PricingRates,
  distanceMeters: number,
  billableSeconds: number,
  /** Ticket §29 — tourist (and other multi-vehicle) bookings scale the single-vehicle fare. */
  vehiclesCount = 1,
): { calculated: Prisma.Decimal; final_fare: Prisma.Decimal; distance_km: Prisma.Decimal; billable_minutes: Prisma.Decimal } {
  const base = new Decimal(rates.base_fare);
  const perKm = new Decimal(rates.price_per_km);
  const perMin = new Decimal(rates.price_per_minute);
  const minimum = new Decimal(rates.minimum_fare);
  const distanceKm = new Decimal(distanceMeters).div(1000);
  const billableMinutes = new Decimal(billableSeconds).div(60);
  const calculated = base.plus(distanceKm.times(perKm)).plus(billableMinutes.times(perMin));
  const night = new Decimal(rates.night_pct ?? 0);
  const dayFare = Decimal.max(calculated, minimum);
  const single = night.gt(0) ? dayFare.times(night.plus(100).div(100)).toDecimalPlaces(2) : dayFare;
  const vehicles = Math.max(1, Math.trunc(vehiclesCount) || 1);
  const final_fare = vehicles === 1 ? single : single.times(vehicles).toDecimalPlaces(2);
  const calculatedScaled = vehicles === 1 ? calculated : calculated.times(vehicles);
  return { calculated: calculatedScaled, final_fare, distance_km: distanceKm, billable_minutes: billableMinutes };
}

export function decimalToNumber(value: Prisma.Decimal | number | string): number {
  return new Decimal(value).toNumber();
}
