import { Prisma } from '@/generated/prisma/client';

export type FareStackChoice = 'PENDING' | 'DISCOUNT_ONLY' | 'COMPENSATION_ONLY' | 'BOTH' | null;

export interface FareStackResult {
  payable: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  compensationTotal: Prisma.Decimal;
  decision: FareStackChoice;
  consumeDiscount: boolean;
  releaseDiscount: boolean;
}

const zero = () => new Prisma.Decimal(0);

/**
 * Ticket §44 — a discount and a compensation on the same ride are not stacked
 * until staff records a decision. Either one alone is applied immediately.
 */
export function resolveFareStack(input: {
  gross: Prisma.Decimal;
  discount: Prisma.Decimal;
  compensation: Prisma.Decimal;
  decision: FareStackChoice;
}): FareStackResult {
  const gross = input.gross;
  const discount = Prisma.Decimal.max(input.discount, 0);
  const compensation = Prisma.Decimal.max(input.compensation, 0);
  const both = discount.gt(0) && compensation.gt(0);

  if (!both) {
    return {
      payable: Prisma.Decimal.max(gross.minus(discount).minus(compensation), 0),
      discountTotal: discount,
      compensationTotal: compensation,
      decision: null,
      consumeDiscount: discount.gt(0),
      releaseDiscount: false,
    };
  }

  const chosen = input.decision === 'PENDING' || input.decision == null ? null : input.decision;
  if (!chosen) {
    return {
      payable: gross,
      discountTotal: zero(),
      compensationTotal: compensation,
      decision: 'PENDING',
      consumeDiscount: false,
      releaseDiscount: false,
    };
  }

  if (chosen === 'DISCOUNT_ONLY') {
    return {
      payable: Prisma.Decimal.max(gross.minus(discount), 0),
      discountTotal: discount,
      compensationTotal: zero(),
      decision: chosen,
      consumeDiscount: true,
      releaseDiscount: false,
    };
  }

  if (chosen === 'COMPENSATION_ONLY') {
    return {
      payable: Prisma.Decimal.max(gross.minus(compensation), 0),
      discountTotal: zero(),
      compensationTotal: compensation,
      decision: chosen,
      consumeDiscount: false,
      releaseDiscount: true,
    };
  }

  return {
    payable: Prisma.Decimal.max(gross.minus(discount).minus(compensation), 0),
    discountTotal: discount,
    compensationTotal: compensation,
    decision: 'BOTH',
    consumeDiscount: true,
    releaseDiscount: false,
  };
}
