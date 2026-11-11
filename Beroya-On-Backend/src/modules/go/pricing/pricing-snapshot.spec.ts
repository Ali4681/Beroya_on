import { Prisma } from '../../../generated/prisma/client';
import { calculateFare } from './fare.calculator';
import { pricingSnapshot, ridePricing } from './pricing-snapshot';

const current = {
  base_fare: new Prisma.Decimal(1000),
  price_per_km: new Prisma.Decimal(500),
  price_per_minute: new Prisma.Decimal(100),
  minimum_fare: new Prisma.Decimal(3000),
  currency: 'SYP',
};

describe('pricing snapshot', () => {
  it('keeps the creation rates after the category price changes', () => {
    const snapshot = pricingSnapshot(current);
    const later = { ...current, price_per_km: new Prisma.Decimal(900) };
    const rates = ridePricing(snapshot as unknown as Prisma.JsonValue, later);
    expect(calculateFare(rates, 10_000, 600).final_fare.toNumber()).toBe(7000);
  });

  it('falls back to the category pricing for rides without a snapshot', () => {
    const rates = ridePricing(null, current);
    expect(calculateFare(rates, 10_000, 600).final_fare.toNumber()).toBe(7000);
  });

  it('stores the night percentage and applies it after the minimum', () => {
    const snapshot = pricingSnapshot(current, 20);
    expect(snapshot.night_pct).toBe('20');
    // 2 km, 3 min → 2300 → minimum 3000 → +20% = 3600
    expect(calculateFare(snapshot, 2000, 180).final_fare.toNumber()).toBe(3600);
    expect(pricingSnapshot(current, 0).night_pct).toBeNull();
  });
});
