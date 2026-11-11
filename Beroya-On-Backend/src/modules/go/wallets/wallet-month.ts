import { dayKey, zonedInstant } from '../incentives/time.util';

export const CUSTOMER_WALLET_TZ = 'Asia/Damascus';

/** Calendar month [from, to) in `tz` containing `at` (default Asia/Damascus). */
export function calendarMonthRange(at: Date = new Date(), tz = CUSTOMER_WALLET_TZ) {
  const key = dayKey(at, tz);
  const [y, m] = key.split('-').map(Number);
  const startDay = `${y}-${String(m).padStart(2, '0')}-01`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const endDay = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  return {
    year: y,
    month: m,
    from: zonedInstant(startDay, '00:00', tz),
    to: zonedInstant(endDay, '00:00', tz),
  };
}
