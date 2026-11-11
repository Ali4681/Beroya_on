import { GoRideStatus } from '@/generated/prisma/client';

export const DEFAULT_MIN_SEARCH_SECONDS = 90;
export const DEFAULT_EMPTY_SEARCH_RETRY_SECONDS = 10;

export function resolveSearchStartedAt(ride: {
  search_started_at?: Date | null;
  created_at: Date;
}): Date {
  return ride.search_started_at ?? ride.created_at;
}

/** True while elapsed since search start is still under the configured minimum. */
export function stillWithinMinSearchWindow(
  ride: { search_started_at?: Date | null; created_at: Date },
  minSearchSeconds: number,
  now = new Date(),
): boolean {
  const start = resolveSearchStartedAt(ride);
  const minMs = Math.max(0, Math.round(Number(minSearchSeconds) || 0)) * 1000;
  return now.getTime() - start.getTime() < minMs;
}

/** ISO end of the minimum search window while status is SEARCHING; otherwise null. */
export function searchingUntilIso(
  ride: {
    status: GoRideStatus;
    search_started_at?: Date | null;
    created_at: Date;
  },
  minSearchSeconds: number,
): string | null {
  if (ride.status !== GoRideStatus.SEARCHING) return null;
  const start = resolveSearchStartedAt(ride);
  const minMs = Math.max(0, Math.round(Number(minSearchSeconds) || DEFAULT_MIN_SEARCH_SECONDS)) * 1000;
  return new Date(start.getTime() + minMs).toISOString();
}

export function emptySearchRetryDelayMs(emptySearchRetrySeconds: number): number {
  const n = Math.round(Number(emptySearchRetrySeconds));
  const sec = Number.isFinite(n) ? Math.max(1, n) : DEFAULT_EMPTY_SEARCH_RETRY_SECONDS;
  return sec * 1000;
}
