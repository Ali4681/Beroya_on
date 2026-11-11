import { Prisma } from '../../../generated/prisma/client';

type Num = Prisma.Decimal | number | string;

/**
 * new per-km = per-km × (1 + share% × (newFuel − oldFuel) ÷ oldFuel), rounded to the nearest `step`.
 * A missing or zero old fuel price leaves per-km unchanged (nothing to compare against).
 */
export function adjustPerKm(perKm: Num, oldFuel: Num | null, newFuel: Num, sharePct: Num, step: Num): Prisma.Decimal {
  const current = new Prisma.Decimal(perKm);
  if (oldFuel == null || new Prisma.Decimal(oldFuel).lte(0)) return current;
  const change = new Prisma.Decimal(newFuel).minus(oldFuel).div(oldFuel);
  const factor = new Prisma.Decimal(1).plus(new Prisma.Decimal(sharePct).div(100).times(change));
  const raw = current.times(factor);
  const s = new Prisma.Decimal(step);
  const rounded = s.gt(0) ? raw.div(s).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).times(s) : raw;
  return Prisma.Decimal.max(rounded, 0).toDecimalPlaces(2);
}
