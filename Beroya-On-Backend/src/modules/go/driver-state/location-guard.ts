/**
 * Live-location ordering rules. Points arrive out of order after reconnects and offline batches;
 * the live position must only move forward in device time.
 */

/**
 * A device clock ahead of the server would otherwise pin the live position in the future and
 * make every later real point look older, so future timestamps are treated as "now".
 */
export function clampRecordedAt(recorded: Date, now: Date): { recorded: Date; clamped: boolean } {
  if (recorded.getTime() > now.getTime()) return { recorded: new Date(now.getTime()), clamped: true };
  return { recorded, clamped: false };
}

/** True when a point recorded at `recordedMs` may replace the current live point. Equal times are accepted (retries). */
export function isNotOlder(recordedMs: number, current: Date | string | null | undefined): boolean {
  if (current == null) return true;
  const currentMs = current instanceof Date ? current.getTime() : Date.parse(current);
  if (!Number.isFinite(currentMs)) return true;
  return recordedMs >= currentMs;
}
