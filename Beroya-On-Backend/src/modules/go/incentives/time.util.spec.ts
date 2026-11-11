import {
  addDays,
  businessDay,
  businessDayRange,
  dayKey,
  dayRange,
  inWindow,
  minutesOfDay,
  weekdayOf,
  weekdayOfDay,
  windowOccurrence,
  windowOn,
  zonedInstant,
} from './time.util';

const TZ = 'Asia/Damascus';

describe('time.util', () => {
  it('uses the local day, not the UTC day', () => {
    // 22:30 UTC on Oct 13 is 01:30 on Oct 14 in Damascus (UTC+3).
    const at = new Date('2026-10-13T22:30:00Z');
    expect(dayKey(at, TZ)).toBe('2026-10-14');
    expect(minutesOfDay(at, TZ)).toBe(90);
    expect(weekdayOf(at, TZ)).toBe(3);
  });

  it('converts a local time back to the instant', () => {
    expect(zonedInstant('2026-10-14', '00:00', TZ).toISOString()).toBe('2026-10-13T21:00:00.000Z');
    const { from, to } = dayRange('2026-10-14', TZ);
    expect(to.getTime() - from.getTime()).toBe(24 * 3600 * 1000);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('handles windows that cross midnight', () => {
    const local = (hhmm: string) => zonedInstant('2026-10-14', hhmm, TZ);
    expect(inWindow(local('23:00'), '22:00', '06:00', TZ)).toBe(true);
    expect(inWindow(local('03:00'), '22:00', '06:00', TZ)).toBe(true);
    expect(inWindow(local('06:00'), '22:00', '06:00', TZ)).toBe(false);
    expect(inWindow(local('12:00'), '22:00', '06:00', TZ)).toBe(false);
    expect(inWindow(local('00:00'), '00:00', '07:00', TZ)).toBe(true);
    expect(inWindow(local('07:00'), '00:00', '07:00', TZ)).toBe(false);
    expect(inWindow(local('10:00'), '10:00', '10:00', TZ)).toBe(false);
  });

  it('finds the window occurrence a moment belongs to', () => {
    const early = windowOccurrence(zonedInstant('2026-10-14', '02:00', TZ), '22:00', '00:00', TZ);
    expect(early.day).toBe('2026-10-13');
    expect(early.to.toISOString()).toBe(zonedInstant('2026-10-14', '00:00', TZ).toISOString());
    const evening = windowOccurrence(zonedInstant('2026-10-14', '23:00', TZ), '22:00', '00:00', TZ);
    expect(evening.day).toBe('2026-10-14');
    expect(evening.from.toISOString()).toBe(zonedInstant('2026-10-14', '22:00', TZ).toISOString());
  });

  it('builds a window on a given start day', () => {
    const night = windowOn('2026-10-14', '22:00', '02:00', TZ);
    expect(night.from.toISOString()).toBe(zonedInstant('2026-10-14', '22:00', TZ).toISOString());
    expect(night.to.toISOString()).toBe(zonedInstant('2026-10-15', '02:00', TZ).toISOString());
    const day = windowOn('2026-10-14', '08:00', '12:00', TZ);
    expect(day.to.getTime() - day.from.getTime()).toBe(4 * 3600 * 1000);
    expect(weekdayOfDay('2026-10-14')).toBe(3);
  });

  it('assigns moments to the incentive day by the close time', () => {
    const local = (day: string, hhmm: string) => zonedInstant(day, hhmm, TZ);
    expect(businessDay(local('2026-10-14', '00:00'), '00:00', TZ)).toBe('2026-10-14');
    expect(businessDay(local('2026-10-14', '23:59'), '00:00', TZ)).toBe('2026-10-14');
    // Close at 04:00: the night shift belongs to the evening before.
    expect(businessDay(local('2026-10-14', '03:00'), '04:00', TZ)).toBe('2026-10-13');
    expect(businessDay(local('2026-10-14', '04:00'), '04:00', TZ)).toBe('2026-10-14');
    const range = businessDayRange('2026-10-13', '04:00', TZ);
    expect(range.from.toISOString()).toBe(local('2026-10-13', '04:00').toISOString());
    expect(range.to.toISOString()).toBe(local('2026-10-14', '04:00').toISOString());
  });
});
