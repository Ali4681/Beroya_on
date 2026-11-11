import { addDays, dayKey, dayRange, weekdayOfDay, zonedInstant } from '../incentives/time.util';

export type StatsPeriod = 'day' | 'week' | 'month';

export type PeriodWindow = {
  period: StatsPeriod;
  timezone: string;
  /** Inclusive local start (instant). */
  from: Date;
  /** Exclusive local end (instant). */
  to: Date;
  /** Anchor calendar day YYYY-MM-DD in timezone. */
  anchor_day: string;
};

const WEEKDAY_LABELS: { key: string; label_ar: string; label_en: string }[] = [
  { key: 'sat', label_ar: 'سبت', label_en: 'Sat' },
  { key: 'sun', label_ar: 'أحد', label_en: 'Sun' },
  { key: 'mon', label_ar: 'اثنين', label_en: 'Mon' },
  { key: 'tue', label_ar: 'ثلاثاء', label_en: 'Tue' },
  { key: 'wed', label_ar: 'أربعاء', label_en: 'Wed' },
  { key: 'thu', label_ar: 'خميس', label_en: 'Thu' },
  { key: 'fri', label_ar: 'جمعة', label_en: 'Fri' },
];

/** Figma week order: Saturday → Friday. */
export function saturdayWeekStart(day: string): string {
  const wd = weekdayOfDay(day); // 0 = Sun … 6 = Sat
  const sinceSat = (wd + 1) % 7;
  return addDays(day, -sinceSat);
}

export function resolvePeriodWindow(period: StatsPeriod, at: Date, timezone: string): PeriodWindow {
  const anchor = dayKey(at, timezone);
  if (period === 'day') {
    const { from, to } = dayRange(anchor, timezone);
    return { period, timezone, from, to, anchor_day: anchor };
  }
  if (period === 'week') {
    const sat = saturdayWeekStart(anchor);
    return {
      period,
      timezone,
      from: zonedInstant(sat, '00:00', timezone),
      to: zonedInstant(addDays(sat, 7), '00:00', timezone),
      anchor_day: anchor,
    };
  }
  const [y, m] = anchor.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const next =
    m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return {
    period,
    timezone,
    from: zonedInstant(first, '00:00', timezone),
    to: zonedInstant(next, '00:00', timezone),
    anchor_day: anchor,
  };
}

/** Previous equal calendar period (day / Sat-week / month). */
export function previousPeriodWindow(current: PeriodWindow): PeriodWindow {
  if (current.period === 'day') {
    const prev = addDays(current.anchor_day, -1);
    const { from, to } = dayRange(prev, current.timezone);
    return { period: 'day', timezone: current.timezone, from, to, anchor_day: prev };
  }
  if (current.period === 'week') {
    const sat = saturdayWeekStart(current.anchor_day);
    const prevSat = addDays(sat, -7);
    return {
      period: 'week',
      timezone: current.timezone,
      from: zonedInstant(prevSat, '00:00', current.timezone),
      to: zonedInstant(sat, '00:00', current.timezone),
      anchor_day: prevSat,
    };
  }
  const [y, m] = current.anchor_day.split('-').map(Number);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  const anchor = `${prevYear}-${String(prevMonth).padStart(2, '0')}-15`;
  return resolvePeriodWindow('month', zonedInstant(anchor, '12:00', current.timezone), current.timezone);
}

export function weekdayBucketMeta(day: string) {
  const sat = saturdayWeekStart(day);
  let i = 0;
  let cursor = sat;
  while (cursor !== day && i < 7) {
    cursor = addDays(cursor, 1);
    i += 1;
  }
  return WEEKDAY_LABELS[i] ?? WEEKDAY_LABELS[0];
}

export function weekSeriesTemplate(from: Date, timezone: string) {
  const sat = dayKey(from, timezone);
  return WEEKDAY_LABELS.map((meta, i) => ({
    ...meta,
    day: addDays(sat, i),
  }));
}

export function monthSeriesTemplate(from: Date, to: Date, timezone: string) {
  const days: { key: string; label_ar: string; label_en: string; day: string }[] = [];
  let cursor = dayKey(from, timezone);
  const end = dayKey(new Date(to.getTime() - 1), timezone);
  while (true) {
    const d = Number(cursor.slice(8, 10));
    days.push({
      key: cursor,
      label_ar: String(d),
      label_en: String(d),
      day: cursor,
    });
    if (cursor === end) break;
    cursor = addDays(cursor, 1);
    if (days.length > 40) break;
  }
  return days;
}

export function hourSeriesTemplate() {
  return Array.from({ length: 24 }, (_, h) => ({
    key: `h${String(h).padStart(2, '0')}`,
    label_ar: String(h),
    label_en: String(h),
    hour: h,
  }));
}
