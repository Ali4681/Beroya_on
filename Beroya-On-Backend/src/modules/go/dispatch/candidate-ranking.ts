import { GoServiceCode } from '@/generated/prisma/client';
import { normalizeLanguageCode } from '../drivers/world-languages';

export type RankedCandidate = {
  driver_id: string;
  user_id: string;
  effective_eta_sec: number;
  distance_m: number;
  is_busy: boolean;
  fairness_rides_24h: number;
  /** Driver speaks the ride's preferred_driver_language. */
  language_match: boolean;
};

/** VIP category or tourist service: language is a hard dispatch filter. */
export function rideRequiresLanguageMatch(opts: {
  service_code: GoServiceCode | string;
  category_code?: string | null;
}): boolean {
  return opts.service_code === GoServiceCode.TOURIST || opts.category_code === 'VIP';
}

/** True when the driver list (mother tongue + others) includes the preferred ISO code. */
export function driverSpeaksLanguage(
  driverLanguages: string[] | null | undefined,
  preferred: string,
  motherTongue?: string | null,
): boolean {
  const want = normalizeLanguageCode(preferred);
  if (!want) return false;
  const spoken = new Set(
    [...(driverLanguages ?? []), ...(motherTongue ? [motherTongue] : [])].map((item) =>
      normalizeLanguageCode(item),
    ),
  );
  return spoken.has(want);
}

/** Language match first (preference, not a filter), then ETA, fairness, idle before busy. */
export function compareCandidates(a: RankedCandidate, b: RankedCandidate): number {
  if (a.language_match !== b.language_match) return a.language_match ? -1 : 1;
  if (a.effective_eta_sec !== b.effective_eta_sec) return a.effective_eta_sec - b.effective_eta_sec;
  if (a.fairness_rides_24h !== b.fairness_rides_24h) return a.fairness_rides_24h - b.fairness_rides_24h;
  if (a.is_busy !== b.is_busy) return a.is_busy ? 1 : -1;
  return 0;
}
