import { discountAmount } from './discount-math';

describe('discount amount', () => {
  it('applies the percentage and respects the cap', () => {
    expect(discountAmount(200, 10, null).toNumber()).toBe(20);
    expect(discountAmount(200, 10, 15).toNumber()).toBe(15);
  });

  it('never exceeds the gross fare', () => {
    expect(discountAmount(8, 100, 50).toNumber()).toBe(8);
  });
});
