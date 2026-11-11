import {
  audienceForFilter,
  clampAudienceLimit,
  DEFAULT_AUDIENCE_LIMIT,
  MAX_AUDIENCE_LIMIT,
  todayMonthDay,
} from './audience-filters';

describe('audience filters helpers', () => {
  it('maps filters to the correct audience', () => {
    expect(audienceForFilter('CUSTOMER_TOP_ORDERS')).toBe('CUSTOMERS');
    expect(audienceForFilter('DRIVER_TOP_RATING')).toBe('DRIVERS');
    expect(audienceForFilter('DRIVER_BIRTHDAY_TODAY')).toBe('DRIVERS');
  });

  it('clamps ranked limits', () => {
    expect(clampAudienceLimit(undefined, true)).toBe(DEFAULT_AUDIENCE_LIMIT);
    expect(clampAudienceLimit(3, true)).toBe(3);
    expect(clampAudienceLimit(500, true)).toBe(MAX_AUDIENCE_LIMIT);
    expect(clampAudienceLimit(undefined, false)).toBeNull();
  });

  it('reads Asia/Damascus calendar day', () => {
    const noonUtc = new Date('2026-03-15T12:00:00Z');
    expect(todayMonthDay(noonUtc)).toEqual({ month: 3, day: 15, date: '2026-03-15' });
  });
});
