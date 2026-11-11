import { calculateFare } from './fare.calculator';

describe('calculateFare', () => {
  const rates = {
    base_fare: 1000,
    price_per_km: 500,
    price_per_minute: 100,
    minimum_fare: 3000,
  };

  it('applies base + distance + time', () => {
    // 2 km, 3 minutes → 1000 + 1000 + 300 = 2300 → min 3000
    const r = calculateFare(rates, 2000, 180);
    expect(r.calculated.toNumber()).toBe(2300);
    expect(r.final_fare.toNumber()).toBe(3000);
  });

  it('does not apply surge — only distance and time', () => {
    const r = calculateFare(rates, 10_000, 600);
    // 1000 + 5000 + 1000 = 7000
    expect(r.final_fare.toNumber()).toBe(7000);
  });

  it('scales fare by vehicles_count (Ticket §29)', () => {
    const one = calculateFare(rates, 10_000, 600, 1);
    const two = calculateFare(rates, 10_000, 600, 2);
    expect(one.final_fare.toNumber()).toBe(7000);
    expect(two.final_fare.toNumber()).toBe(14_000);
    expect(two.calculated.toNumber()).toBe(one.calculated.toNumber() * 2);
  });
});
