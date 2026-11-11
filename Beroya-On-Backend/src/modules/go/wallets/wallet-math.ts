import { Prisma } from '@/generated/prisma/client';

/** Ticket §20.6 — never drive the wallet negative; the rest is an internal due. */
export function settleCommission(balance: Prisma.Decimal | number | string, commission: Prisma.Decimal | number | string) {
  const available = Prisma.Decimal.max(new Prisma.Decimal(balance), 0);
  const due = Prisma.Decimal.max(new Prisma.Decimal(commission), 0);
  const deduct = Prisma.Decimal.min(due, available);
  return {
    deduct,
    shortfall: due.minus(deduct),
    balanceAfter: available.minus(deduct),
  };
}

/**
 * Moves what a WALLET ride has taken from the customer wallet toward `target`.
 * Extra charges stop at the available balance; the rest is left for cash collection.
 * Positive `change` debits the wallet, negative refunds it.
 */
export function settleRideWallet(
  paid: Prisma.Decimal | number | string,
  target: Prisma.Decimal | number | string,
  balance: Prisma.Decimal | number | string,
) {
  const already = Prisma.Decimal.max(new Prisma.Decimal(paid), 0);
  const wanted = Prisma.Decimal.max(new Prisma.Decimal(target), 0);
  const available = Prisma.Decimal.max(new Prisma.Decimal(balance), 0);
  const change = wanted.gte(already)
    ? Prisma.Decimal.min(wanted.minus(already), available)
    : wanted.minus(already);
  const paidAfter = already.plus(change);
  return { change, paidAfter, cashRemainder: wanted.minus(paidAfter) };
}
