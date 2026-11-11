import "server-only";

import type { Locale } from "../config";
import { ar, type Dictionary } from "./ar";
import { en } from "./en";

const dictionaries: Record<Locale, Dictionary> = { ar, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export type { Dictionary };
