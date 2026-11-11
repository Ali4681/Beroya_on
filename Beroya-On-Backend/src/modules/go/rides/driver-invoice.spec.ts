import {
  GoCommissionBase,
  GoPaymentMethod,
  GoServiceCode,
  GoWalletTransactionType,
  Prisma,
} from '@/generated/prisma/client';
import {
  buildDriverInvoice,
  commissionFromLedger,
  paymentMethodLabelAr,
  resolveCommissionStatus,
  showDestinationForService,
} from './driver-invoice';

describe('driver-invoice', () => {
  it('labels payment methods in Arabic', () => {
    expect(paymentMethodLabelAr(GoPaymentMethod.CASH)).toBe('كاش');
    expect(paymentMethodLabelAr(GoPaymentMethod.WALLET)).toBe('محفظة');
  });

  it('computes driver_earnings from commission base minus commission_amount', () => {
    const invoice = buildDriverInvoice({
      grossFare: 5000,
      customerPayable: 4500,
      discountTotal: 500,
      segmentGross: 5000,
      originalSegment: 0,
      combinedGross: 5000,
      commissionBase: GoCommissionBase.GROSS_FINAL_FARE,
      commissionPercentage: 10,
      commissionAmount: 450,
      commissionDeducted: 450,
      commissionStatus: 'SUCCESS',
      paymentMethod: GoPaymentMethod.CASH,
      actualDistanceM: 5000,
      actualDurationSec: 1500,
      completedAt: new Date('2025-10-05T07:25:00Z'),
      pickupAddress: 'المزة',
      destinationAddress: 'المالكي',
    });
    expect(invoice.gross_fare).toBe(5000);
    expect(invoice.customer_payable).toBe(4500);
    expect(invoice.discount_subsidy).toBe(500);
    expect(invoice.driver_earnings).toBe(4550);
    expect(invoice.commission_base_fare).toBe(5000);
    expect(invoice.payment_method_label_ar).toBe('كاش');
    expect(invoice.show_destination).toBe(true);
    expect(invoice.free_waiting_sec).toBe(120);
  });

  it('hides destination for RENTAL invoices', () => {
    expect(showDestinationForService(GoServiceCode.RENTAL)).toBe(false);
    expect(showDestinationForService(GoServiceCode.DAILY)).toBe(true);
    const invoice = buildDriverInvoice({
      grossFare: 1000,
      customerPayable: 1000,
      discountTotal: 0,
      segmentGross: 1000,
      originalSegment: 0,
      combinedGross: 1000,
      commissionBase: GoCommissionBase.GROSS_FINAL_FARE,
      commissionPercentage: 10,
      commissionAmount: 100,
      commissionDeducted: 100,
      commissionStatus: 'SUCCESS',
      paymentMethod: GoPaymentMethod.CASH,
      actualDistanceM: 0,
      actualDurationSec: 0,
      completedAt: new Date(),
      pickupAddress: 'A',
      destinationAddress: 'A',
      serviceCode: GoServiceCode.RENTAL,
      billableWaitingSec: 30,
    });
    expect(invoice.show_destination).toBe(false);
    expect(invoice.billable_waiting_sec).toBe(30);
  });

  it('keeps driver commission on gross when a discount applies (platform absorbs)', () => {
    const invoice = buildDriverInvoice({
      grossFare: 5000,
      customerPayable: 4500,
      discountTotal: 500,
      segmentGross: 5000,
      originalSegment: 0,
      combinedGross: 5000,
      commissionBase: GoCommissionBase.CUSTOMER_PAYABLE,
      commissionPercentage: 10,
      commissionAmount: 500,
      commissionDeducted: 500,
      commissionStatus: 'SUCCESS',
      paymentMethod: GoPaymentMethod.WALLET,
      actualDistanceM: null,
      actualDurationSec: null,
      completedAt: null,
      pickupAddress: null,
      destinationAddress: null,
    });
    expect(invoice.commission_base_fare).toBe(5000);
    expect(invoice.driver_earnings).toBe(4500);
  });

  it('uses customer_payable as commission base when configured and no discount', () => {
    const invoice = buildDriverInvoice({
      grossFare: 5000,
      customerPayable: 5000,
      discountTotal: 0,
      segmentGross: 5000,
      originalSegment: 0,
      combinedGross: 5000,
      commissionBase: GoCommissionBase.CUSTOMER_PAYABLE,
      commissionPercentage: 10,
      commissionAmount: 500,
      commissionDeducted: 500,
      commissionStatus: 'SUCCESS',
      paymentMethod: GoPaymentMethod.WALLET,
      actualDistanceM: null,
      actualDurationSec: null,
      completedAt: null,
      pickupAddress: null,
      destinationAddress: null,
    });
    expect(invoice.commission_base_fare).toBe(5000);
    expect(invoice.driver_earnings).toBe(4500);
  });

  it('maps commission status for success / partial / failed / pending', () => {
    expect(
      resolveCommissionStatus({
        expected: new Prisma.Decimal(450),
        deducted: new Prisma.Decimal(450),
        finalizeFailed: false,
      }),
    ).toBe('SUCCESS');
    expect(
      resolveCommissionStatus({
        expected: new Prisma.Decimal(450),
        deducted: new Prisma.Decimal(200),
        finalizeFailed: false,
      }),
    ).toBe('PARTIAL');
    expect(
      resolveCommissionStatus({
        expected: new Prisma.Decimal(450),
        deducted: new Prisma.Decimal(0),
        finalizeFailed: true,
      }),
    ).toBe('FAILED');
    expect(
      resolveCommissionStatus({
        expected: new Prisma.Decimal(450),
        deducted: new Prisma.Decimal(0),
        finalizeFailed: false,
      }),
    ).toBe('PENDING');
  });

  it('rebuilds commission from ledger row', () => {
    const fromTx = commissionFromLedger(new Prisma.Decimal(450), {
      amount: new Prisma.Decimal(450),
      reason: 'commission',
      type: GoWalletTransactionType.COMMISSION_DEDUCTION,
    });
    expect(fromTx.status).toBe('SUCCESS');
    expect(Number(fromTx.deducted)).toBe(450);

    const partial = commissionFromLedger(new Prisma.Decimal(450), {
      amount: new Prisma.Decimal(100),
      reason: 'partial; due=350.00; commission=450.00',
      type: GoWalletTransactionType.COMMISSION_DEDUCTION,
    });
    expect(Number(partial.amount)).toBe(450);
    expect(partial.status).toBe('PARTIAL');

    const pending = commissionFromLedger(new Prisma.Decimal(450), null);
    expect(pending.status).toBe('PENDING');
  });
});
