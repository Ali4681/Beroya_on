import "server-only";

import { getServerEnv } from "@/core/config/server-env";
import { publicEnv } from "@/core/config/public-env";

import { EMPTY_SUPPORT, type SupportContacts } from "./support-contacts";

function goApiBase() {
  const { apiUrl } = getServerEnv();
  if (apiUrl) return `${apiUrl.replace(/\/$/, "")}/api/v1/go`;
  return publicEnv.goApiUrl;
}

/** Public support channels from desk «الدعم والتواصل» (`GET /app/info`). */
export async function loadPublicSupport(): Promise<SupportContacts> {
  try {
    const response = await fetch(`${goApiBase()}/app/info?app=customer`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 30 },
    });
    if (!response.ok) return EMPTY_SUPPORT;
    const info = (await response.json()) as {
      support_phone?: string | null;
      support_whatsapp?: string | null;
      support_email?: string | null;
    };
    return {
      phone: typeof info.support_phone === "string" ? info.support_phone.trim() : "",
      whatsapp: typeof info.support_whatsapp === "string" ? info.support_whatsapp.trim() : "",
      email: typeof info.support_email === "string" ? info.support_email.trim() : "",
    };
  } catch {
    return EMPTY_SUPPORT;
  }
}
