import { calendarMonthRange } from './wallet-month';

describe('calendarMonthRange', () => {
  it('covers October 2026 in Asia/Damascus', () => {
    const range = calendarMonthRange(new Date('2026-10-15T12:00:00.000Z'));
    expect(range.year).toBe(2026);
    expect(range.month).toBe(10);
    expect(range.from.toISOString()).toBe('2026-09-30T21:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-10-31T21:00:00.000Z');
  });
});
