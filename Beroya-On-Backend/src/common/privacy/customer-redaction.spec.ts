import { redactForCustomer } from './customer-redaction';

describe('redactForCustomer', () => {
  it('keeps driver phone for the customer Call button', () => {
    const at = new Date('2026-10-13T10:00:00Z');
    const ride = {
      id: 'r1',
      created_at: at,
      customer: { id: 'c1', user: { full_name: 'زبون', phone: '+963911111111' } },
      driver: {
        id: 'd1',
        user: { full_name: 'أحمد', phone: '+963922222222' },
        call_url: 'tel:+963922222222',
        rating_avg: 4.8,
      },
      other_passenger_phone: '+963944444444',
    };
    const out = redactForCustomer({ items: [ride], driver: null });

    expect(out.items[0].driver).toEqual({
      id: 'd1',
      user: { full_name: 'أحمد', phone: '+963922222222' },
      call_url: 'tel:+963922222222',
      rating_avg: 4.8,
    });
    expect(out.items[0].customer.user.phone).toBe('+963911111111');
    expect(out.items[0].other_passenger_phone).toBe('+963944444444');
    expect(out.items[0].created_at).toBe(at);
    expect(out.driver).toBeNull();
  });
});
