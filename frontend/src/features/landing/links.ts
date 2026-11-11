import { site } from "@/core/config/site";

import { contactHrefFrom, type SupportContacts } from "./support-contacts";

/** Where "contact us" buttons point when live support channels are known. */
export function contactHref(support?: SupportContacts): string {
  if (support) return contactHrefFrom(support);
  return "#faq";
}

/** Driver sign-up form if configured, otherwise the download section. */
export function driverSignupHref(): string {
  return site.links.driverSignup ?? "#download";
}
