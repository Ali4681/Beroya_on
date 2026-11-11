import { auditActionLabel, auditEntityLabel } from "@/features/desk/audit-labels";
import { isRecord } from "@/features/desk/go-api";
import { bilingualName, listJoin, localeTag, t } from "@/features/desk/i18n/t";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LABELS: Record<string, string> = {
  public_number: "الرقم",
  case_number: "رقم القضية",
  batch_number: "رقم الدفعة",
  status: "الحالة",
  type: "النوع",
  priority: "الأولوية",
  full_name: "الاسم",
  name_ar: "الاسم",
  name_en: "الاسم بالإنكليزية",
  name: "الاسم",
  code: "الرمز",
  phone: "الهاتف",
  customer_phone: "هاتف الزبون",
  driver_phone: "هاتف السائق",
  customer_name: "اسم الزبون",
  driver_name: "اسم السائق",
  email: "البريد",
  plate_number: "اللوحة",
  amount: "المبلغ",
  created_at: "تاريخ الإنشاء",
  updated_at: "آخر تحديث",
  started_at: "وقت البدء",
  ended_at: "وقت الانتهاء",
  recording_status: "حالة التسجيل",
  scheduled_at: "الموعد",
  claimed_at: "وقت الاستلام",
  resolved_at: "وقت الحل",
  closed_at: "وقت الإغلاق",
  branch: "الفرع",
  customer: "العميل",
  driver: "السائق",
  ride: "الرحلة",
  ride_category: "فئة الرحلة",
  category: "الفئة",
  user: "الحساب",
  author: "بواسطة",
  notes: "ملاحظات",
  reason: "السبب",
  is_active: "نشط",
  is_suspended: "موقوف",
  suspended_reason: "سبب الإيقاف",
  operational_blocked: "حظر تشغيلي",
  gender: "الجنس",
  currency: "العملة",
  base_fare: "أجرة الأساس",
  price_per_km: "السعر لكل كم",
  price_per_minute: "السعر لكل دقيقة",
  minimum_fare: "الحد الأدنى",
  estimated_fare: "الأجرة التقديرية",
  final_fare: "الأجرة النهائية",
  balance: "الرصيد",
  outstanding_due: "المبلغ المستحق",
  last_commission_amount: "آخر عمولة",
  approved_amount: "المبلغ المعتمد",
  occurrence_no: "التكرار",
  availability: "التوفر",
  make: "الشركة",
  model: "الطراز",
  color: "اللون",
  year: "السنة",
  level_order: "الترتيب",
  minimum_completed_rides: "حد الرحلات المكتملة",
  minimum_score: "حد النقاط",
  maximum_score: "سقف النقاط",
  initial_score: "نقاط البداية",
  percentage: "النسبة",
  usage_limit: "حد الاستخدام",
  usage_count: "مرات الاستخدام",
  max_customers: "أول عدد من الأشخاص",
  per_customer_limit: "مرات الاستخدام لكل شخص",
  customers_count: "الأشخاص",
  new_users_only: "للمستخدمين الجدد فقط",
  event_name: "اسم الفعالية",
  event_area: "مكان الفعالية",
  valid_from: "يبدأ",
  expires_at: "ينتهي",
  bearer: "الجهة",
  audience: "النطاق",
  scope: "لمن",
  description: "الوصف",
  statement: "الإفادة",
  accident_severity: "شدة الحادث",
  supervisor_decision: "قرار المشرف",
  replacement_ride: "الرحلة البديلة",
  replacement_of_ride: "الرحلة الأصلية",
  active_vehicle: "المركبة الحالية",
  alerts: "التنبيهات",
  stops: "التوقفات",
  requirements: "المتطلبات",
  documents: "الوثائق",
  vehicles: "المركبات",
  last_login_at: "آخر دخول",
  role: "الدور",
  full_name_ar: "الاسم",
  full_name_en: "الاسم بالإنجليزي",
  date_of_birth: "تاريخ الميلاد",
  marital_status: "الحالة الاجتماعية",
  national_id: "الرقم الوطني",
  nationality: "الجنسية",
  blood_type: "فصيلة الدم",
  allergies: "الحساسية",
  emergency_contact: "جهة الطوارئ",
  emergency_phone: "هاتف الطوارئ",
  contract_number: "رقم العقد",
  contract_type: "نوع العقد",
  employment_status: "حالة التوظيف",
  start_date: "تاريخ البدء",
  decision_date: "تاريخ القرار",
  daily_hours: "ساعات العمل اليومية",
  work_days_per_week: "أيام العمل أسبوعياً",
  work_location: "مكان العمل",
  confidentiality_notes: "ملاحظات السرية",
  base_salary: "الراتب الأساسي",
  salary_currency: "عملة الراتب",
  insurance_number: "رقم التأمين",
  specialization: "التخصص",
  university: "الجامعة",
  graduation_year: "سنة التخرج",
  skills: "المهارات",
  has_avatar: "صورة شخصية",
  has_desk_login: "دخول المكتب",
  batch_size: "حجم الدفعة",
  batch_timeout_seconds: "مهلة قبول الطلب",
  max_search_radius_m: "أكبر دائرة توزيع",
  radius_steps_json: "خطوات توسيع الدائرة",
  busy_driver_max_eta_sec: "أقصى وصول لسائق مشغول",
  scheduled_busy_to_pickup_max_eta_sec: "أقصى وصول للموعد",
  scheduled_required_early_arrival_sec: "الحضور المبكر المطلوب",
  pickup_arrival_radius_m: "نطاق الوصول",
  stale_location_seconds: "قدم الموقع",
  long_stop_seconds: "حد التوقف الطويل",
  route_deviation_max_m: "حد الانحراف",
  scheduled_reminder_seconds: "تذكير الموعد",
  scheduled_online_required_seconds: "الاتصال قبل الموعد",
  scheduled_late_tolerance_seconds: "سماح التأخير",
  minimum_initial_topup: "الحد الأدنى للشحن",
  commission_percentage: "نسبة العمولة",
  commission_base: "أساس العمولة",
  system_average_fare: "متوسط الأجرة",
  low_balance_amount_enabled: "تنبيه حد المبلغ",
  low_balance_amount: "حد الرصيد المنخفض",
  low_balance_rides_enabled: "تنبيه حد الرحلات",
  low_balance_remaining_rides: "الرحلات المتبقية عند الانخفاض",
  review_interval_minutes: "فترة المراجعة",
  milestone_every_rides: "كل كم رحلة",
  reward_type: "نوع المكافأة",
  score_delta: "تغير النقاط",
  payment_status: "حالة الدفع",
  payment_method: "طريقة الدفع",
  fare_stack_decision: "قرار الخصم والتعويض",
  customer_payable: "ما يدفعه العميل",
  discount_total: "مجموع الخصم",
  compensation_total: "مجموع التعويض",
  gross_final_fare: "الأجرة قبل الخصم",
  estimated_distance_m: "تقدير الطلب (التقاط → وجهة)",
  estimated_duration_sec: "الوقت المقدّر عند الطلب",
  estimated_route_source: "مصدر المسار",
  estimated_route_summary: "ملخص الطريق",
  to_pickup_distance_m: "إلى العميل عند الإسناد",
  to_customer_distance_m: "إلى العميل",
  to_destination_distance_m: "من العميل إلى الوجهة",
  planned_trip_distance_m: "تقدير الطلب (التقاط → وجهة)",
  with_customer_distance_m: "مع العميل في السيارة (فعلي)",
  driver_total_distance_m: "إجمالي مشي السائق (إلى العميل + معه)",
  destination_changed: "تغيّرت الوجهة",
  stops_count: "عدد التوقفات",
  actual_distance_m: "مع العميل في السيارة (فعلي)",
  actual_duration_sec: "مدة الرحلة مع العميل",
  actual_dropoff_lat: "خط عرض التنزيل الفعلي",
  actual_dropoff_lng: "خط طول التنزيل الفعلي",
  billable_waiting_sec: "انتظار محتسب (بعد دقيقتين مجاناً)",
  free_waiting_sec: "انتظار مجاني عند الالتقاط",
  total_wait_sec: "إجمالي انتظار الالتقاط",
  booking_for: "الحجز لأجل",
  other_passenger_name: "اسم الراكب",
  other_passenger_phone: "هاتف الراكب",
  service_code: "نوع الخدمة",
  vehicles_count: "عدد المركبات",
  random_vehicles: "مركبات عشوائية",
  preferred_driver_language: "لغة السائق المفضلة",
  share_tracking_link: "مشاركة رابط التتبع",
  tracking_token: "رمز التتبع",
  tracking_url: "رابط التتبع",
  wallet_paid_amount: "المدفوع من المحفظة",
  change_returned_amount: "الباقي المُرجع للمحفظة",
  cash_due: "المبلغ النقدي المستحق",
  pickup_lat: "خط عرض الالتقاط",
  pickup_lng: "خط طول الالتقاط",
  pickup_address: "عنوان الالتقاط",
  original_destination_lat: "خط عرض الوجهة",
  original_destination_lng: "خط طول الوجهة",
  original_destination_address: "عنوان الوجهة",
  actual_start_lat: "خط عرض الانطلاق الفعلي",
  actual_start_lng: "خط طول الانطلاق الفعلي",
  assigned_at: "وقت الإسناد",
  arrived_at: "وقت الوصول",
  pickup_source: "مصدر نقطة الالتقاء",
  pickup_updated_at: "آخر تعديل لنقطة الالتقاء",
  completed_at: "وقت الإكمال",
  cancelled_at: "وقت الإلغاء",
  no_show_at: "وقت عدم الحضور",
  cancel_actor_role: "جهة الإلغاء",
  cancel_reason_code: "رمز سبب الإلغاء",
  cancel_reason_text: "نص سبب الإلغاء",
  cancel_score_event: "حدث نقاط الإلغاء",
  wallet_posted_at: "وقت ترحيل المحفظة",
  to_pickup_distance_m_snapshot: "مسافة الذهاب عند الإسناد",
  fleet_vehicles: "مركبات الأسطول",
  fare_lines: "بنود الأجرة",
  sequence: "الترتيب",
  latitude: "خط العرض",
  longitude: "خط الطول",
  address: "العنوان",
  departed_at: "وقت المغادرة",
  offers: "عروض التوزيع",
  ratings: "التقييمات",
  compensations: "التعويضات",
  entitlements: "المستحقات",
  emergencies: "الطوارئ",
  cases: "القضايا",
  complaints: "الشكاوى",
  commission_hold: "حجز العمولة",
  discount_reservation: "حجز الخصم",
  score_ledger: "سجل النقاط",
  stamps: "الأختام",
  passport_stamps: "الأختام",
  duration_days: "مدة الأيام",
  duration_hours: "مدة الساعات",
  stamp_name_ar: "اسم الختم",
  stamp_name_en: "اسم الختم (EN)",
  wallet_transactions: "حركات المحفظة",
  replacement_rides: "الرحلات البديلة",
  device_id: "الجهاز",
  device_name: "اسم الجهاز",
  platform: "المنصة",
  ip: "عنوان IP",
  user_agent: "وكيل المستخدم",
  last_used_at: "آخر استخدام",
  actor_role: "دور المنفّذ",
  action: "الإجراء",
  entity_type: "نوع السجل",
  entity_id: "معرف السجل",
  event: "الحدث",
  title: "العنوان",
  body: "النص",
  error: "الخطأ",
  purpose: "الغرض",
  attempts: "المحاولات",
  consumed_at: "وقت الاستهلاك",
  sort_order: "الترتيب",
  icon: "الأيقونة",
  is_valid: "صالحة",
  comment: "التعليق",
  stars: "النجوم",
  direction: "الاتجاه",
  offered_at: "وقت العرض",
  responded_at: "وقت الرد",
  claimed_by: "المستلم",
  resolved_by: "من حلّها",
  handler: "المسؤول",
  severity: "الشدة",
  recording_url: "رابط التسجيل",
  audio_url: "رابط الصوت",
  closer: "من أغلق",
  decision: "القرار",
  reviewed_at: "وقت المراجعة",
  reviewed_by: "المراجع",
  share_customer: "حصة العميل",
  share_driver: "حصة السائق",
  share_company: "حصة الشركة",
  applied_at: "وقت التطبيق",
  created_by: "أنشئ بواسطة",
  finance_reviewer: "مراجع المالية",
  points: "النقاط",
  discount_code: "كود الخصم",
  max_discount_amount: "سقف الخصم",
  reserved_at: "وقت الحجز",
  released_at: "وقت التحرير",
  used_at: "وقت الاستخدام",
  wallet: "المحفظة",
  reference: "المرجع",
  actor: "المنفّذ",
  version: "النسخة",
  unpublished_changes: "تغييرات غير منشورة",
  operational_reason: "سبب الحظر التشغيلي",
  state: "الحالة",
  occurred_at: "وقت الحدوث",
  reason_code: "رمز السبب",
  submitted_during_ride: "قُدّمت خلال الرحلة",
  staff_notes: "ملاحظات الموظف",
  customer_statement: "إفادة العميل",
  driver_statement: "إفادة السائق",
  negligence_suspected: "اشتباه إهمال",
  closed_by: "من أغلق",
  source_alert: "التنبيه المصدر",
  per_km_mode: "وضع سعر الكيلو",
  incentive_percentage: "نسبة مكافأة السائق",
  incentive_reason: "سبب المكافأة",
  pricing_snapshot: "الأسعار المثبتة",
  center_lat: "خط عرض المركز",
  center_lng: "خط طول المركز",
  service_area_center: "منتصف منطقة الخدمة",
  incentive_rejection_pct: "نسبة مكافأة الرفض",
  incentive_distance_pct: "نسبة مكافأة البعد",
  incentive_grants: "المكافآت المصروفة",
  period_key: "الفترة",
  kind: "النوع",
  band: "التصنيف",
  acceptance_pct: "نسبة القبول",
  online_hours: "ساعات الاتصال",
  earnings: "الأرباح",
  cancel_pct: "نسبة الإلغاء",
  rides_required: "الرحلات المطلوبة",
  reward_amount: "مبلغ الجائزة",
  start_time: "ساعة البداية",
  end_time: "ساعة النهاية",
  days_of_week: "أيام الأسبوع",
};

const ENUMS: Record<string, string> = {
  AUTO: "تلقائي",
  MANUAL: "يدوي",
  INCENTIVE_BONUS: "مكافأة حافز",
  STREAK_DAILY: "سلسلة الرحلات",
  GOAL_CAMPAIGN: "حملة هدف",
  RIDE_REJECTION: "طلب مرفوض",
  RIDE_DISTANCE: "طلب بعيد",
  MANUAL: "يدوية من اللوحة",
  KEEP: "يُحافظ عليه",
  WATCH: "يحتاج متابعة",
  REPLACEABLE: "قابل للاستبدال",
  SEARCHING: "جارٍ البحث",
  DRIVER_ASSIGNED: "تم الإسناد",
  DRIVER_EN_ROUTE: "السائق في الطريق",
  ARRIVED: "وصل السائق",
  IN_PROGRESS: "قيد التنفيذ",
  COMPLETED: "مكتملة",
  CANCELLED_BY_CUSTOMER: "ألغاها العميل",
  CANCELLED_BY_DRIVER: "ألغاها السائق",
  CANCELLED_BY_STAFF: "ألغاها الموظف",
  NO_SHOW: "لم يحضر العميل",
  EN_ROUTE_CANCELLATION: "إلغاء بعد تحرك السائق",
  DRIVER_CANCELLED_RIDE: "إلغاء من السائق",
  DRIVER_CANCEL_PENALTY: "غرامة إلغاء سائق",
  COMPENSATION_BEARER: "تحمّل التعويض",
  INTERRUPTED: "متوقفة",
  REPLACED: "استُبدلت",
  FAILED_NO_DRIVER: "لا يوجد سائق",
  OPEN: "مفتوحة",
  CLAIMED: "مستلمة",
  RESOLVED: "تم الحل",
  CLOSED: "مغلقة",
  IN_REVIEW: "قيد المراجعة",
  ACTIVE: "نشطة",
  HANDLED: "تمت المعالجة",
  URGENT: "عاجلة",
  NORMAL: "عادية",
  PENDING: "بانتظار",
  APPROVED: "موافق عليها",
  REJECTED: "مرفوضة",
  STAFF_APPLIED: "من لوحة التحكم",
  CALCULATED: "محسوبة",
  UNDER_REVIEW: "قيد المراجعة",
  PARTIAL: "جزئية",
  SETTLED: "مسوّاة",
  ACCIDENT: "حادث",
  BREAKDOWN: "عطل",
  SIMPLE: "بسيطة",
  MEDIUM: "متوسطة",
  SEVERE: "شديدة",
  MALE: "ذكر",
  FEMALE: "أنثى",
  UNSPECIFIED: "غير محدد",
  AR: "العربية",
  EN: "الإنجليزية",
  GROSS_FINAL_FARE: "الأجرة النهائية",
  CUSTOMER_PAYABLE: "ما يدفعه العميل",
  INACTIVE: "متوقفة",
  EXPIRED: "منتهية",
  CONSUMED: "مستهلكة",
  ALL: "للكل",
  CUSTOMERS: "عملاء",
  STAMP: "ختم",
  CASH: "نقداً",
  WALLET: "محفظة",
  MIXED: "محفظة + نقد",
  SHAM_CASH: "شام كاش",
  CASH_EXPECTED: "نقد متوقع",
  COLLECTED: "تم التحصيل",
  WAIVED: "معفى",
  DAILY: "يومي",
  TOURIST: "سياحي",
  FLEET: "أسطول",
  RENTAL: "تأجير",
  INTERCITY: "بين المدن",
  ar: "العربية",
  en: "الإنجليزية",
  fr: "الفرنسية",
  tr: "التركية",
  ku: "الكردية",
  CUSTOMER: "عميل",
  STAFF: "موظف",
  SYSTEM: "النظام",
  APP: "التطبيق",
  MAP: "الخريطة",
  MANUAL_PIN: "تحديد يدوي",
  DISCOUNT_ONLY: "الخصم فقط",
  COMPENSATION_ONLY: "التعويض فقط",
  BOTH: "الخصم والتعويض معاً",
  CHILD_SEAT: "مقعد طفل",
  EXTRA_LUGGAGE: "أمتعة إضافية",
  ACCESSIBILITY: "احتياجات خاصة",
  FEMALE_DRIVER: "سائقة",
  LICENSE: "رخصة القيادة",
  VEHICLE_REGISTRATION: "تسجيل المركبة",
  INSURANCE: "تأمين",
  IDENTITY: "هوية",
  ONLINE: "متصل",
  OFFLINE: "غير متصل",
  BUSY: "مشغول",
  AVAILABLE: "متاح",
  LONG_STOP: "توقف طويل",
  LOCATION_STALE: "موقع غير محدّث",
  MAJOR_ROUTE_DEVIATION: "انحراف عن المسار",
  SCHEDULED_DRIVER_OFFLINE: "سائق الموعد غير متصل",
  SCHEDULED_DRIVER_DELAY: "تأخر سائق الموعد",
  URGENT_COMPLAINT: "شكوى عاجلة",
  EMERGENCY: "طوارئ",
  DRIVER_COVERAGE_LOW: "نقص تغطية السائقين",
  ASSIGNMENT_DELAYED: "تأخر إسناد سائق",
  RIDE_DELAYED: "رحلة متأخرة",
  CANCELLATION_RATE_HIGH: "ارتفاع نسبة الإلغاء",
  REPLACEMENT_NEEDED: "بحاجة لإسناد سائق بديل",
  ENGINE: "عطل محرك",
  TIRE: "إطار مثقوب",
  FUEL: "نفاد وقود",
  CRITICAL: "حرج",
  WARNING: "تحذير",
  INFO: "معلومة",
  LIVE: "بث مباشر",
  PENDING_DECISION: "بانتظار القرار",
  SAVED: "محفوظ",
  DELETED: "محذوف",
  PERCENTAGE: "نسبة",
  FIXED_AMOUNT: "مبلغ ثابت",
  BEROYA: "Beroya",
  EXTERNAL: "سائق خارجي",
  DRIVER: "السائق",
  SPLIT: "منقسم",
  UNASSIGNED: "غير محدد",
  IMMEDIATE: "فورية",
  SCHEDULED: "مجدولة",
  SENDING: "جارٍ الإرسال",
  SENT: "مُرسل",
  FAILED: "فشل",
  CANCELLED: "ملغى",
  CUSTOMER_SERVICE: "خدمة العملاء",
  CUSTOMER_SERVICE_SUPERVISOR: "مشرف خدمة العملاء",
  OPERATIONS: "التشغيل",
  WALLET_OPERATOR: "مشغّل المحفظة",
  FINANCE: "المالية",
  ADMIN: "مدير",
  SUPER_ADMIN: "مدير عام",
  SCORE: "نقاط",
  DISCOUNT_CODE: "كود خصم",
  SCORE_AND_DISCOUNT: "نقاط وخصم",
  TOP_UP: "شحن",
  POS_RECHARGE: "شحن من متجر",
  ADMIN_CREDIT: "إضافة رصيد",
  DRIVER_RECHARGE_DEBIT: "شحن سائق",
  REVERSAL_CREDIT: "إرجاع شحن",
  ADMIN_ADJUSTMENT: "تسوية إدارية",
  CREDIT: "إضافة",
  DEBIT: "خصم",
  SUSPENDED: "موقوف",
  REVERSED: "معكوس",
  STORE_OPERATOR: "مشغّل متجر",
  COMMISSION_DEDUCTION: "خصم عمولة",
  REVERSAL: "عكس",
  ADJUSTMENT: "تسوية",
  ACCOUNT_SUSPENDED: "الحساب موقوف",
  VEHICLE_INACTIVE: "المركبة غير نشطة",
  DOCUMENT_EXPIRED: "وثيقة منتهية",
  DOCUMENT_MISSING: "وثيقة ناقصة",
  WALLET_INSUFFICIENT: "رصيد غير كاف",
  NO_ACTIVE_VEHICLE: "لا مركبة حالية",
  OPERATIONAL_BLOCK: "حظر تشغيلي",
  google: "Google",
  osrm: "OSRM",
  fallback: "تقريبي",
  WEB: "الويب",
  TRAFFIC: "ازدحام",
  VEHICLE_BREAKDOWN: "عطل المركبة",
  WAITING_FOR_CUSTOMER: "بانتظار العميل",
  ROAD_CLOSED: "طريق مغلق",
  CUSTOMER_REQUESTED_STOP: "طلب العميل التوقف",
  OTHER: "أخرى",
  SELF: "لنفسي",
  true: "نعم",
  false: "لا",
};

const FIELD_WORDS: Record<string, string> = {
  pickup: "الالتقاط",
  dropoff: "التنزيل",
  destination: "الوجهة",
  original: "الأصلية",
  actual: "الفعلي",
  booking: "الحجز",
  for: "لأجل",
  lat: "خط العرض",
  lng: "خط الطول",
  address: "العنوان",
  assigned: "الإسناد",
  arrived: "الوصول",
  started: "البدء",
  completed: "الإكمال",
  cancelled: "الإلغاء",
  estimated: "التقديري",
  fare: "الأجرة",
  route: "المسار",
  source: "المصدر",
  summary: "الملخص",
  distance: "المسافة",
  duration: "المدة",
  waiting: "الانتظار",
  billable: "المحتسب",
  payment: "الدفع",
  method: "الطريقة",
  status: "الحالة",
  type: "النوع",
  name: "الاسم",
  phone: "الهاتف",
  email: "البريد",
  other: "الآخر",
  passenger: "الراكب",
  customer: "العميل",
  driver: "السائق",
  branch: "الفرع",
  ride: "الرحلة",
  category: "الفئة",
  vehicle: "المركبة",
  vehicles: "المركبات",
  service: "الخدمة",
  random: "عشوائي",
  preferred: "المفضلة",
  language: "اللغة",
  share: "مشاركة",
  tracking: "التتبع",
  link: "الرابط",
  token: "الرمز",
  paid: "المدفوع",
  change: "الباقي",
  returned: "المُرجع",
  cash: "نقدي",
  due: "مستحق",
  free: "مجاني",
  wait: "انتظار",
  fleet: "الأسطول",
  lines: "البنود",
  snapshot: "اللقطة",
  wallet: "المحفظة",
  amount: "المبلغ",
  balance: "الرصيد",
  created: "الإنشاء",
  updated: "التحديث",
  scheduled: "الموعد",
  claimed: "الاستلام",
  resolved: "الحل",
  closed: "الإغلاق",
  at: "وقت",
  m: "متر",
  sec: "ثانية",
  id: "المعرف",
  url: "الرابط",
  image: "الصورة",
  front: "الأمامي",
  back: "الخلفي",
  min: "الحد الأدنى",
  max: "الحد الأقصى",
  count: "العدد",
  total: "المجموع",
  final: "النهائية",
  gross: "الإجمالي",
  payable: "المستحق",
  discount: "الخصم",
  compensation: "التعويض",
  commission: "العمولة",
  hold: "الحجز",
  offers: "العروض",
  ratings: "التقييمات",
  alerts: "التنبيهات",
  notes: "ملاحظات",
  reason: "السبب",
  code: "الرمز",
  number: "الرقم",
  plate: "اللوحة",
  make: "الشركة",
  model: "الطراز",
  color: "اللون",
  year: "السنة",
  gender: "الجنس",
  role: "الدور",
  level: "المستوى",
  score: "النقاط",
  points: "النقاط",
  stamp: "الختم",
  grant: "المنحة",
  reward: "المكافأة",
  event: "الحدث",
  title: "العنوان",
  body: "النص",
  error: "الخطأ",
  version: "النسخة",
  current: "الحالي",
  next: "التالي",
  last: "الأخير",
  location: "الموقع",
  start: "الانطلاق",
  from: "من",
  to: "إلى",
  valid: "صالح",
  active: "نشط",
  suspended: "موقوف",
  blocked: "محظور",
  operational: "تشغيلي",
  availability: "التوفر",
  user: "الحساب",
  actor: "المنفّذ",
  handler: "المسؤول",
  reviewer: "المراجع",
  decision: "القرار",
  statement: "الإفادة",
  severity: "الشدة",
  priority: "الأولوية",
  platform: "المنصة",
  device: "الجهاز",
  reference: "المرجع",
  currency: "العملة",
  percentage: "النسبة",
  usage: "الاستخدام",
  limit: "الحد",
  reserved: "محجوز",
  released: "محرّر",
  applied: "مطبّق",
  used: "مستخدم",
  case: "القضية",
  public: "العام",
  batch: "الدفعة",
  occurrence: "التكرار",
  no: "الرقم",
  suspected: "مشتبه",
  negligence: "إهمال",
  occurred: "الحدوث",
  by: "بواسطة",
  alert: "التنبيه",
  base: "الأساسي",
  salary: "الراتب",
  contract: "العقد",
  employment: "التوظيف",
  marital: "الاجتماعية",
  national: "الوطني",
  nationality: "الجنسية",
  blood: "الدم",
  allergies: "الحساسية",
  emergency: "الطوارئ",
  contact: "جهة الاتصال",
  work: "العمل",
  days: "الأيام",
  week: "الأسبوع",
  daily: "اليومية",
  hours: "الساعات",
  specialization: "التخصص",
  university: "الجامعة",
  graduation: "التخرج",
  skills: "المهارات",
  insurance: "التأمين",
  custody: "العهدة",
  confidentiality: "السرية",
  allowances: "البدلات",
  attachments: "المرفقات",
  signatures: "التواقيع",
  commissions: "العمولات",
  certificates: "الشهادات",
  languages: "اللغات",
  licenses: "الرخص",
  documents: "الوثائق",
  desk: "المكتب",
  login: "الدخول",
  avatar: "الصورة",
  birth: "الميلاد",
};

const OK = new Set(["COMPLETED", "APPROVED", "STAFF_APPLIED", "SETTLED", "RESOLVED", "CLOSED", "HANDLED", "AVAILABLE", "ONLINE", "ACTIVE", "COLLECTED", "WAIVED", "KEEP", "SENT"]);
const WARN = new Set(["OPEN", "PENDING", "CASH_EXPECTED", "SEARCHING", "IN_REVIEW", "CLAIMED", "UNDER_REVIEW", "PARTIAL", "CALCULATED", "BUSY", "SCHEDULED", "WATCH", "WARNING", "SENDING"]);
const BAD = new Set(["REJECTED", "URGENT", "EMERGENCY", "CANCELLED_BY_CUSTOMER", "CANCELLED_BY_DRIVER", "CANCELLED_BY_STAFF", "NO_SHOW", "FAILED_NO_DRIVER", "SEVERE", "OFFLINE", "BREAKDOWN", "ACCIDENT", "REPLACEABLE", "CRITICAL", "SUSPENDED", "REVERSED", "FAILED", "CANCELLED"]);

export type BadgeTone = "ok" | "warn" | "bad" | "neutral";

export function labelOf(key: string) {
  if (LABELS[key]) return t(LABELS[key]);
  const parts = key.split("_").filter(Boolean);
  if (parts.length === 0) return key;
  const words = parts.map((part) => FIELD_WORDS[part]);
  if (words.every((word) => Boolean(word))) {
    return (words as string[]).map((word) => t(word)).join(" ");
  }
  // Keep unknown segments so keys like pickup_h3 are not labeled as just «الالتقاط».
  return parts
    .map((part, i) => (words[i] ? t(words[i] as string) : part))
    .join(" ");
}

export function enumLabel(value: string) {
  if (ENUMS[value]) return t(ENUMS[value]);
  if (/^[A-Z0-9_]+$/.test(value)) {
    return value
      .toLowerCase()
      .split("_")
      .map((part) => (FIELD_WORDS[part] ? t(FIELD_WORDS[part]) : part))
      .join(" ");
  }
  return t(value);
}

export function toneOf(value: string): BadgeTone {
  if (OK.has(value)) return "ok";
  if (WARN.has(value)) return "warn";
  if (BAD.has(value)) return "bad";
  return "neutral";
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() && !UUID.test(value)) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

export function entityName(value: unknown): string | null {
  if (typeof value === "string" && value.trim() && !UUID.test(value)) return value.trim();
  if (!isRecord(value)) return null;
  const localized = bilingualName(value);
  if (localized) return localized;
  const direct = firstString(value, ["full_name", "full_name_ar", "full_name_en", "name", "case_number", "public_number", "plate_number", "code", "title", "contract_number"]);
  if (direct) return direct;
  if (isRecord(value.user)) {
    const named = firstString(value.user, ["full_name", "phone", "email"]);
    if (named) return named;
  }
  for (const key of ["customer", "driver", "author", "branch", "ride_category", "category", "ride", "active_vehicle", "level"]) {
    const nested = entityName(value[key]);
    if (nested) return nested;
  }
  return firstString(value, ["phone", "email"]);
}

export function headline(row: Record<string, unknown>) {
  return (
    entityName(row) ??
    entityName(row.user) ??
    entityName(row.customer) ??
    entityName(row.driver) ??
    t("بدون اسم")
  );
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeTag(), { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat(localeTag(), { maximumFractionDigits: 2 }).format(value);
}

export function formatMoney(value: number) {
  // Non-breaking space keeps amount + currency on one line in tight KPI cards.
  return `${formatNumber(value)}\u00A0${t("ل.س")}`;
}

const MONEY = /amount|fare|balance|share|price|topup|payable|discount_total|compensation_total|commission_base|minimum_fare|base_fare|salary|custody/i;

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value);
  return null;
}

function formatMeasure(key: string, value: number) {
  if (/_m$/.test(key)) {
    if (value >= 1000) return `${formatNumber(value / 1000)} ${t("كم")}`;
    return `${formatNumber(value)} ${t("م")}`;
  }
  const minutes = Math.round(value / 60);
  if (minutes < 1) return t("أقل من دقيقة");
  return `${formatNumber(minutes)} ${t("دقيقة")}`;
}

export function formatScalar(key: string, value: unknown) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? t("نعم") : t("لا");
  const numeric = asNumber(value);
  if (numeric != null && /_m$|_sec$/.test(key)) return formatMeasure(key, numeric);
  if (typeof value === "number") return MONEY.test(key) ? formatMoney(value) : String(value);
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatWhen(value);
    if (value === "SYP") return t("ل.س");
    if (key === "booking_for" && value === "OTHER") return t("لشخص آخر");
    if (key === "booking_for" && value === "SELF") return t("لنفسي");
    if (key === "action") return auditActionLabel(value);
    if (key === "entity_type") return auditEntityLabel(value);
    if (ENUMS[value]) return t(ENUMS[value]);
    if (ENUMS[value.toUpperCase()]) return t(ENUMS[value.toUpperCase()]);
    if (numeric != null && MONEY.test(key)) return formatMoney(numeric);
    return value;
  }
  return "";
}

function phoneOf(row: Record<string, unknown>) {
  if (typeof row.phone === "string") return row.phone;
  if (isRecord(row.user) && typeof row.user.phone === "string") return row.user.phone;
  return "";
}

function moneyOf(row: Record<string, unknown>) {
  for (const key of ["final_fare", "estimated_fare", "approved_amount", "amount", "balance", "base_fare"]) {
    const value = row[key];
    if (typeof value === "number" || (typeof value === "string" && value.trim())) return formatScalar(key, value);
  }
  return "";
}

export type DeskColumn = {
  id: string;
  label: string;
  kind: "title" | "badge" | "text";
  read: (row: Record<string, unknown>) => string;
  raw?: (row: Record<string, unknown>) => string;
};

export function columnsFor(rows: Record<string, unknown>[]): DeskColumn[] {
  const sample = rows[0] ?? {};
  if ("action" in sample && "entity_type" in sample && !("status" in sample) && !("public_number" in sample)) {
    return [
      {
        id: "title",
        label: t("الإجراء"),
        kind: "title",
        read: (row) => (typeof row.action === "string" ? auditActionLabel(row.action) : t("عملية")),
      },
      {
        id: "actor",
        label: t("المنفّذ"),
        kind: "text",
        read: (row) => entityName(row.actor) ?? (typeof row.actor_role === "string" ? enumLabel(row.actor_role) : "") ?? "",
      },
      {
        id: "actor_role",
        label: t("الدور"),
        kind: "badge",
        read: (row) => formatScalar("actor_role", row.actor_role),
        raw: (row) => (typeof row.actor_role === "string" ? row.actor_role : ""),
      },
      {
        id: "entity_type",
        label: t("نوع السجل"),
        kind: "text",
        read: (row) => (typeof row.entity_type === "string" ? auditEntityLabel(row.entity_type) : ""),
      },
      {
        id: "when",
        label: t("الوقت"),
        kind: "text",
        read: (row) => formatScalar("created_at", row.created_at),
      },
    ];
  }
  const titleLabel = "case_number" in sample ? t("رقم القضية") : "public_number" in sample ? t("الرقم") : "plate_number" in sample && !("full_name" in sample) ? t("المركبة") : t("الاسم");
  const plan: DeskColumn[] = [
    { id: "title", label: titleLabel, kind: "title", read: headline },
    { id: "status", label: t("الحالة"), kind: "badge", read: (row) => formatScalar("status", row.status), raw: (row) => (typeof row.status === "string" ? row.status : "") },
    { id: "type", label: t("النوع"), kind: "badge", read: (row) => formatScalar("type", row.type), raw: (row) => (typeof row.type === "string" ? row.type : "") },
    { id: "priority", label: t("الأولوية"), kind: "badge", read: (row) => formatScalar("priority", row.priority), raw: (row) => (typeof row.priority === "string" ? row.priority : "") },
    { id: "customer", label: t("العميل"), kind: "text", read: (row) => entityName(row.customer) ?? "" },
    { id: "driver", label: t("السائق"), kind: "text", read: (row) => entityName(row.driver) ?? "" },
    { id: "branch", label: t("الفرع"), kind: "text", read: (row) => entityName(row.branch) ?? "" },
    { id: "ride_category", label: t("الفئة"), kind: "text", read: (row) => entityName(row.ride_category) ?? entityName(row.category) ?? "" },
    { id: "ride", label: t("الرحلة"), kind: "text", read: (row) => entityName(row.ride) ?? "" },
    { id: "phone", label: t("الهاتف"), kind: "text", read: phoneOf },
    { id: "plate", label: t("اللوحة"), kind: "text", read: (row) => (typeof row.plate_number === "string" ? row.plate_number : entityName(row.active_vehicle) ?? "") },
    { id: "money", label: t("المبلغ"), kind: "text", read: moneyOf },
    { id: "when", label: t("الوقت"), kind: "text", read: (row) => formatScalar("created_at", row.scheduled_at ?? row.started_at ?? row.created_at) },
  ];

  const picked: DeskColumn[] = [];
  for (const column of plan) {
    if (picked.length >= 6) break;
    const present = rows.some((row) => column.read(row) !== "");
    if (!present) continue;
    if (column.id !== "title" && rows.every((row) => column.read(row) === "" || column.read(row) === headline(row))) continue;
    picked.push(column);
  }

  const covered = new Set([
    "id",
    "case_number",
    "public_number",
    "full_name",
    "name_ar",
    "name",
    "name_en",
    "plate_number",
    "code",
    "title",
    "status",
    "type",
    "priority",
    "phone",
    "email",
    "created_at",
    "updated_at",
    "started_at",
    "scheduled_at",
    "final_fare",
    "estimated_fare",
    "approved_amount",
    "amount",
    "balance",
    "base_fare",
  ]);

  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (picked.length >= 7) break;
      if (covered.has(key) || key.endsWith("_id") || picked.some((column) => column.id === key)) continue;
      if (value == null || typeof value === "object") continue;
      if (typeof value === "string" && UUID.test(value)) continue;
      const sample = formatScalar(key, value);
      if (!sample || rows.every((item) => formatScalar(key, item[key]) === "" || formatScalar(key, item[key]) === headline(item))) continue;
      const badge = typeof value === "string" && ENUMS[value] ? value : "";
      picked.push({
        id: key,
        label: labelOf(key),
        kind: badge ? "badge" : "text",
        read: (item) => formatScalar(key, item[key]),
        raw: badge ? (item) => (typeof item[key] === "string" ? item[key] : "") : undefined,
      });
      covered.add(key);
    }
  }

  return picked.length > 0 ? picked : [{ id: "title", label: t("الاسم"), kind: "title", read: headline }];
}

export type Fact = {
  key: string;
  label: string;
  value: string;
  badge?: string;
};

const RELATION_KEYS = new Set([
  "customer",
  "driver",
  "branch",
  "ride",
  "ride_category",
  "category",
  "author",
  "user",
  "actor",
  "active_vehicle",
  "vehicle",
  "replacement_ride",
  "replacement_of_ride",
  "related",
]);

const SKIP_KEYS = new Set([
  "password",
  "service_area",
  "capabilities",
  "h3_index",
  "pickup_h3",
  "last_lat",
  "last_lng",
  "estimated_route_polyline",
  "encoded_polyline",
  "other_passenger_phone",
  "pickup_wait",
  "driver_total_distance_m",
]);

/** Alias → preferred key. Skip alias when preferred is present (avoids duplicate distance tiles). */
const FACT_ALIASES: Record<string, string> = {
  estimated_distance_m: "planned_trip_distance_m",
  actual_distance_m: "with_customer_distance_m",
  to_destination_distance_m: "with_customer_distance_m",
  to_pickup_distance_m: "to_customer_distance_m",
};

function arrayText(value: unknown[]) {
  if (value.length === 0) return "";
  const names = value.map((item) => entityName(item)).filter((item): item is string => !!item);
  if (names.length > 0) return listJoin(names.slice(0, 4));
  return `${value.length}`;
}

function hasFactValue(value: unknown) {
  return value != null && value !== "";
}

export function factsOf(
  data: Record<string, unknown>,
  options?: { omitPhones?: boolean; omitKeys?: Iterable<string> },
): Fact[] {
  const facts: Fact[] = [];
  const seen = new Set<string>();
  const seenLabelValue = new Set<string>();
  const omitPhones = options?.omitPhones === true;
  const omitKeys = options?.omitKeys ? new Set(options.omitKeys) : null;

  const push = (fact: Fact) => {
    if (!fact.value || seen.has(fact.key)) return;
    if (omitPhones && /phone/i.test(fact.key)) return;
    const labelValue = `${fact.label}\0${fact.value}`;
    if (seenLabelValue.has(labelValue)) return;
    seen.add(fact.key);
    seenLabelValue.add(labelValue);
    facts.push(fact);
  };

  for (const [key, value] of Object.entries(data)) {
    if (SKIP_KEYS.has(key) || key === "id" || key.endsWith("_h3")) continue;
    if (omitKeys?.has(key)) continue;
    const preferred = FACT_ALIASES[key];
    if (preferred && hasFactValue(data[preferred])) continue;
    if (omitPhones && /phone/i.test(key)) continue;
    if (key.endsWith("_id")) {
      const related = entityName(data[key.slice(0, -3)]);
      if (related || UUID.test(String(value ?? ""))) continue;
    }
    if (RELATION_KEYS.has(key)) {
      const name = entityName(value);
      if (name) push({ key, label: labelOf(key), value: name });
      if (!omitPhones && isRecord(value) && isRecord(value.user) && typeof value.user.phone === "string") {
        push({ key: `${key}_phone`, label: `${labelOf(key)} · ${t("الهاتف")}`, value: value.user.phone });
      }
      continue;
    }
    if (Array.isArray(value)) {
      push({ key, label: labelOf(key), value: arrayText(value) });
      continue;
    }
    if (isRecord(value)) {
      const name = entityName(value);
      if (name) push({ key, label: labelOf(key), value: name });
      if (key === "state" && isRecord(value) && typeof value.availability === "string") {
        push({ key: "availability", label: t("التوفر"), value: enumLabel(value.availability), badge: value.availability });
      }
      continue;
    }
    const text = formatScalar(key, value);
    if (!text) continue;
    const badge = typeof value === "string" && ENUMS[value] && /status|priority|type|availability|severity|decision|booking_for|method/.test(key) ? value : undefined;
    push({ key, label: labelOf(key), value: text, badge });
  }

  return facts;
}

export function searchBlob(row: Record<string, unknown>) {
  const parts: string[] = [];
  const walk = (value: unknown, depth: number) => {
    if (depth > 4 || value == null) return;
    if (typeof value === "string") {
      if (UUID.test(value)) return;
      parts.push(value);
      const labeled = formatScalar("status", value);
      if (labeled !== value) parts.push(labeled);
      return;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      parts.push(formatScalar("value", value));
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    if (isRecord(value)) {
      for (const [key, child] of Object.entries(value)) {
        if (key === "id" || key.endsWith("_id") || key === "service_area") continue;
        walk(child, depth + 1);
      }
    }
  };
  walk(row, 0);
  return parts.join(" ").toLowerCase();
}

export function tally(rows: Record<string, unknown>[], key: string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row[key];
    if (typeof value !== "string" || !value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()];
}
