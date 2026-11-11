import { GoLanguage } from '@/generated/prisma/client';
import { CUSTOMER_PUSH, DRIVER_PUSH, pushCopy } from './push-catalog';
import { flattenPushData } from './push-data';

describe('push catalog', () => {
  it('has Arabic and English copy for every ticket event', () => {
    for (const event of Object.keys(CUSTOMER_PUSH)) {
      const ar = pushCopy('customer', event, { ride_id: 'r' }, GoLanguage.AR);
      const en = pushCopy('customer', event, { ride_id: 'r' }, GoLanguage.EN);
      expect(ar?.title).toBeTruthy();
      expect(en?.title).toBeTruthy();
      expect(en?.title).not.toBe(ar?.title);
    }
    for (const event of Object.keys(DRIVER_PUSH)) {
      expect(pushCopy('driver', event, { ride_id: 'r' }, GoLanguage.AR)?.title).toBeTruthy();
      expect(pushCopy('driver', event, { ride_id: 'r' }, GoLanguage.EN)?.title).toBeTruthy();
    }
  });

  it('includes passport.updated for device wake + inbox', () => {
    expect(CUSTOMER_PUSH['passport.updated']).toBeTruthy();
    expect(pushCopy('customer', 'passport.updated', {}, GoLanguage.AR)?.title).toContain('جواز');
    expect(pushCopy('customer', 'passport.updated', {}, GoLanguage.EN)?.title).toMatch(/passport/i);
  });

  it('does not push a wallet update that only reports an error', () => {
    expect(pushCopy('driver', 'wallet.updated', { error: 'commission failed', ride_id: 'r' })).toBeNull();
    expect(pushCopy('driver', 'wallet.updated', { balance: 10 })).toEqual(DRIVER_PUSH['wallet.updated'].ar);
  });

  it('ignores events outside the catalog', () => {
    expect(pushCopy('customer', 'ride.location', { lat: 1 })).toBeNull();
    expect(pushCopy('driver', 'compensation.applied', {})).toBeNull();
  });

  it('pushes customer ride lifecycle events to the app', () => {
    for (const event of [
      'ride.driver_assigned',
      'ride.driver_arrived',
      'ride.driver_en_route',
      'ride.started',
      'ride.completed',
      'ride.cancelled',
      'ride.driver_cancelled',
      'ride.failed_no_driver',
      'ride.no_show',
      'ride.replacement_created',
      'ride.breakdown_reported',
      'ride.compensation_applied',
      'ride.route_updated',
    ]) {
      expect(pushCopy('customer', event, { ride_id: 'r' })?.title).toBeTruthy();
    }
  });
});

describe('flattenPushData', () => {
  it('keeps scalar navigation keys as a string map', () => {
    expect(flattenPushData({ ride_id: 'ride-1', status: 'COMPLETED', nested: { a: 1 } })).toEqual({
      ride_id: 'ride-1',
      status: 'COMPLETED',
    });
  });

  it('lifts passport level_id / reward_id for deep links', () => {
    expect(
      flattenPushData({
        current_streak: 3,
        level: { id: 'lvl-1', name: 'Gold' },
        active_reward: { id: 'rw-9', code: 'X' },
      }),
    ).toEqual({
      current_streak: '3',
      level_id: 'lvl-1',
      reward_id: 'rw-9',
    });
  });
});
