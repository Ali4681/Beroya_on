import { adjustPerKm } from './fuel-math';

describe('adjustPerKm', () => {
  it('moves per-km by the same percent as fuel at 100% share', () => {
    // Fuel 10,000 → 11,000 (+10%), per-km 2,000 → 2,200.
    expect(adjustPerKm(2000, 10_000, 11_000, 100, 50).toNumber()).toBe(2200);
  });

  it('lowers per-km when fuel drops', () => {
    expect(adjustPerKm(2000, 10_000, 9_000, 100, 50).toNumber()).toBe(1800);
  });

  it('applies only the fuel share', () => {
    // +10% fuel at 60% share → +6% → 2,120 → nearest 50 = 2,100.
    expect(adjustPerKm(2000, 10_000, 11_000, 60, 50).toNumber()).toBe(2100);
    expect(adjustPerKm(2000, 10_000, 11_000, 60, 0).toNumber()).toBe(2120);
  });

  it('rounds to the nearest step', () => {
    // +5% → 1,575 → rounds half up to 1,600 with step 50.
    expect(adjustPerKm(1500, 10_000, 10_500, 100, 50).toNumber()).toBe(1600);
    expect(adjustPerKm(1500, 10_000, 10_400, 100, 50).toNumber()).toBe(1550);
  });

  it('leaves per-km unchanged without a previous fuel price', () => {
    expect(adjustPerKm(2000, null, 11_000, 100, 50).toNumber()).toBe(2000);
  });
});
