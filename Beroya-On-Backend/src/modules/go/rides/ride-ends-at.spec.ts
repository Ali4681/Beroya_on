import { rideEndsAt } from './ride-ends-at';

describe('rideEndsAt', () => {
  const created = new Date('2026-10-14T10:00:00.000Z');

  it('uses completed_at when the ride finished', () => {
    const completed = new Date('2026-10-14T10:40:00.000Z');
    expect(
      rideEndsAt({
        created_at: created,
        started_at: new Date('2026-10-14T10:10:00.000Z'),
        scheduled_at: null,
        completed_at: completed,
        estimated_duration_sec: 1800,
      }),
    ).toBe(completed.toISOString());
  });

  it('uses started_at + estimated_duration_sec while in progress', () => {
    expect(
      rideEndsAt({
        created_at: created,
        started_at: new Date('2026-10-14T10:10:00.000Z'),
        scheduled_at: null,
        completed_at: null,
        estimated_duration_sec: 1800,
      }),
    ).toBe('2026-10-14T10:40:00.000Z');
  });

  it('uses scheduled_at before the trip starts', () => {
    expect(
      rideEndsAt({
        created_at: created,
        started_at: null,
        scheduled_at: new Date('2026-10-14T12:00:00.000Z'),
        completed_at: null,
        estimated_duration_sec: 600,
      }),
    ).toBe('2026-10-14T12:10:00.000Z');
  });

  it('prefers rental_ends_at when set', () => {
    expect(
      rideEndsAt({
        created_at: created,
        started_at: null,
        scheduled_at: new Date('2026-10-14T12:00:00.000Z'),
        completed_at: null,
        estimated_duration_sec: 600,
        rental_ends_at: new Date('2026-10-14T16:00:00.000Z'),
      }),
    ).toBe('2026-10-14T16:00:00.000Z');
  });
});
