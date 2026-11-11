export const E164 = /^\+[1-9]\d{7,14}$/;
export const E164_MSG = 'phone must be a valid E.164 number, e.g. +963912345678';

/** Turns a local Syrian number or Arabic digits into E.164. Returns the original text when it cannot. */
export function normalizeE164(value: unknown) {
  if (typeof value !== 'string') return value;
  let phone = value.trim();
  phone = phone.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  phone = phone.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
  phone = phone.replace(/[^\d+]/g, '');
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  else if (phone.startsWith('0')) phone = `+963${phone.slice(1)}`;
  else if (phone.startsWith('963')) phone = `+${phone}`;
  // Local mobile without leading 0: 912345678 → +963912345678
  else if (/^9\d{8}$/.test(phone)) phone = `+963${phone}`;
  else if (phone && !phone.startsWith('+')) phone = `+${phone}`;
  return E164.test(phone) ? phone : value;
}
