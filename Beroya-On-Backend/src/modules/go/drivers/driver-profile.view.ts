import { GoLanguage, type GoDriverGender } from '@/generated/prisma/client';

/** Driver-facing fields merged into GET /auth/me for DRIVER. */
export function driverPersonalFields(
  profile: {
    gender: GoDriverGender;
    avatar_key: string | null;
    updated_at: Date;
    preferred_language?: GoLanguage;
  },
  rating: { rating_avg: number | null; rating_count: number },
) {
  return {
    gender: profile.gender,
    preferred_language: profile.preferred_language ?? GoLanguage.AR,
    avatar_url: profile.avatar_key
      ? `/api/v1/go/driver/profile/avatar?v=${profile.updated_at.getTime()}`
      : null,
    rating_avg: rating.rating_avg,
    rating_count: rating.rating_count,
  };
}
