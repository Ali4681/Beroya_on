export const locales = ["ar", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "ar";
//cookie to store the locale
export const localeCookie = "NEXT_LOCALE";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function directionOf(locale: Locale) {
  return locale === "ar" ? "rtl" : "ltr";
}

export const intlLocale: Record<Locale, string> = {
  // Latin digits in Arabic copy; month names stay Arabic.
  ar: "ar-SY-u-nu-latn",
  en: "en-US",
};
