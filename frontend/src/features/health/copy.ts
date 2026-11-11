import type { Locale } from "@/core/i18n/config";
import type { HealthStatus } from "@/domain/entities/health-status";

type StatusCopy = {
  pageTitle: string;
  eyebrow: string;
  title: string;
  lead: string;
  leadEnd: string;
  test: string;
  testing: string;
  target: string;
  targetMissing: string;
  route: string;
  state: string;
  states: Record<HealthStatus["status"] | "checking" | "failed" | "idle", string>;
  requestFailed: string;
  lastCheck: string;
  back: string;
};

export const statusCopy: Record<Locale, StatusCopy> = {
  ar: {
    pageTitle: "حالة الاتصال",
    eyebrow: "الربط مع الـ backend",
    title: "اختبار الاتصال",
    lead: "المتصفح ينادي",
    leadEnd: "، وخادم Next يمرر الطلب إلى الـ backend.",
    test: "اختبر الاتصال",
    testing: "جارٍ الاتصال",
    target: "الوجهة",
    targetMissing: "API_URL غير مضبوط",
    route: "المسار",
    state: "الحالة",
    states: {
      ok: "متصل",
      degraded: "متصل مع تراجع",
      unknown: "استجابة غير معروفة",
      checking: "جارٍ الفحص",
      failed: "فشل الاتصال",
      idle: "بانتظار الاختبار",
    },
    requestFailed: "تعذر إكمال الطلب",
    lastCheck: "آخر فحص",
    back: "العودة للرئيسية",
  },
  en: {
    pageTitle: "Connection status",
    eyebrow: "Backend link",
    title: "Connection test",
    lead: "The browser calls",
    leadEnd: ", and the Next server forwards the request to the backend.",
    test: "Test connection",
    testing: "Connecting",
    target: "Target",
    targetMissing: "API_URL is not set",
    route: "Route",
    state: "Status",
    states: {
      ok: "Connected",
      degraded: "Connected, degraded",
      unknown: "Unknown response",
      checking: "Checking",
      failed: "Connection failed",
      idle: "Waiting for a test",
    },
    requestFailed: "The request could not be completed",
    lastCheck: "Last check",
    back: "Back to home",
  },
};
