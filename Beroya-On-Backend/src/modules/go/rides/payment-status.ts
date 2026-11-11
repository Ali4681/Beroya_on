import { GoPaymentMethod, GoPaymentStatus, GoRideStatus, Prisma } from '@/generated/prisma/client';

export function initialPaymentStatus(method: GoPaymentMethod): GoPaymentStatus {
  return method === GoPaymentMethod.CASH ? GoPaymentStatus.CASH_EXPECTED : GoPaymentStatus.PENDING;
}

/**
 * Collected when the customer still owes cash. Waived when the payable is zero.
 * A WALLET ride the wallet could not fully cover expects the remainder in cash.
 */
export function paymentStatusFor(
  rideStatus: GoRideStatus,
  method: GoPaymentMethod,
  payable: Prisma.Decimal,
  walletPaid: Prisma.Decimal = new Prisma.Decimal(0),
): GoPaymentStatus {
  if (rideStatus !== GoRideStatus.COMPLETED) return initialPaymentStatus(method);
  if (payable.lte(0)) return GoPaymentStatus.WAIVED;
  if (method === GoPaymentMethod.WALLET && walletPaid.lt(payable)) return GoPaymentStatus.CASH_EXPECTED;
  return GoPaymentStatus.COLLECTED;
}
