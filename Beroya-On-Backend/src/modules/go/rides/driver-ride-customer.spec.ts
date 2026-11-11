import { pickupWaitBreakdown, waitingFields } from './driver-ride-customer';
import { RideDefaults } from './ride-rules';

describe('driver-ride-customer waitingFields', () => {
  it('exposes server waiting constants and no_show_eligible_at from arrived_at', () => {
    expect(waitingFields(null)).toEqual({
      free_waiting_sec: RideDefaults.FREE_WAITING_SEC,
      no_show_after_arrived_sec: RideDefaults.NO_SHOW_AFTER_ARRIVED_SEC,
      no_show_eligible_at: null,
      billable_waiting_starts_at: null,
    });
    const arrived = new Date('2026-10-05T10:00:00.000Z');
    const fields = waitingFields(arrived);
    expect(fields.free_waiting_sec).toBe(120);
    expect(fields.no_show_after_arrived_sec).toBe(600);
    expect(fields.no_show_eligible_at).toBe('2026-10-05T10:10:00.000Z');
    expect(fields.billable_waiting_starts_at).toBe('2026-10-05T10:02:00.000Z');
  });
});

describe('pickupWaitBreakdown', () => {
  it('treats first two minutes as free then billable', () => {
    const arrived = new Date('2026-10-05T10:00:00.000Z');
    const started = new Date('2026-10-05T10:05:00.000Z');
    expect(
      pickupWaitBreakdown({
        arrived_at: arrived,
        started_at: started,
        billable_waiting_sec: null,
      }),
    ).toEqual({
      free_waiting_sec: 120,
      total_wait_sec: 300,
      billable_waiting_sec: 180,
      billable_waiting_starts_at: '2026-10-05T10:02:00.000Z',
    });
  });
});
