import { Prisma } from '@/generated/prisma/client';

export function discountAmount(
  gross: Prisma.Decimal | number | string,
  percentage: Prisma.Decimal | number | string,
  maximum: Prisma.Decimal | number | string | null | undefined,
): Prisma.Decimal {
  const base = new Prisma.Decimal(gross);
  let discount = base.mul(new Prisma.Decimal(percentage)).div(100).toDecimalPlaces(2);
  if (maximum != null) discount = Prisma.Decimal.min(discount, new Prisma.Decimal(maximum));
  return Prisma.Decimal.min(discount, base);
}
