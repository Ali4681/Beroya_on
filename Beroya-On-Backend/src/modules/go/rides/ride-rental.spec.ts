import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { calculateRentalFare, resolveRentalWindow } from './ride-rental';

describe('resolveRentalWindow', () => {
  const now = new Date('2026-10-17T10:00:00.000Z');

  it('accepts ends_at after scheduled_at', () => {
    const w = resolveRentalWindow({
      scheduled_at: '2026-10-17T12:00:00.000Z',
      ends_at: '2026-10-17T15:00:00.000Z',
      now,
    });
    expect(w.duration_sec).toBe(3 * 3600);
    expect(w.duration_hours).toBe(3);
  });

  it('accepts duration_hours instead of ends_at', () => {
    const w = resolveRentalWindow({
      scheduled_at: '2026-10-17T12:00:00.000Z',
      duration_hours: 2.5,
      now,
    });
    expect(w.ends_at.toISOString()).toBe('2026-10-17T14:30:00.000Z');
    expect(w.duration_sec).toBe(2.5 * 3600);
  });

  it('accepts duration under 1 hour when ends_at > scheduled_at', () => {
    const w = resolveRentalWindow({
      scheduled_at: '2026-10-17T12:00:00.000Z',
      duration_hours: 0.5,
      now,
    });
    expect(w.duration_sec).toBe(30 * 60);
    expect(w.duration_hours).toBe(0.5);
  });

  it('rejects ends_at <= scheduled_at', () => {
    try {
      resolveRentalWindow({
        scheduled_at: '2026-10-17T12:00:00.000Z',
        ends_at: '2026-10-17T12:00:00.000Z',
        now,
      });
      fail('expected throw');
    } catch (err) {
      expect((err as GoException).code).toBe(GoErrorCode.VALIDATION_ERROR);
    }
  });

  it('rejects scheduled_at too soon', () => {
    try {
      resolveRentalWindow({
        scheduled_at: '2026-10-17T10:05:00.000Z',
        duration_hours: 2,
        now,
      });
      fail('expected throw');
    } catch (err) {
      expect((err as GoException).code).toBe(GoErrorCode.VALIDATION_ERROR);
    }
  });
});

describe('calculateRentalFare', () => {
  const rates = {
    base_fare: 1000,
    price_per_km: 500,
    price_per_minute: 100,
    minimum_fare: 3000,
  };

  it('ignores distance and bills by minutes', () => {
    // 2h = 120 min → 1000 + 12000 = 13000
    const fare = calculateRentalFare(rates, 2 * 3600);
    expect(fare.final_fare.toNumber()).toBe(13_000);
  });
});
