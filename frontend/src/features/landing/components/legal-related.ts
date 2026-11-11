import type { Locale } from "@/core/i18n/config";
import type { Dictionary } from "@/core/i18n/dictionaries";

export type LegalDocKey = "privacy" | "terms" | "accountDeletion" | "guidelines";

const PATHS: Record<LegalDocKey, string> = {
  privacy: "/privacy",
  terms: "/terms",
  accountDeletion: "/account-deletion",
  guidelines: "/guidelines",
};

export function legalRelated(locale: Locale, dict: Dictionary, current: LegalDocKey) {
  return (Object.keys(PATHS) as LegalDocKey[])
    .filter((key) => key !== current)
    .map((key) => ({
      label: dict.legal[key].title,
      href: `/${locale}${PATHS[key]}`,
    }));
}

export function legalPath(current: LegalDocKey) {
  return PATHS[current];
}
