import { notificationCategory } from './notification-category';

describe('notificationCategory', () => {
  it('maps wallet money events to WALLET', () => {
    expect(notificationCategory('wallet.updated')).toBe('WALLET');
    expect(notificationCategory('wallet.pos_recharge')).toBe('WALLET');
    expect(notificationCategory('incentive.awarded')).toBe('WALLET');
    expect(notificationCategory('incentive.goal_achieved')).toBe('WALLET');
  });

  it('maps urgent wallet / offline events to WARNING', () => {
    expect(notificationCategory('wallet.low_balance')).toBe('WARNING');
    expect(notificationCategory('driver.forced_offline')).toBe('WARNING');
    expect(notificationCategory('eligibility.updated')).toBe('WARNING');
    expect(notificationCategory('ride.interrupted')).toBe('WARNING');
  });

  it('maps ride and offer events to RIDE', () => {
    expect(notificationCategory('ride_offer.created')).toBe('RIDE');
    expect(notificationCategory('ride.route_updated')).toBe('RIDE');
    expect(notificationCategory('ride.message')).toBe('RIDE');
    expect(notificationCategory('scheduled_ride.reminder')).toBe('RIDE');
  });

  it('maps rating events to RATING', () => {
    expect(notificationCategory('rating.received')).toBe('RATING');
    expect(notificationCategory('ride.rated')).toBe('RATING');
  });

  it('maps broadcasts and unknowns to SYSTEM', () => {
    expect(notificationCategory('notification.message')).toBe('SYSTEM');
    expect(notificationCategory('support.updated')).toBe('SYSTEM');
    expect(notificationCategory('driver_passport.updated')).toBe('SYSTEM');
    expect(notificationCategory('something.unknown')).toBe('SYSTEM');
  });
});
