const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isHhMm(value: string) {
  return HHMM.test(value);
}

/** "HH:mm" → minutes since midnight. */
export function hhmmToMinutes(value: string) {
  const match = HHMM.exec(value);
  if (!match) throw new Error(`Invalid time "${value}", expected HH:mm`);
  return Number(match[1]) * 60 + Number(match[2]);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(date: Date, tz: string) {
  let fmt = formatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatters.set(tz, fmt);
  }
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  return out;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Local calendar day "YYYY-MM-DD" of `date` in `tz`. */
export function dayKey(date: Date, tz: string) {
  const p = partsIn(date, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes since local midnight of `date` in `tz`. */
export function minutesOfDay(date: Date, tz: string) {
  const p = partsIn(date, tz);
  return Number(p.hour) * 60 + Number(p.minute);
}

/** Local weekday of `date` in `tz`: 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: Date, tz: string) {
  return WEEKDAYS.indexOf(partsIn(date, tz).weekday);
}

/**
 * True when the local time of `date` is in [start, end). A window whose end is
 * before its start crosses midnight (22:00–06:00). start === end is an empty window.
 */
export function inWindow(date: Date, start: string, end: string, tz: string) {
  const s = hhmmToMinutes(start);
  const e = hhmmToMinutes(end);
  if (s === e) return false;
  const m = minutesOfDay(date, tz);
  return s < e ? m >= s && m < e : m >= s || m < e;
}

function offsetMs(date: Date, tz: string) {
  const p = partsIn(date, tz);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant of local `day` ("YYYY-MM-DD") at `time` ("HH:mm") in `tz`. */
export function zonedInstant(day: string, time: string, tz: string) {
  const [y, mo, d] = day.split('-').map(Number);
  const minutes = hhmmToMinutes(time);
  const guess = Date.UTC(y, mo - 1, d, Math.floor(minutes / 60), minutes % 60);
  const first = guess - offsetMs(new Date(guess), tz);
  return new Date(guess - offsetMs(new Date(first), tz));
}

/** Local day key shifted by `days`. */
export function addDays(day: string, days: number) {
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
}

/** [from, to) instants covering the whole local `day` in `tz`. */
export function dayRange(day: string, tz: string) {
  return { from: zonedInstant(day, '00:00', tz), to: zonedInstant(addDays(day, 1), '00:00', tz) };
}

/** Weekday of a day key: 0 = Sunday … 6 = Saturday. */
export function weekdayOfDay(day: string) {
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

/** [from, to) of the window [start, end) that starts on local `day`; crossing midnight ends the next day. */
export function windowOn(day: string, start: string, end: string, tz: string) {
  const crosses = hhmmToMinutes(end) <= hhmmToMinutes(start);
  return { from: zonedInstant(day, start, tz), to: zonedInstant(crosses ? addDays(day, 1) : day, end, tz) };
}

/** Incentive day containing `at`: day D runs from D `close` to D+1 `close`. */
export function businessDay(at: Date, close: string, tz: string) {
  const today = dayKey(at, tz);
  return minutesOfDay(at, tz) >= hhmmToMinutes(close) ? today : addDays(today, -1);
}

export function businessDayRange(day: string, close: string, tz: string) {
  return { from: zonedInstant(day, close, tz), to: zonedInstant(addDays(day, 1), close, tz) };
}

/**
 * The occurrence of a daily window [start, end) that contains or last started before `at`.
 * Cross-midnight windows belong to the day they start on.
 */
export function windowOccurrence(at: Date, start: string, end: string, tz: string) {
  const today = dayKey(at, tz);
  const crosses = hhmmToMinutes(end) <= hhmmToMinutes(start);
  const startsToday = zonedInstant(today, start, tz);
  const day = at >= startsToday ? today : addDays(today, -1);
  const from = zonedInstant(day, start, tz);
  const to = zonedInstant(crosses ? addDays(day, 1) : day, end, tz);
  return { day, from, to };
}
