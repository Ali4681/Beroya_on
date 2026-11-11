import { GoRideStatus } from '@/generated/prisma/client';
import {
  emptySearchRetryDelayMs,
  searchingUntilIso,
  stillWithinMinSearchWindow,
} from './min-search-window';

describe('min-search-window', () => {
  const start = new Date('2026-10-22T12:00:00.000Z');

  it('stays within the window until min_search_seconds elapse', () => {
    const ride = { search_started_at: start, created_at: start };
    expect(stillWithinMinSearchWindow(ride, 90, new Date(start.getTime() + 89_000))).toBe(true);
    expect(stillWithinMinSearchWindow(ride, 90, new Date(start.getTime() + 90_000))).toBe(false);
  });

  it('falls back to created_at when search_started_at is null', () => {
    const ride = { search_started_at: null, created_at: start };
    expect(stillWithinMinSearchWindow(ride, 30, new Date(start.getTime() + 10_000))).toBe(true);
    expect(stillWithinMinSearchWindow(ride, 30, new Date(start.getTime() + 30_000))).toBe(false);
  });

  it('exposes searching_until only while SEARCHING', () => {
    expect(
      searchingUntilIso(
        { status: GoRideStatus.SEARCHING, search_started_at: start, created_at: start },
        90,
      ),
    ).toBe('2026-10-22T12:01:30.000Z');
    expect(
      searchingUntilIso(
        { status: GoRideStatus.FAILED_NO_DRIVER, search_started_at: start, created_at: start },
        90,
      ),
    ).toBeNull();
  });

  it('computes empty retry delay with a floor of 1s', () => {
    expect(emptySearchRetryDelayMs(10)).toBe(10_000);
    expect(emptySearchRetryDelayMs(0)).toBe(1000);
  });
});
