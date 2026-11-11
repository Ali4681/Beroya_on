import { pushCopy } from '../../modules/go/notifications/push-catalog';
import { RealtimeService } from './realtime.service';

describe('realtime push hook', () => {
  function harness(rideBranches: Record<string, string> = {}) {
    const emitted: { event: string; payload: unknown }[] = [];
    const staff: { rooms: string[]; event: string }[] = [];
    const enqueued: { audience: string; event: string }[] = [];
    const notifications = {
      enqueue(audience: string, _userId: string, event: string, payload: unknown) {
        if (pushCopy(audience as 'customer' | 'driver', event, payload)) enqueued.push({ audience, event });
      },
      persistCustomerInbox(userId: string, event: string, payload: unknown) {
        const copy = pushCopy('customer', event, payload);
        if (!copy) return Promise.resolve(null);
        return Promise.resolve({
          id: 'n1',
          event,
          title: copy.title,
          body: copy.body,
          payload,
          read_at: null,
          created_at: '2026-10-14T00:00:00.000Z',
          userId,
        });
      },
      persistDriverInbox(userId: string, event: string, payload: unknown) {
        const copy = pushCopy('driver', event, payload);
        if (!copy) return Promise.resolve(null);
        return Promise.resolve({
          id: 'dn1',
          event,
          type: event,
          category: event === 'driver.forced_offline' ? 'WARNING' : 'SYSTEM',
          title: copy.title,
          body: copy.body,
          payload,
          data: payload,
          read_at: null,
          created_at: '2026-10-14T00:00:00.000Z',
          userId,
        });
      },
    };
    const prisma = {
      goRide: {
        findUnique: ({ where }: { where: { id: string } }) =>
          Promise.resolve(rideBranches[where.id] ? { branch_id: rideBranches[where.id] } : null),
      },
    };
    const service = new RealtimeService(notifications as never, prisma as never);
    service.register('customer', {
      to: () => ({
        emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
      }),
    } as never);
    service.register('driver', {
      to: () => ({
        emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
      }),
    } as never);
    service.register('staff', {
      to: (rooms: string[]) => ({ emit: (event: string) => staff.push({ rooms, event }) }),
      emit: (event: string) => staff.push({ rooms: ['*'], event }),
    } as never);
    return { service, emitted, enqueued, staff };
  }

  const flush = () => new Promise((r) => setImmediate(r));

  it('emits the socket event and queues a catalogued push', async () => {
    const { service, emitted, enqueued } = harness();
    service.emitToCustomer('user-1', 'ride.driver_assigned', { ride_id: 'ride-1' });
    await flush();
    expect(emitted).toEqual(
      expect.arrayContaining([
        { event: 'ride.driver_assigned', payload: { ride_id: 'ride-1' } },
        expect.objectContaining({ event: 'notification.created' }),
      ]),
    );
    expect(enqueued).toEqual([{ audience: 'customer', event: 'ride.driver_assigned' }]);
  });

  it('keeps the socket event when the push catalog has no copy', () => {
    const { service, emitted, enqueued } = harness();
    service.emitToDriver('user-1', 'ride.location', { lat: 1 });
    expect(emitted).toEqual([{ event: 'ride.location', payload: { lat: 1 } }]);
    expect(enqueued).toEqual([]);
  });

  it('persists catalogued driver events to the inbox and emits notification.created', async () => {
    const { service, emitted, enqueued } = harness();
    service.emitToDriver('user-1', 'driver.forced_offline', { reason: 'WALLET_DUE' });
    await flush();
    expect(emitted).toEqual(
      expect.arrayContaining([
        { event: 'driver.forced_offline', payload: { reason: 'WALLET_DUE' } },
        expect.objectContaining({ event: 'notification.created' }),
      ]),
    );
    expect(enqueued).toEqual([{ audience: 'driver', event: 'driver.forced_offline' }]);
  });

  it('mirrors ride events only to the ride branch and global staff', async () => {
    const { service, staff } = harness({ 'ride-1': 'branch-a' });
    service.emitToCustomer('user-1', 'ride.started', { ride_id: 'ride-1' });
    await flush();
    expect(staff).toEqual([{ rooms: ['branch:branch-a', 'staff:global'], event: 'ride.started' }]);
  });

  it('uses branch_id from the payload without a lookup', () => {
    const { service, staff } = harness();
    service.emitToDriver('user-1', 'ride.assigned', { ride_id: 'unknown', branch_id: 'branch-b' });
    expect(staff).toEqual([{ rooms: ['branch:branch-b', 'staff:global'], event: 'ride.assigned' }]);
  });

  it('sends events without a branch to global staff only, never to every socket', async () => {
    const { service, staff } = harness();
    service.emitToCustomer('user-1', 'passport.updated', { level: 'GOLD' });
    service.emitToDriver('user-2', 'ride.assigned', { ride_id: 'missing' });
    await flush();
    expect(staff).toEqual([
      { rooms: ['staff:global'], event: 'passport.updated' },
      { rooms: ['staff:global'], event: 'ride.assigned' },
    ]);
    expect(staff.some((s) => s.rooms.includes('*'))).toBe(false);
  });
});
