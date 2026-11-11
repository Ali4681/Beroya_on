import { Prisma } from '@/generated/prisma/client';
import { redactForDriver } from './driver-redaction';

describe('redactForDriver', () => {
  it('drops the passenger phone and tracking token at any depth, keeping everything else', () => {
    const at = new Date('2026-10-13T10:00:00Z');
    const fare = new Prisma.Decimal('2500.50');
    const ride = {
      id: 'r1',
      booking_for: 'OTHER',
      other_passenger_name: 'أحمد',
      other_passenger_phone: '+963900000000',
      pickup_sign_name: 'أحمد محمد',
      tracking_token: 'secret',
      estimated_fare: fare,
      created_at: at,
      stops: [{ id: 's1', other_passenger_phone: 'x' }],
    };
    const out = redactForDriver({ ride, list: [ride], ok: true });

    expect(out.ride).not.toHaveProperty('other_passenger_phone');
    expect(out.ride).not.toHaveProperty('tracking_token');
    expect(out.ride.stops[0]).toEqual({ id: 's1' });
    expect(out.list[0]).not.toHaveProperty('other_passenger_phone');
    expect(out.ride).toMatchObject({ other_passenger_name: 'أحمد', pickup_sign_name: 'أحمد محمد', booking_for: 'OTHER' });
    expect(out.ride.estimated_fare).toBe(fare);
    expect(out.ride.created_at).toBe(at);
    expect(ride.other_passenger_phone).toBe('+963900000000');
  });

  it('passes primitives and null through', () => {
    expect(redactForDriver(null)).toBeNull();
    expect(redactForDriver('x')).toBe('x');
    expect(redactForDriver(3)).toBe(3);
  });
});
