import {
  GoCommissionBase,
  GoPaymentMethod,
  GoServiceCode,
  GoWalletTransactionType,
  Prisma,
} from '@/generated/prisma/client';
import { decimalToNumber } from '../pricing/fare.calculator';
import { cashDueAmount } from './payment-change';
import { RideDefaults } from './ride-rules';

export function showDestinationForService(serviceCode: GoServiceCode | string | null | undefined) {
  return serviceCode !== GoServiceCode.RENTAL;
}

export type CommissionStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'PENDING';

export interface DriverInvoice {
  /** إجمالي الأجرة المعروض — combined gross (استبدال) أو أجرة المقطع */
  gross_fare: number;
  /** ما يدفعه العميل بعد الخصم/التعويض */
  customer_payable: number;
  discount_total: number;
  /** مبلغ الخصم الذي أُودع في محفظة السائق على حساب الشركة */
  discount_subsidy: number;
  /** أساس حساب العمولة (مبلغ) حسب إعداد المحفظة */
  commission_base_fare: number;
  commission_base: GoCommissionBase;
  commission_percentage: number;
  /** العمولة المحسوبة (ليست null في المسار السعيد / حتى عند فشل الخصم) */
  commission_amount: number;
  /** ما خُصم فعلياً من المحفظة */
  commission_deducted: number;
  commission_status: CommissionStatus;
  /**
   * أرباح السائق = commission_base_fare − commission_amount
   * (لا تعتمد على نجاح الخصم من المحفظة)
   */
  driver_earnings: number;
  payment_method: GoPaymentMethod;
  payment_method_label_ar: string;
  /** Amount already taken from the customer wallet for this ride. */
  wallet_paid_amount: number;
  /** Remaining cash the customer owes: max(0, customer_payable − wallet_paid_amount). */
  cash_due: number;
  /** Change already credited to the customer wallet by the driver (0 if none). */
  change_returned_amount: number;
  /** True when the driver can still call return-change (completed, no prior return). */
  can_return_change: boolean;
  actual_distance_m: number | null;
  actual_duration_sec: number | null;
  completed_at: Date | null;
  pickup_address: string | null;
  destination_address: string | null;
  show_destination: boolean;
  billable_waiting_sec: number;
  free_waiting_sec: number;
  combined_gross_fare: number;
  original_segment_fare: number;
  replacement_segment_fare: number;
}

const PAYMENT_LABEL_AR: Record<GoPaymentMethod, string> = {
  [GoPaymentMethod.CASH]: 'كاش',
  [GoPaymentMethod.WALLET]: 'محفظة',
  [GoPaymentMethod.SHAM_CASH]: 'شام كاش',
};

export function paymentMethodLabelAr(method: GoPaymentMethod): string {
  return PAYMENT_LABEL_AR[method] ?? method;
}

export function parseCommissionFromReason(reason: string | null | undefined): number | null {
  if (!reason) return null;
  const match = /commission=([0-9]+(?:\.[0-9]+)?)/.exec(reason);
  return match ? Number(match[1]) : null;
}

export function buildDriverInvoice(input: {
  grossFare: Prisma.Decimal | number;
  customerPayable: Prisma.Decimal | number | null;
  discountTotal: Prisma.Decimal | number | null;
  segmentGross: Prisma.Decimal | number;
  originalSegment: Prisma.Decimal | number;
  combinedGross: Prisma.Decimal | number;
  commissionBase: GoCommissionBase;
  commissionPercentage: Prisma.Decimal | number;
  commissionAmount: Prisma.Decimal | number;
  commissionDeducted: Prisma.Decimal | number;
  commissionStatus: CommissionStatus;
  paymentMethod: GoPaymentMethod;
  discountSubsidy?: Prisma.Decimal | number | null;
  walletPaidAmount?: Prisma.Decimal | number | null;
  changeReturnedAmount?: Prisma.Decimal | number | null;
  canReturnChange?: boolean;
  actualDistanceM: number | null;
  actualDurationSec: number | null;
  completedAt: Date | null;
  pickupAddress: string | null;
  destinationAddress: string | null;
  serviceCode?: GoServiceCode | string | null;
  billableWaitingSec?: number | null;
}): DriverInvoice {
  const discountTotal = new Prisma.Decimal(input.discountTotal ?? 0);
  const discountSubsidy = new Prisma.Decimal(input.discountSubsidy ?? discountTotal);
  // Platform absorbs discounts — driver earnings stay on gross.
  const commissionBaseFare =
    discountTotal.gt(0) || input.commissionBase !== GoCommissionBase.CUSTOMER_PAYABLE
      ? new Prisma.Decimal(input.segmentGross)
      : new Prisma.Decimal(input.customerPayable ?? 0);
  const commissionAmount = new Prisma.Decimal(input.commissionAmount);
  const driverEarnings = commissionBaseFare.minus(commissionAmount);
  const walletPaid = new Prisma.Decimal(input.walletPaidAmount ?? 0);
  const cashDue = cashDueAmount(input.customerPayable, walletPaid);
  const changeReturned = new Prisma.Decimal(input.changeReturnedAmount ?? 0);

  return {
    gross_fare: decimalToNumber(input.grossFare),
    customer_payable: decimalToNumber(input.customerPayable ?? 0),
    discount_total: decimalToNumber(input.discountTotal ?? 0),
    discount_subsidy: decimalToNumber(discountSubsidy),
    commission_base_fare: decimalToNumber(commissionBaseFare),
    commission_base: input.commissionBase,
    commission_percentage: decimalToNumber(input.commissionPercentage),
    commission_amount: decimalToNumber(commissionAmount),
    commission_deducted: decimalToNumber(input.commissionDeducted),
    commission_status: input.commissionStatus,
    driver_earnings: decimalToNumber(driverEarnings),
    payment_method: input.paymentMethod,
    payment_method_label_ar: paymentMethodLabelAr(input.paymentMethod),
    wallet_paid_amount: decimalToNumber(walletPaid),
    cash_due: decimalToNumber(cashDue),
    change_returned_amount: decimalToNumber(changeReturned),
    can_return_change: input.canReturnChange ?? changeReturned.isZero(),
    actual_distance_m: input.actualDistanceM,
    actual_duration_sec: input.actualDurationSec,
    completed_at: input.completedAt,
    pickup_address: input.pickupAddress,
    destination_address: input.destinationAddress,
    show_destination: showDestinationForService(input.serviceCode),
    billable_waiting_sec: input.billableWaitingSec ?? 0,
    free_waiting_sec: RideDefaults.FREE_WAITING_SEC,
    combined_gross_fare: decimalToNumber(input.combinedGross),
    original_segment_fare: decimalToNumber(input.originalSegment),
    replacement_segment_fare: decimalToNumber(input.segmentGross),
  };
}

export function resolveCommissionStatus(input: {
  expected: Prisma.Decimal;
  deducted: Prisma.Decimal;
  finalizeFailed: boolean;
}): CommissionStatus {
  if (input.finalizeFailed) return 'FAILED';
  if (input.expected.lte(0)) return 'SUCCESS';
  if (input.deducted.lte(0) && input.expected.gt(0)) return 'PENDING';
  if (input.deducted.lt(input.expected)) return 'PARTIAL';
  return 'SUCCESS';
}

export type CommissionTxRow = {
  amount: Prisma.Decimal;
  reason: string | null;
  type: GoWalletTransactionType;
};

/** Rebuild commission figures from a ledger row + expected amount (for GET invoice). */
export function commissionFromLedger(
  expected: Prisma.Decimal,
  tx: CommissionTxRow | null,
): { amount: Prisma.Decimal; deducted: Prisma.Decimal; status: CommissionStatus } {
  if (!tx) {
    if (expected.lte(0)) {
      return { amount: expected, deducted: new Prisma.Decimal(0), status: 'SUCCESS' };
    }
    return { amount: expected, deducted: new Prisma.Decimal(0), status: 'PENDING' };
  }
  const deducted = new Prisma.Decimal(tx.amount);
  // Full deduct stores reason "commission" (amount === commission). Partial embeds commission= in reason.
  const fromReason = parseCommissionFromReason(tx.reason);
  const amount = fromReason != null ? new Prisma.Decimal(fromReason) : deducted;
  const status = resolveCommissionStatus({ expected: amount, deducted, finalizeFailed: false });
  return { amount, deducted, status };
}
