import {
  previousPeriodWindow,
  resolvePeriodWindow,
  saturdayWeekStart,
  weekSeriesTemplate,
} from './driver-statistics.periods';

describe('driver-statistics periods', () => {
  const tz = 'Asia/Damascus';

  it('starts the week on Saturday (Figma order)', () => {
    // 2026-11-02 is a Monday
    expect(saturdayWeekStart('2026-11-02')).toBe('2026-10-31');
    const week = resolvePeriodWindow('week', new Date('2026-11-02T12:00:00+03:00'), tz);
    expect(week.from.toISOString()).toBe(new Date('2026-10-31T00:00:00+03:00').toISOString());
    expect(week.to.toISOString()).toBe(new Date('2026-11-07T00:00:00+03:00').toISOString());
    const keys = weekSeriesTemplate(week.from, tz).map((b) => b.key);
    expect(keys).toEqual(['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']);
  });

  it('resolves calendar day and previous day', () => {
    const day = resolvePeriodWindow('day', new Date('2026-11-02T18:00:00+03:00'), tz);
    expect(day.anchor_day).toBe('2026-11-02');
    const prev = previousPeriodWindow(day);
    expect(prev.anchor_day).toBe('2026-11-01');
  });

  it('resolves calendar month', () => {
    const month = resolvePeriodWindow('month', new Date('2026-11-15T10:00:00+03:00'), tz);
    expect(month.from.toISOString()).toBe(new Date('2026-11-01T00:00:00+03:00').toISOString());
    expect(month.to.toISOString()).toBe(new Date('2026-12-01T00:00:00+03:00').toISOString());
  });
});
