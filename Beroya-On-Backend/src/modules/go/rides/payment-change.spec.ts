import { cashDueAmount, changeReturnAmount } from './payment-change';

describe('payment-change', () => {
  it('cash due is payable minus wallet paid', () => {
    expect(cashDueAmount(10000, 7000).toNumber()).toBe(3000);
    expect(cashDueAmount(10000, 10000).toNumber()).toBe(0);
    expect(cashDueAmount(8000, 10000).toNumber()).toBe(0);
  });

  it('change is only the excess over cash due', () => {
    expect(changeReturnAmount(10000, 7500).toNumber()).toBe(2500);
    expect(changeReturnAmount(7500, 7500).toNumber()).toBe(0);
    expect(changeReturnAmount(5000, 7500).toNumber()).toBe(0);
  });
});
