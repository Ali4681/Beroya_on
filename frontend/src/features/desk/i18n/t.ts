import { directionOf, intlLocale, localeCookie, type Locale } from "@/core/i18n/config";

import phrases from "./en.json";

let current: Locale = "ar";

export function getDeskLocale() {
  return current;
}

export function bindDeskLocale(locale: Locale) {
  current = locale;
}

export function applyDeskLocale(locale: Locale) {
  current = locale;
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = directionOf(locale);
  document.cookie = `${localeCookie}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

export function t(text: string) {
  if (current === "ar" || !text) return text;
  return phrases[text as keyof typeof phrases] ?? text;
}

export function listJoin(parts: string[]) {
  return parts.join(current === "ar" ? "، " : ", ");
}

export function bilingualName(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const ar = typeof record.name_ar === "string" ? record.name_ar.trim() : "";
  const en = typeof record.name_en === "string" ? record.name_en.trim() : "";
  if (!ar && !en) return null;
  return current === "en" ? en || ar : ar || en;
}

export function localeTag() {
  return intlLocale[current];
}

export function pageWindow(shown: number, total: number) {
  if (current === "ar") return `${shown} ظاهر من ${total} في هذه الصفحة`;
  return `${shown} shown of ${total} on this page`;
}

export function requestLabel(id: string) {
  return current === "ar" ? `رقم الطلب: ${id}` : `Request: ${id}`;
}

export function alertOnRide(count: number) {
  if (current === "ar") return count === 1 ? `${count} تنبيه مفتوح على هذه الرحلة` : `${count} تنبيهات مفتوحة على هذه الرحلة`;
  return count === 1 ? `${count} open alert on this ride` : `${count} open alerts on this ride`;
}

export function firstTopUp(amount: string) {
  return current === "ar"
    ? `أول شحن لهذا السائق يجب أن يكون ${amount} على الأقل. الشحنات التالية يمكن أن تكون أصغر.`
    : `The first top-up for this driver must be at least ${amount}. Later top-ups can be smaller.`;
}

export function minimumHint(amount: string) {
  return current === "ar" ? `أول شحن: ${amount} على الأقل` : `First top-up: at least ${amount}`;
}

export function walletMinimum(amount: string) {
  return current === "ar"
    ? `أول شحن للسائق لا يقل عن ${amount}. بعد وجود شحن أو تسوية سابقة يقبل الخادم أي مبلغ أكبر من صفر.`
    : `The first top-up must be at least ${amount}. After an earlier top-up or adjustment, any amount above zero is accepted.`;
}

function compactNumber(value: number) {
  return new Intl.NumberFormat(localeTag(), { maximumFractionDigits: 2 }).format(value);
}

export function grantRewardTitle(points: number | null, discount: number | null) {
  const pointText = points == null ? "" : current === "ar" ? `${compactNumber(points)} نقاط` : `${compactNumber(points)} points`;
  const discountText = discount == null ? "" : current === "ar" ? `خصم ${compactNumber(discount)}%` : `${compactNumber(discount)}% discount`;
  if (pointText && discountText) return current === "ar" ? `${pointText} و${discountText}` : `${pointText} and a ${discountText}`;
  return pointText || discountText;
}

export function grantStreakLine(count: number) {
  if (current === "ar") {
    if (count === 1) return "بعد رحلة مكتملة واحدة";
    if (count === 2) return "بعد رحلتين متتاليتين مكتملتين";
    return `بعد ${compactNumber(count)} رحلات متتالية مكتملة`;
  }
  return count === 1 ? "After 1 completed ride" : `After ${compactNumber(count)} completed rides in a row`;
}

export function grantDecision(approve: boolean, name: string, points: number | null, discount: number | null) {
  const title = grantRewardTitle(points, discount);
  if (current === "ar") {
    if (approve) return title ? `ستصل «${title}» إلى ${name}.` : `ستُعتمد مكافأة ${name}.`;
    return title ? `لن تصل «${title}» إلى ${name}.` : `ستُرفض مكافأة ${name}.`;
  }
  if (approve) return title ? `${name} will receive ${title}.` : `${name}'s reward will be approved.`;
  return title ? `${name} will not receive ${title}.` : `${name}'s reward will be rejected.`;
}

export function toppedUp(amount: string, name: string) {
  if (!amount) {
    return current === "ar" ? `تم شحن محفظة ${name}.` : `Wallet topped up for ${name}.`;
  }
  return current === "ar" ? `تم الشحن بمبلغ ${amount} لحساب ${name}.` : `Added ${amount} to ${name}.`;
}
