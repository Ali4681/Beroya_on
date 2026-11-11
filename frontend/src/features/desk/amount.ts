import { formatMoney } from "@/features/desk/present";

/**
 * Typed money → canonical decimal string ("50000", "30.8"), or null.
 * Accepts Arabic/Persian digits, thousands separators and the Arabic decimal mark. Never goes through a float.
 */
export function normalizeAmount(value: FormDataEntryValue | string | null | undefined): string | null {
  let text = String(value ?? "").trim();
  text = text.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  text = text.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  text = text.replace(/\s+/g, "").replace(/٫/g, ".").replace(/٬/g, ",").replace(/[^\d.,]/g, "");
  if (text.includes(",") && text.includes(".")) {
    text = text.lastIndexOf(",") > text.lastIndexOf(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if ((text.match(/,/g) ?? []).length === 1 && /,\d{1,2}$/.test(text)) {
    text = text.replace(",", ".");
  } else {
    text = text.replace(/,/g, "");
  }
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(text)) return null;
  const trimmed = text.replace(/^0+(?=\d)/, "");
  if (!/[1-9]/.test(trimmed)) return null;
  return trimmed;
}

/** Exact decimal → integer cents, for comparisons and previews without float drift. */
export function toCents(value: string | number | null | undefined): bigint | null {
  if (value == null || value === "") return null;
  const text = typeof value === "number" ? value.toFixed(2) : String(value).trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const cents = BigInt(match[2]) * BigInt(100) + BigInt((match[3] ?? "").padEnd(2, "0"));
  return match[1] ? -cents : cents;
}

export function fromCents(cents: bigint) {
  const negative = cents < BigInt(0);
  const abs = negative ? -cents : cents;
  const whole = abs / BigInt(100);
  const frac = (abs % BigInt(100)).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/** Server money strings ("1500.00") → display text in the desk locale. */
export function moneyText(value: unknown) {
  if (value == null || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? formatMoney(n) : String(value);
}
