const ARABIC_LATIN: Record<string, string> = {
  ا: "a", أ: "a", إ: "i", آ: "a", ء: "", ؤ: "o", ئ: "e", ب: "b", ت: "t", ث: "th", ج: "j", ح: "h", خ: "kh",
  د: "d", ذ: "th", ر: "r", ز: "z", س: "s", ش: "sh", ص: "s", ض: "d", ط: "t", ظ: "z", ع: "a", غ: "gh",
  ف: "f", ق: "q", ك: "k", ل: "l", م: "m", ن: "n", ه: "h", ة: "a", ى: "a",
};

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export const STORE_ACCOUNT_DOMAIN = "store.beroya.on";

/** Latin, email-safe slug of a store name ("سوبرماركت الشام" → "sobrmarkt-alsham"). */
export function storeSlug(name: string) {
  const words = name
    .normalize("NFKC")
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const latin = words.map((word) =>
    Array.from(word)
      .map((ch, index) => {
        if (/[a-z0-9]/.test(ch)) return ch;
        const digit = ARABIC_DIGITS.indexOf(ch);
        if (digit >= 0) return String(digit);
        if (ch === "و") return index === 0 ? "w" : "o";
        if (ch === "ي") return index === 0 ? "y" : "i";
        return ARABIC_LATIN[ch] ?? "";
      })
      .join(""),
  );
  return latin.filter(Boolean).join("-").slice(0, 40).replace(/-+$/, "");
}

/** Suggested login email; a store's later accounts get a numeric suffix. */
export function suggestStoreEmail(name: string, code: string, existing: number) {
  const base = storeSlug(name) || code.toLowerCase();
  return `${base}${existing > 0 ? `-${existing + 1}` : ""}@${STORE_ACCOUNT_DOMAIN}`;
}

const PASSWORD_LETTERS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
const PASSWORD_DIGITS = "23456789";

/** 12 characters, always with letters and digits (the staff password rule), no look-alike characters. */
export function generatePassword(length = 12) {
  const all = PASSWORD_LETTERS + PASSWORD_DIGITS;
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  const chars = Array.from(bytes, (n) => all[n % all.length]);
  chars[bytes[0] % length] = PASSWORD_DIGITS[bytes[1] % PASSWORD_DIGITS.length];
  if (!chars.some((ch) => PASSWORD_LETTERS.includes(ch))) chars[(bytes[0] + 1) % length] = PASSWORD_LETTERS[bytes[2] % PASSWORD_LETTERS.length];
  return chars.join("");
}
