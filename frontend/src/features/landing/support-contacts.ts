export type SupportContacts = {
  phone: string;
  whatsapp: string;
  email: string;
};

export const EMPTY_SUPPORT: SupportContacts = { phone: "", whatsapp: "", email: "" };

export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function whatsappHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "#";
}

export function hasSupportChannel(support: SupportContacts) {
  return Boolean(support.phone || support.whatsapp || support.email);
}

/** Prefer phone call, then WhatsApp, then email, else FAQ anchor. */
export function contactHrefFrom(support: SupportContacts): string {
  if (support.phone) return telHref(support.phone);
  if (support.whatsapp) return whatsappHref(support.whatsapp);
  if (support.email) return `mailto:${support.email}`;
  return "#faq";
}
