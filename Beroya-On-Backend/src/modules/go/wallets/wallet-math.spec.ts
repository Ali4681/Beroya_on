import { settleCommission, settleRideWallet } from './wallet-math';

describe('commission settlement', () => {
  it('deducts the full commission when the balance covers it', () => {
    const result = settleCommission(50, 12);
    expect(result.deduct.toNumber()).toBe(12);
    expect(result.shortfall.toNumber()).toBe(0);
    expect(result.balanceAfter.toNumber()).toBe(38);
  });

  it('stops at zero and records the shortfall', () => {
    const result = settleCommission(4, 10);
    expect(result.deduct.toNumber()).toBe(4);
    expect(result.shortfall.toNumber()).toBe(6);
    expect(result.balanceAfter.toNumber()).toBe(0);
  });

  it('does not deduct from an empty wallet', () => {
    const result = settleCommission(0, 8);
    expect(result.deduct.toNumber()).toBe(0);
    expect(result.shortfall.toNumber()).toBe(8);
  });
});

describe('ride wallet settlement', () => {
  it('refunds the excess when the final fare is below the hold', () => {
    const result = settleRideWallet(100, 80, 0);
    expect(result.change.toNumber()).toBe(-20);
    expect(result.paidAfter.toNumber()).toBe(80);
    expect(result.cashRemainder.toNumber()).toBe(0);
  });

  it('charges the difference when the balance covers it', () => {
    const result = settleRideWallet(100, 130, 50);
    expect(result.change.toNumber()).toBe(30);
    expect(result.paidAfter.toNumber()).toBe(130);
    expect(result.cashRemainder.toNumber()).toBe(0);
  });

  it('leaves the uncovered part for cash', () => {
    const result = settleRideWallet(100, 130, 10);
    expect(result.change.toNumber()).toBe(10);
    expect(result.paidAfter.toNumber()).toBe(110);
    expect(result.cashRemainder.toNumber()).toBe(20);
  });

  it('refunds everything when the target is zero', () => {
    const result = settleRideWallet(100, 0, 0);
    expect(result.change.toNumber()).toBe(-100);
    expect(result.paidAfter.toNumber()).toBe(0);
  });
});
