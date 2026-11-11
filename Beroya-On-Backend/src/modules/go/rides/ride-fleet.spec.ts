import { GoServiceCode } from '@/generated/prisma/client';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { calculateFleetFare, resolveFleetBooking } from './ride-fleet';

describe('resolveFleetBooking', () => {
  const primary = { id: 'econ', code: 'ECONOMY' };
  const vip = {
    id: 'vip',
    code: 'VIP',
    is_active: true,
    pricing: {
      base_fare: 2000,
      price_per_km: 600,
      price_per_minute: 100,
      minimum_fare: 4000,
      currency: 'SYP',
      is_active: true,
    },
  };
  const economy = {
    id: 'econ',
    code: 'ECONOMY',
    is_active: true,
    pricing: {
      base_fare: 1000,
      price_per_km: 400,
      price_per_minute: 80,
      minimum_fare: 2500,
      currency: 'SYP',
      is_active: true,
    },
  };
  const taxi = {
    id: 'taxi',
    code: 'TAXI',
    is_active: true,
    pricing: { ...economy.pricing, is_active: true },
  };
  const byId = new Map([
    [economy.id, economy],
    [vip.id, vip],
    [taxi.id, taxi],
  ]);

  it('accepts random fleet without vehicles[]', () => {
    expect(
      resolveFleetBooking({ vehicles_count: 3, random_vehicles: true }, primary, byId),
    ).toMatchObject({
      service_code: GoServiceCode.FLEET,
      vehicles_count: 3,
      random_vehicles: true,
      fleet_vehicles: null,
    });
  });

  it('accepts mix when counts sum to vehicles_count', () => {
    const r = resolveFleetBooking(
      {
        vehicles_count: 3,
        random_vehicles: false,
        vehicles: [
          { ride_category_id: 'econ', count: 2 },
          { ride_category_id: 'vip', count: 1 },
        ],
      },
      primary,
      byId,
    );
    expect(r.fleet_vehicles).toEqual([
      { ride_category_id: 'econ', count: 2 },
      { ride_category_id: 'vip', count: 1 },
    ]);
  });

  it('rejects TAXI in mix', () => {
    try {
      resolveFleetBooking(
        {
          vehicles_count: 1,
          vehicles: [{ ride_category_id: 'taxi', count: 1 }],
        },
        primary,
        byId,
      );
      fail('expected throw');
    } catch (err) {
      expect((err as GoException).code).toBe(GoErrorCode.VALIDATION_ERROR);
    }
  });

  it('rejects when sum ≠ vehicles_count', () => {
    try {
      resolveFleetBooking(
        {
          vehicles_count: 5,
          vehicles: [{ ride_category_id: 'econ', count: 2 }],
        },
        primary,
        byId,
      );
      fail('expected throw');
    } catch (err) {
      expect((err as GoException).code).toBe(GoErrorCode.VALIDATION_ERROR);
    }
  });
});

describe('calculateFleetFare', () => {
  const rates = {
    base_fare: 1000,
    price_per_km: 500,
    price_per_minute: 100,
    minimum_fare: 3000,
  };

  it('scales random by vehicles_count', () => {
    const one = calculateFleetFare(10_000, 600, {
      random_vehicles: true,
      vehicles_count: 1,
      primary: rates,
    });
    const three = calculateFleetFare(10_000, 600, {
      random_vehicles: true,
      vehicles_count: 3,
      primary: rates,
    });
    expect(three.final_fare.toNumber()).toBe(one.final_fare.toNumber() * 3);
  });

  it('sums mix lines', () => {
    const vip = { ...rates, base_fare: 2000, minimum_fare: 5000 };
    const fare = calculateFleetFare(10_000, 600, {
      random_vehicles: false,
      vehicles_count: 3,
      primary: rates,
      lines: [
        { ride_category_id: 'a', count: 2, rates },
        { ride_category_id: 'b', count: 1, rates: vip },
      ],
    });
    // single economy 7000 × 2 + vip: 2000+5000+1000=8000 min 5000 → 8000
    expect(fare.final_fare.toNumber()).toBe(7000 * 2 + 8000);
  });
});
