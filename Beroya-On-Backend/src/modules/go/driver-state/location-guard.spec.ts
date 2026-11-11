import { clampRecordedAt, isNotOlder } from './location-guard';

describe('live location ordering', () => {
  const now = new Date('2026-10-15T10:00:00Z');

  it('treats device timestamps ahead of the server as now', () => {
    expect(clampRecordedAt(new Date('2026-10-15T10:04:00Z'), now)).toEqual({ recorded: now, clamped: true });
    const past = new Date('2026-10-15T09:59:00Z');
    expect(clampRecordedAt(past, now)).toEqual({ recorded: past, clamped: false });
  });

  it('rejects a point older than the current live point', () => {
    const current = new Date('2026-10-15T09:59:30Z');
    expect(isNotOlder(new Date('2026-10-15T09:59:00Z').getTime(), current)).toBe(false);
    expect(isNotOlder(new Date('2026-10-15T09:59:45Z').getTime(), current)).toBe(true);
  });

  it('accepts a retried point with the same timestamp', () => {
    const t = '2026-10-15T09:59:30.000Z';
    expect(isNotOlder(Date.parse(t), t)).toBe(true);
  });

  it('accepts any point when there is no usable current point', () => {
    expect(isNotOlder(0, null)).toBe(true);
    expect(isNotOlder(0, undefined)).toBe(true);
    expect(isNotOlder(0, 'garbage')).toBe(true);
  });
});
