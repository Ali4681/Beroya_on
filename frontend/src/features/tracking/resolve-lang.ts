import { defaultLocale, isLocale, type Locale } from "@/core/i18n/config";

/** Prefer ?lang=ar|en; otherwise default Arabic. */
export function resolveTrackingLang(raw: string | string[] | undefined): Locale {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    return defaultLocale;
  }
  const base = value.trim().toLowerCase().split("-")[0];
  return isLocale(base) ? base : defaultLocale;
}
