import { GoPaymentMethod, GoRideStatus, Prisma } from '@/generated/prisma/client';
import { initialPaymentStatus, paymentStatusFor } from './payment-status';

describe('payment status', () => {
  it('expects cash on a cash ride and stays pending for other methods', () => {
    expect(initialPaymentStatus(GoPaymentMethod.CASH)).toBe('CASH_EXPECTED');
    expect(initialPaymentStatus(GoPaymentMethod.SHAM_CASH)).toBe('PENDING');
  });

  it('keeps the in-progress status until the ride is completed', () => {
    expect(paymentStatusFor(GoRideStatus.IN_PROGRESS, GoPaymentMethod.CASH, new Prisma.Decimal(10))).toBe(
      'CASH_EXPECTED',
    );
  });

  it('collects a positive payable and waives a zero payable', () => {
    expect(paymentStatusFor(GoRideStatus.COMPLETED, GoPaymentMethod.CASH, new Prisma.Decimal(12))).toBe('COLLECTED');
    expect(paymentStatusFor(GoRideStatus.COMPLETED, GoPaymentMethod.CASH, new Prisma.Decimal(0))).toBe('WAIVED');
  });

  it('collects a wallet ride the wallet covers and expects cash for the rest', () => {
    expect(initialPaymentStatus(GoPaymentMethod.WALLET)).toBe('PENDING');
    expect(
      paymentStatusFor(GoRideStatus.COMPLETED, GoPaymentMethod.WALLET, new Prisma.Decimal(50), new Prisma.Decimal(50)),
    ).toBe('COLLECTED');
    expect(
      paymentStatusFor(GoRideStatus.COMPLETED, GoPaymentMethod.WALLET, new Prisma.Decimal(50), new Prisma.Decimal(30)),
    ).toBe('CASH_EXPECTED');
  });
});
