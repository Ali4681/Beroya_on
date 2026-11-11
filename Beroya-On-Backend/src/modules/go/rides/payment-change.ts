import { Prisma } from '@/generated/prisma/client';

export const RIDE_CHANGE_RETURN_REASON = 'ride_change_return';

/** Cash the customer still owes after wallet coverage. */
export function cashDueAmount(
  customerPayable: Prisma.Decimal | number | string | null | undefined,
  walletPaid: Prisma.Decimal | number | string | null | undefined,
) {
  const payable = Prisma.Decimal.max(new Prisma.Decimal(customerPayable ?? 0), 0);
  const paid = Prisma.Decimal.max(new Prisma.Decimal(walletPaid ?? 0), 0);
  return Prisma.Decimal.max(payable.minus(paid), 0);
}

/**
 * Change (الباقي) to credit the customer wallet when they hand more cash than `cashDue`.
 * Zero when `cashReceived` does not exceed the cash due.
 */
export function changeReturnAmount(
  cashReceived: Prisma.Decimal | number | string,
  cashDue: Prisma.Decimal | number | string,
) {
  const received = Prisma.Decimal.max(new Prisma.Decimal(cashReceived), 0);
  const due = Prisma.Decimal.max(new Prisma.Decimal(cashDue), 0);
  return Prisma.Decimal.max(received.minus(due), 0);
}
