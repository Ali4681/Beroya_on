import { t } from "@/features/desk/i18n/t";

export const STAFF_ROLES = [
  "CUSTOMER_SERVICE",
  "CUSTOMER_SERVICE_SUPERVISOR",
  "OPERATIONS",
  "WALLET_OPERATOR",
  "FINANCE",
  "ADMIN",
  "SUPER_ADMIN",
  "STORE_OPERATOR",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

/** Store cashier: password login like staff, but only the POS screens of its own store. */
export function isStoreOperator(role: string | undefined) {
  return role === "STORE_OPERATOR";
}

export type StaffStore = {
  id: string;
  code: string;
  name: string;
  status: string;
};

export type StaffBranch = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string | null;
};

export type StaffUser = {
  id: string;
  role: StaffRole;
  phone: string | null;
  email: string | null;
  full_name: string | null;
  /** Relative API path for desk avatar; needs Bearer via /api/proxy. */
  avatar_url?: string | null;
  branch_id: string | null;
  branch: StaffBranch | null;
  store?: StaffStore | null;
  is_active: boolean;
};

export type StaffSession = {
  accessToken: string;
  refreshToken: string;
  user: StaffUser;
};

const ACCESS_KEY = "beroya-go.staff.access";
const REFRESH_KEY = "beroya-go.staff.refresh";
const USER_KEY = "beroya-go.staff.user";
const ROLE_COOKIE = "beroya_staff_role";

export function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value);
}

export function roleLabel(role: StaffRole) {
  const labels: Record<StaffRole, string> = {
    CUSTOMER_SERVICE: "خدمة العملاء",
    CUSTOMER_SERVICE_SUPERVISOR: "مشرف خدمة العملاء",
    OPERATIONS: "التشغيل",
    WALLET_OPERATOR: "مشغّل المحفظة",
    FINANCE: "المالية",
    ADMIN: "مدير",
    SUPER_ADMIN: "مدير عام",
    STORE_OPERATOR: "مشغّل متجر",
  };
  return t(labels[role]);
}

export function homeFor(role: StaffRole) {
  if (role === "STORE_OPERATOR") return "/erp/pos";
  if (role === "WALLET_OPERATOR") return "/erp/wallets";
  if (role === "FINANCE") return "/erp/finance/entitlements";
  return "/erp/rides/live";
}

export function deskReturnPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  const path = value.split("?")[0]?.split("#")[0] ?? "";
  if (path === "/login" || path.startsWith("/login/")) return null;
  if (path === "/erp" || path.startsWith("/erp/") || path === "/admin" || path.startsWith("/admin/")) return value;
  return null;
}

function readUser(raw: string | null): StaffUser | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as StaffUser;
    if (!value?.id || !isStaffRole(value.role)) return null;
    return value;
  } catch {
    return null;
  }
}

export function readSession(): StaffSession | null {
  if (typeof window === "undefined") return null;
  const accessToken = window.localStorage.getItem(ACCESS_KEY);
  const refreshToken = window.localStorage.getItem(REFRESH_KEY);
  const user = readUser(window.localStorage.getItem(USER_KEY));
  if (!accessToken || !refreshToken || !user) return null;
  return { accessToken, refreshToken, user };
}

export function writeSession(session: StaffSession) {
  window.localStorage.setItem(ACCESS_KEY, session.accessToken);
  window.localStorage.setItem(REFRESH_KEY, session.refreshToken);
  window.localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  document.cookie = `${ROLE_COOKIE}=${session.user.role}; Path=/; Max-Age=2592000; SameSite=Lax`;
}

export function clearSession() {
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  window.localStorage.removeItem(USER_KEY);
  document.cookie = `${ROLE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
