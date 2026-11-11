import type { StaffRole } from "@/features/desk/session";

export type NavSection = "pos" | "ops" | "finance" | "admin";

export type NavItem = {
  href: string;
  label: string;
  roles: StaffRole[];
  section: NavSection;
};

const CS = ["CUSTOMER_SERVICE", "CUSTOMER_SERVICE_SUPERVISOR"] as const;
const OPS = ["OPERATIONS"] as const;
const ADMIN = ["ADMIN", "SUPER_ADMIN"] as const;

export const NAV: NavItem[] = [
  { href: "/erp/pos", label: "شحن محفظة سائق", section: "pos", roles: ["STORE_OPERATOR"] },
  { href: "/erp/pos/transactions", label: "سجل الشحن", section: "pos", roles: ["STORE_OPERATOR"] },
  { href: "/erp/command-center", label: "مركز القيادة", section: "ops", roles: [...CS, ...OPS, "FINANCE", ...ADMIN] },
  { href: "/erp/reports", label: "التقارير التشغيلية", section: "ops", roles: [...OPS, "FINANCE", ...ADMIN] },
  { href: "/erp/rides/live", label: "الرحلات الحية", section: "ops", roles: [...CS, ...OPS, ...ADMIN] },
  { href: "/erp/rides/scheduled", label: "الرحلات المجدولة", section: "ops", roles: [...CS, ...OPS, ...ADMIN] },
  { href: "/erp/rides", label: "سجل الرحلات", section: "ops", roles: [...CS, ...OPS, "WALLET_OPERATOR", "FINANCE", ...ADMIN] },
  { href: "/erp/alerts", label: "التنبيهات", section: "ops", roles: [...CS, ...OPS, ...ADMIN] },
  { href: "/admin/notifications", label: "الإشعارات", section: "ops", roles: [...CS, ...OPS, "WALLET_OPERATOR", "FINANCE", ...ADMIN] },
  { href: "/erp/complaints", label: "الشكاوى", section: "ops", roles: [...CS, ...ADMIN] },
  { href: "/erp/emergencies", label: "الطوارئ", section: "ops", roles: [...CS, ...OPS, ...ADMIN] },
  { href: "/erp/cases", label: "الحوادث", section: "ops", roles: [...CS, ...OPS, ...ADMIN] },
  { href: "/erp/customers", label: "العملاء", section: "ops", roles: [...CS, ...ADMIN] },
  { href: "/admin/drivers", label: "السائقون", section: "ops", roles: [...OPS, ...ADMIN] },
  { href: "/admin/drivers/phone-changes", label: "تغيير أرقام السائقين", section: "ops", roles: [...OPS, ...ADMIN] },
  { href: "/admin/driver-scores", label: "تقييم السائقين", section: "ops", roles: [...OPS, ...ADMIN] },
  { href: "/admin/vehicles", label: "المركبات", section: "ops", roles: [...OPS, ...ADMIN] },
  { href: "/erp/finance/performance", label: "الأداء المالي", section: "finance", roles: ["FINANCE", ...ADMIN] },
  { href: "/erp/wallets", label: "المحافظ", section: "finance", roles: ["WALLET_OPERATOR", "FINANCE", ...ADMIN] },
  { href: "/erp/finance/entitlements", label: "المستحقات", section: "finance", roles: ["FINANCE", ...ADMIN] },
  { href: "/erp/finance/incentives", label: "المكافآت المصروفة", section: "finance", roles: ["FINANCE", "WALLET_OPERATOR", ...OPS, ...ADMIN] },
  { href: "/erp/finance/compensation", label: "التعويضات", section: "finance", roles: ["FINANCE", "CUSTOMER_SERVICE_SUPERVISOR", ...ADMIN] },
  { href: "/admin/stores", label: "المتاجر", section: "finance", roles: ["FINANCE", ...ADMIN] },
  { href: "/admin/stores/reconciliation", label: "مطابقة المتاجر", section: "finance", roles: ["FINANCE", ...ADMIN] },
  { href: "/admin/branches", label: "الفروع", section: "admin", roles: [...ADMIN] },
  { href: "/admin/categories", label: "الفئات والتسعير", section: "admin", roles: [...ADMIN] },
  { href: "/admin/passport", label: "جواز العميل", section: "admin", roles: [...ADMIN] },
  { href: "/admin/driver-passport", label: "جواز السائق", section: "admin", roles: [...ADMIN] },
  { href: "/admin/services", label: "شارات الخدمات", section: "admin", roles: [...ADMIN] },
  { href: "/admin/discounts", label: "أكواد الخصم", section: "admin", roles: [...ADMIN] },
  { href: "/admin/config/incentives", label: "حوافز السائقين", section: "admin", roles: [...ADMIN] },
  { href: "/admin/config/dispatch", label: "إعدادات التوزيع", section: "admin", roles: [...ADMIN] },
  { href: "/admin/config/app-info", label: "الدعم والتواصل", section: "admin", roles: [...ADMIN] },
  { href: "/admin/config/branding", label: "هوية التطبيق", section: "admin", roles: [...ADMIN] },
  { href: "/admin/staff", label: "الموظفون", section: "admin", roles: [...ADMIN] },
  { href: "/admin/audit", label: "سجل التدقيق", section: "admin", roles: [...ADMIN] },
];

export const SECTION_LABEL: Record<NavSection, string> = {
  pos: "نقطة البيع",
  ops: "التشغيل",
  finance: "المالية",
  admin: "الإدارة",
};

export function navFor(role: StaffRole) {
  // POS screens act for the operator's own store; admins have no store.
  if (role === "SUPER_ADMIN" || role === "ADMIN") return NAV.filter((item) => item.section !== "pos");
  return NAV.filter((item) => item.roles.includes(role));
}

export function navMatch(pathname: string) {
  return NAV.filter((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];
}

export function canOpen(role: StaffRole, pathname: string) {
  if (role === "SUPER_ADMIN" || role === "ADMIN") return true;
  const item = navMatch(pathname);
  if (!item) return pathname === "/erp" || pathname === "/admin";
  return item.roles.includes(role);
}
