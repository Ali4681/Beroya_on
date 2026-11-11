import { GoServiceCode } from '@/generated/prisma/client';
import {
  compareCandidates,
  driverSpeaksLanguage,
  rideRequiresLanguageMatch,
  type RankedCandidate,
} from './candidate-ranking';

const candidate = (overrides: Partial<RankedCandidate>): RankedCandidate => ({
  driver_id: 'd',
  user_id: 'u',
  effective_eta_sec: 300,
  distance_m: 1000,
  is_busy: false,
  fairness_rides_24h: 0,
  language_match: true,
  ...overrides,
});

describe('candidate ranking', () => {
  it('puts a language match ahead of a closer driver without it', () => {
    const near = candidate({ driver_id: 'near', effective_eta_sec: 60, language_match: false });
    const far = candidate({ driver_id: 'far', effective_eta_sec: 600, language_match: true });
    expect([near, far].sort(compareCandidates).map((c) => c.driver_id)).toEqual(['far', 'near']);
  });

  it('keeps non-matching drivers as candidates, ordered by ETA', () => {
    const a = candidate({ driver_id: 'a', effective_eta_sec: 400, language_match: false });
    const b = candidate({ driver_id: 'b', effective_eta_sec: 200, language_match: false });
    expect([a, b].sort(compareCandidates).map((c) => c.driver_id)).toEqual(['b', 'a']);
  });

  it('falls back to fairness then idle-before-busy on equal ETA', () => {
    const busy = candidate({ driver_id: 'busy', is_busy: true });
    const idle = candidate({ driver_id: 'idle' });
    const tired = candidate({ driver_id: 'tired', fairness_rides_24h: 5 });
    expect([tired, busy, idle].sort(compareCandidates).map((c) => c.driver_id)).toEqual(['idle', 'busy', 'tired']);
  });
});

describe('language matching', () => {
  it('requires a hard language filter for VIP and tourist', () => {
    expect(rideRequiresLanguageMatch({ service_code: GoServiceCode.DAILY, category_code: 'VIP' })).toBe(true);
    expect(rideRequiresLanguageMatch({ service_code: GoServiceCode.TOURIST, category_code: 'ECONOMY' })).toBe(true);
    expect(rideRequiresLanguageMatch({ service_code: GoServiceCode.DAILY, category_code: 'ECONOMY' })).toBe(false);
  });

  it('matches ISO codes and mother tongue, including legacy AR/EN casing', () => {
    expect(driverSpeaksLanguage(['en', 'fr'], 'en')).toBe(true);
    expect(driverSpeaksLanguage(['en', 'fr'], 'EN')).toBe(true);
    expect(driverSpeaksLanguage(['fr'], 'en', 'en')).toBe(true);
    expect(driverSpeaksLanguage(['ar'], 'en')).toBe(false);
  });
});
