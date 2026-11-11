import { intlLocale, type Locale } from "@/core/i18n/config";

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(intlLocale[locale], options).format(value);
}
