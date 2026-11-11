import { t } from "@/features/desk/i18n/t";

/** Arabic labels for audit `action` values. */
export const AUDIT_ACTION_AR: Record<string, string> = {
  "auth.staff_login": "تسجيل دخول موظف",
  "auth.staff_password_changed": "تغيير كلمة مرور موظف",
  "staff.avatar_updated": "تحديث صورة موظف",
  "staff.avatar_removed": "إزالة صورة موظف",
  "wallet.top_up": "شحن محفظة سائق",
  "wallet.withdrawal": "سحب من محفظة سائق",
  "wallet.reversal": "عكس حركة محفظة",
  "customer_wallet.top_up": "شحن محفظة عميل",
  "customer_wallet.withdrawal": "سحب من محفظة عميل",
  "customer_wallet.voucher_redeem": "استبدال قسيمة محفظة",
  "customer_wallet.transfer": "تحويل محفظة عميل",
  "wallet_voucher.created": "إنشاء قسيمة محفظة",
  "wallet_voucher.disabled": "تعطيل قسيمة محفظة",
  "ride.contact_info_viewed": "عرض بيانات الاتصال للرحلة",
  "compensation.applied": "تطبيق تعويض",
  "compensation.finance_allocated": "توزيع تكلفة تعويض",
  "ride.cancelled_by_staff": "إلغاء رحلة من الموظف",
  "ride.cancelled_by_driver": "إلغاء رحلة من السائق",
  "ride.cancelled_by_customer": "إلغاء رحلة من العميل",
  "ride.pickup_updated": "تعديل نقطة الالتقاط",
  "ride.breakdown_reported": "بلاغ عطل مركبة",
  "case.closed": "إغلاق قضية",
  "case.reopened": "إعادة فتح قضية",
  "emergency.started": "بدء طوارئ",
  "emergency.claimed": "استلام طوارئ",
  "emergency.closed": "إغلاق طوارئ",
  "emergency.recording_saved": "حفظ تسجيل طوارئ",
  "emergency.recording_played": "تشغيل تسجيل طوارئ",
  "emergency.recording_deleted": "حذف تسجيل طوارئ",
  "complaint.created": "إنشاء شكوى",
  "complaint.claimed": "استلام شكوى",
  "complaint.updated": "تعديل شكوى",
  "complaint.closed": "إغلاق شكوى",
  "driver_entitlement.adjusted": "تعديل مستحقات سائق",
  "passport.admin_changed": "تعديل جواز عميل",
  "discount_code.changed": "تعديل كود خصم",
  "pricing.changed": "تعديل التسعير",
  "commission.changed": "تعديل العمولة",
  "incentive.config_changed": "تعديل إعدادات الحوافز",
  "incentive.daily_cap_reached": "بلوغ سقف المكافآت اليومي",
  "incentive.manual_run": "تشغيل يدوي للحوافز",
  "incentive.manual_grant": "مكافأة يدوية لسائق",
  "incentive.goal_campaign_changed": "تعديل حملة هدف",
  "pricing.fuel_price_changed": "تعديل سعر الوقود",
  "city.created": "إضافة مدينة",
  "city.updated": "تعديل مدينة",
  CUSTOMER_ACCOUNT_DELETED: "حذف حساب عميل",
  DRIVER_ACCOUNT_DELETED: "حذف حساب سائق",
  "driver.phone_changed": "تغيير رقم سائق",
  "driver.phone_change_requested": "طلب تغيير رقم سائق",
  "driver.phone_change_approved": "الموافقة على تغيير رقم سائق",
  "driver.phone_change_rejected": "رفض تغيير رقم سائق",
  "driver.phone_change_cancelled": "إلغاء طلب تغيير رقم سائق",
  "driver.updated": "تعديل ملف سائق",
  "driver.created": "إنشاء سائق",
  "alert.acknowledged": "استلام تنبيه",
  "alert.resolved": "حل تنبيه",
  "command_center.config_changed": "تعديل إعدادات مركز القيادة",
  "store.created": "إنشاء متجر",
  "store.updated": "تعديل متجر",
  "store.status_changed": "تغيير حالة متجر",
  "store.balance_credited": "شحن رصيد متجر",
  "store.balance_adjusted": "تعديل رصيد متجر",
  "store.operator_created": "إضافة مشغّل متجر",
  "store.operator_updated": "تعديل مشغّل متجر",
  "store.driver_recharged": "شحن رصيد سائق من متجر",
  "store.recharge_reversed": "عكس شحن من متجر",
  "employee.created": "إنشاء موظف",
  "staff.created": "إنشاء حساب موظف",
  "staff.updated": "تعديل حساب موظف",
  "staff.session_revoked": "إنهاء جلسة موظف",
  "service.updated": "تعديل خدمة",
  "service.reordered": "إعادة ترتيب الخدمات",
  "notification.broadcast": "بث إشعار",
  "notification.schedule": "جدولة إشعار",
  "notification.cancel": "إلغاء إشعار",
  "notification.templates.update": "تعديل قوالب الإشعارات",
  "customer.created": "إنشاء عميل",
  "customer.updated": "تعديل عميل",
  "vehicle.created": "إنشاء مركبة",
  "vehicle.updated": "تعديل مركبة",
  "branch.created": "إنشاء فرع",
  "branch.updated": "تعديل فرع",
  "package.created": "إنشاء باقة",
  "package.updated": "تعديل باقة",
  "package.deleted": "حذف باقة",
  "ride_category.created": "إنشاء فئة رحلة",
  "ride_category.updated": "تعديل فئة رحلة",
  "ride_category.deleted": "حذف فئة رحلة",
  "ride.replacement_created": "إنشاء رحلة بديلة",
  "driver.document_upserted": "تحديث وثيقة سائق",
  "driver.vehicle_onboarding_attached": "ربط مركبة بسائق",
  "dispatch_config.updated": "تعديل إعدادات التوزيع",
  "app_info.updated": "تعديل معلومات التطبيق",
  "app_branding.draft_updated": "تعديل مسودة الهوية",
  "app_branding.asset_uploaded": "رفع ملف هوية",
  "app_branding.published": "نشر هوية التطبيق",
  create: "إنشاء",
  update: "تعديل",
  delete: "حذف",
  activate: "تفعيل",
  deactivate: "تعطيل",
};

/** Arabic labels for audit `entity_type` values. */
export const AUDIT_ENTITY_AR: Record<string, string> = {
  user: "مستخدم",
  User: "مستخدم",
  ride: "رحلة",
  GoRide: "رحلة",
  go_ride: "رحلة",
  GoDriverProfile: "سائق",
  go_driver_profile: "سائق",
  GoCustomerProfile: "عميل",
  go_customer_profile: "عميل",
  GoDriverWalletTransaction: "حركة محفظة سائق",
  GoCustomerWalletTransaction: "حركة محفظة عميل",
  GoRideCompensation: "تعويض",
  GoRideCase: "قضية",
  go_emergency_session: "جلسة طوارئ",
  GoEmergencySession: "جلسة طوارئ",
  GoComplaint: "شكوى",
  go_complaint: "شكوى",
  go_complaints: "شكوى",
  GoDriverPhoneChangeRequest: "طلب تغيير رقم",
  go_driver_phone_change_request: "طلب تغيير رقم",
  GoDriverIncentiveGrant: "مكافأة سائق",
  GoIncentiveConfig: "إعدادات الحوافز",
  GoGoalCampaign: "حملة هدف",
  GoStore: "متجر",
  go_store: "متجر",
  GoWalletVoucher: "قسيمة محفظة",
  GoCustomerPassportStamp: "ختم جواز",
  GoDiscountCode: "كود خصم",
  GoCommandCenterConfig: "إعدادات مركز القيادة",
  GoAlert: "تنبيه",
  go_alert: "تنبيه",
  GoBranch: "فرع",
  GoCity: "مدينة",
  GoRidePricing: "تسعير",
  GoCommissionRule: "قاعدة عمولة",
  GoEmployee: "موظف",
  go_employee: "موظف",
  employee: "موظف",
  GoServiceCatalogItem: "خدمة",
  go_service_catalog_item: "خدمة",
  service: "خدمة",
  notification: "إشعار",
  GoNotification: "إشعار",
  GoVehicle: "مركبة",
  go_vehicle: "مركبة",
  vehicle: "مركبة",
  GoPackage: "باقة",
  go_package: "باقة",
  GoRideCategory: "فئة رحلة",
  go_ride_category: "فئة رحلة",
  GoAppBranding: "هوية التطبيق",
  go_app_branding: "هوية التطبيق",
  GoAppInfo: "معلومات التطبيق",
  DispatchConfig: "إعدادات التوزيع",
};

const ACTION_WORD_AR: Record<string, string> = {
  auth: "مصادقة",
  staff: "موظف",
  employee: "موظف",
  service: "خدمة",
  notification: "إشعار",
  customer: "عميل",
  driver: "سائق",
  vehicle: "مركبة",
  branch: "فرع",
  package: "باقة",
  ride: "رحلة",
  ride_category: "فئة رحلة",
  city: "مدينة",
  store: "متجر",
  wallet: "محفظة",
  alert: "تنبيه",
  case: "قضية",
  complaint: "شكوى",
  emergency: "طوارئ",
  incentive: "حوافز",
  pricing: "تسعير",
  commission: "عمولة",
  passport: "جواز",
  discount_code: "كود خصم",
  command_center: "مركز القيادة",
  dispatch_config: "إعدادات التوزيع",
  app_info: "معلومات التطبيق",
  app_branding: "هوية التطبيق",
  created: "إنشاء",
  updated: "تعديل",
  deleted: "حذف",
  broadcast: "بث",
  schedule: "جدولة",
  cancel: "إلغاء",
  templates: "قوالب",
  update: "تعديل",
  published: "نشر",
  uploaded: "رفع",
  draft: "مسودة",
  asset: "ملف",
  reordered: "إعادة ترتيب",
  session: "جلسة",
  revoked: "إنهاء",
  avatar: "صورة",
  removed: "إزالة",
  document: "وثيقة",
  upserted: "تحديث",
  onboarding: "تهيئة",
  attached: "ربط",
  replacement: "بديلة",
  login: "دخول",
  password: "كلمة مرور",
  changed: "تغيير",
};

export function auditActionLabel(action: string) {
  if (AUDIT_ACTION_AR[action]) return t(AUDIT_ACTION_AR[action]);
  const chunks = action.split(/[._]/).filter(Boolean);
  if (chunks.length === 0) return action;
  const words = chunks.map((part) => ACTION_WORD_AR[part]);
  if (words.every(Boolean)) return words.map((word) => t(word as string)).join(" · ");
  return action;
}

export function auditEntityLabel(entityType: string) {
  if (AUDIT_ENTITY_AR[entityType]) return t(AUDIT_ENTITY_AR[entityType]);
  const lower = entityType.toLowerCase();
  for (const [key, label] of Object.entries(AUDIT_ENTITY_AR)) {
    if (key.toLowerCase() === lower) return t(label);
  }
  return entityType;
}

/** Desk path for the audited entity when we can open it. */
export function auditEntityHref(entityType: string, entityId: string, metadata?: Record<string, unknown> | null): string | null {
  if (!entityId) return null;
  const kind = entityType.toLowerCase();
  if (kind.includes("complaint")) return `/erp/complaints/${entityId}`;
  if (kind.includes("emergency")) return `/erp/emergencies/${entityId}`;
  if (kind.includes("case") || kind === "goridecase") return `/erp/cases/${entityId}`;
  if (kind.includes("ride") && !kind.includes("case")) return `/erp/rides/${entityId}`;
  if (kind.includes("driverprofile") || kind === "go_driver_profile") return `/admin/drivers/${entityId}`;
  if (kind.includes("customerprofile") || kind === "go_customer_profile") return `/erp/customers/${entityId}`;
  if (kind.includes("phone_change") || kind.includes("phonechange")) return `/admin/drivers/phone-changes`;
  if (kind.includes("store") && !kind.includes("operator")) return `/admin/stores/${entityId}`;
  if (kind.includes("incentivegrant")) {
    const driverId = metadata && typeof metadata.driver_id === "string" ? metadata.driver_id : null;
    return driverId ? `/admin/drivers/${driverId}` : "/erp/finance/incentives";
  }
  if (kind.includes("wallet") && kind.includes("driver")) {
    const driverId = metadata && typeof metadata.driver_id === "string" ? metadata.driver_id : null;
    return driverId ? `/erp/wallets/${driverId}` : "/erp/wallets";
  }
  if (kind.includes("wallet") && kind.includes("customer")) {
    const customerId = metadata && typeof metadata.customer_id === "string" ? metadata.customer_id : null;
    return customerId ? `/erp/customers/${customerId}` : "/erp/wallets";
  }
  if (kind.includes("alert")) return `/erp/alerts/${entityId}`;
  if (kind.includes("employee")) return `/admin/staff/${entityId}`;
  if (kind === "user") return null;
  return null;
}
