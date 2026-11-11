import type { Locale } from "@/core/i18n/config";
import type { Dictionary } from "@/core/i18n/dictionaries";

import type { SupportContacts } from "./support-contacts";

export type SectionProps = {
  dict: Dictionary;
  locale: Locale;
  support: SupportContacts;
};
