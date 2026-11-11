import { GoLanguage } from '@/generated/prisma/client';

type LocalizedCopy = { title: string; body: string };
type BilingualCopy = { ar: LocalizedCopy; en: LocalizedCopy };

/** Ticket §38 / §25 — device push + inbox copy (AR + EN). Desk toast silence is frontend-only. */
export const CUSTOMER_PUSH = {
  'ride.driver_assigned': {
    ar: { title: 'تم تعيين سائق', body: 'سائق في الطريق إليك' },
    en: { title: 'Driver assigned', body: 'A driver is on the way to you' },
  },
  'ride.driver_arrived': {
    ar: { title: 'وصل السائق', body: 'السائق عند نقطة الالتقاط' },
    en: { title: 'Driver arrived', body: 'Your driver is at the pickup point' },
  },
  'ride.started': {
    ar: { title: 'بدأت الرحلة', body: 'الرحلة قيد التنفيذ' },
    en: { title: 'Trip started', body: 'Your trip is in progress' },
  },
  'ride.completed': {
    ar: { title: 'اكتملت الرحلة', body: 'تم إنهاء الرحلة' },
    en: { title: 'Trip completed', body: 'Your trip has ended' },
  },
  'ride.replacement_created': {
    ar: { title: 'رحلة بديلة', body: 'تم إنشاء رحلة بديلة' },
    en: { title: 'Replacement trip', body: 'A replacement trip was created' },
  },
  'ride.message': {
    ar: { title: 'رسالة من السائق', body: 'لديك رسالة جديدة' },
    en: { title: 'Message from driver', body: 'You have a new message' },
  },
  'complaint.updated': {
    ar: { title: 'تحديث الشكوى', body: 'تم تحديث شكواك' },
    en: { title: 'Complaint update', body: 'Your complaint was updated' },
  },
  'support.updated': {
    ar: { title: 'تحديث رسالة الدعم', body: 'تم تحديث رسالة الدعم الخاصة بك' },
    en: { title: 'Support update', body: 'Your support message was updated' },
  },
  'emergency.started': {
    ar: { title: 'حالة طوارئ', body: 'تم فتح حالة طوارئ لهذه الرحلة' },
    en: { title: 'Emergency', body: 'An emergency was opened for this trip' },
  },
  'emergency.claimed': {
    ar: { title: 'تمت معالجة الطوارئ', body: 'خدمة العملاء تتابع حالة الطوارئ' },
    en: { title: 'Emergency handled', body: 'Support is following up on the emergency' },
  },
  'emergency.closed': {
    ar: { title: 'أُغلقت حالة الطوارئ', body: 'انتهت متابعة الطوارئ' },
    en: { title: 'Emergency closed', body: 'Emergency follow-up has ended' },
  },
  'discount_code.available': {
    ar: { title: 'كود خصم', body: 'يتوفر كود خصم على حسابك' },
    en: { title: 'Discount code', body: 'A discount code is available on your account' },
  },
  'wallet.updated': {
    ar: { title: 'تحديث المحفظة', body: 'تم تحديث رصيد محفظتك' },
    en: { title: 'Wallet update', body: 'Your wallet balance was updated' },
  },
  'passport.updated': {
    ar: { title: 'تحديث الجواز', body: 'تم تحديث جوازك — طابع أو مستوى أو مكافأة جديدة' },
    en: { title: 'Passport update', body: 'Your passport was updated — new stamp, level, or reward' },
  },
  'ride.cancelled': {
    ar: { title: 'أُلغيت الرحلة', body: 'تم إلغاء رحلتك' },
    en: { title: 'Trip cancelled', body: 'Your trip was cancelled' },
  },
  'ride.driver_cancelled': {
    ar: { title: 'ألغى السائق الرحلة', body: 'ألغى السائق الرحلة — جارٍ البحث عن بديل إن أمكن' },
    en: { title: 'Driver cancelled', body: 'The driver cancelled — we may find a replacement' },
  },
  'ride.failed_no_driver': {
    ar: { title: 'لم يتوفر سائق', body: 'تعذّر إيجاد سائق لرحلتك' },
    en: { title: 'No driver found', body: 'We could not find a driver for your trip' },
  },
  'ride.no_show': {
    ar: { title: 'عدم حضور', body: 'تم تسجيل عدم حضورك عند نقطة الالتقاط' },
    en: { title: 'No-show', body: 'A no-show was recorded at the pickup point' },
  },
  'ride.driver_en_route': {
    ar: { title: 'السائق في الطريق', body: 'السائق متوجه إليك' },
    en: { title: 'Driver en route', body: 'Your driver is heading to you' },
  },
  'ride.breakdown_reported': {
    ar: { title: 'عطل في المركبة', body: 'أبلغ السائق عن عطل — تابع حالة رحلتك' },
    en: { title: 'Vehicle breakdown', body: 'The driver reported a breakdown — check your trip' },
  },
  'ride.compensation_applied': {
    ar: { title: 'تعويض على الرحلة', body: 'تم تطبيق تعويض على رحلتك' },
    en: { title: 'Compensation applied', body: 'Compensation was applied to your trip' },
  },
  'ride.route_updated': {
    ar: { title: 'تحديث المسار', body: 'تم تحديث مسار أو تقدير رحلتك' },
    en: { title: 'Route updated', body: 'Your trip route or estimate was updated' },
  },
} as const satisfies Record<string, BilingualCopy>;

export const DRIVER_PUSH = {
  'ride_offer.created': {
    ar: { title: 'عرض رحلة', body: 'لديك عرض رحلة جديد' },
    en: { title: 'Trip offer', body: 'You have a new trip offer' },
  },
  'scheduled_ride.reminder': {
    ar: { title: 'تذكير برحلة مجدولة', body: 'رحلتك المجدولة بعد ساعة' },
    en: { title: 'Scheduled trip reminder', body: 'Your scheduled trip is in one hour' },
  },
  'wallet.updated': {
    ar: { title: 'تحديث المحفظة', body: 'تم تحديث رصيد المحفظة' },
    en: { title: 'Wallet update', body: 'Your wallet balance was updated' },
  },
  'wallet.low_balance': {
    ar: { title: 'رصيد منخفض', body: 'رصيد المحفظة منخفض' },
    en: { title: 'Low balance', body: 'Your wallet balance is low' },
  },
  'driver.forced_offline': {
    ar: { title: 'إيقاف إجباري', body: 'تم تحويلك إلى غير متصل' },
    en: { title: 'Forced offline', body: 'You were switched to offline' },
  },
  'driver.phone_change_approved': {
    ar: { title: 'تمت الموافقة على تغيير الرقم', body: 'تم اعتماد رقمك الجديد. سجّل الدخول بالرقم المحدَّث إن لزم.' },
    en: { title: 'Phone change approved', body: 'Your new number was approved. Sign in with the updated number if needed.' },
  },
  'driver.phone_change_rejected': {
    ar: { title: 'رُفض تغيير الرقم', body: 'لم تتم الموافقة على طلب تغيير رقم الهاتف. يبقى رقمك الحالي كما هو.' },
    en: { title: 'Phone change rejected', body: 'Your phone change request was rejected. Your current number is unchanged.' },
  },
  'ride.route_updated': {
    ar: { title: 'تغيّر المسار', body: 'تم تحديث مسار الرحلة' },
    en: { title: 'Route updated', body: 'The trip route was updated' },
  },
  'ride.message': {
    ar: { title: 'رسالة من الزبون', body: 'لديك رسالة جديدة' },
    en: { title: 'Message from customer', body: 'You have a new message' },
  },
  'wallet.pos_recharge': {
    ar: { title: 'تم شحن محفظتك', body: 'تم شحن محفظتك بمبلغ {amount} ل.س من {store_name}' },
    en: { title: 'Wallet recharged', body: 'Your wallet was recharged with {amount} SYP at {store_name}' },
  },
  'wallet.pos_recharge_reversed': {
    ar: { title: 'إلغاء شحن', body: 'أُلغي شحن بمبلغ {amount} ل.س (المرجع {reference})' },
    en: { title: 'Recharge reversed', body: 'A {amount} SYP recharge was reversed (ref {reference})' },
  },
  'incentive.awarded': {
    ar: { title: 'مكافأة جديدة', body: 'أُضيف {amount} ل.س إلى محفظتك: {label}' },
    en: { title: 'New reward', body: '{amount} SYP was added to your wallet: {label}' },
  },
  'incentive.goal_started': {
    ar: {
      title: 'هدف جديد: {name}',
      body: 'أكمل {rides_required} رحلات قبل {end_time} واحصل على {reward_amount} ل.س',
    },
    en: {
      title: 'New goal: {name}',
      body: 'Complete {rides_required} trips before {end_time} for {reward_amount} SYP',
    },
  },
  'incentive.goal_achieved': {
    ar: { title: 'حققت الهدف', body: 'أُضيف {amount} ل.س إلى محفظتك: {label}' },
    en: { title: 'Goal achieved', body: '{amount} SYP was added to your wallet: {label}' },
  },
} as const satisfies Record<string, BilingualCopy>;

export type PushAudience = 'customer' | 'driver';

export function pushCopy(
  audience: PushAudience,
  event: string,
  payload: unknown,
  language: GoLanguage = GoLanguage.AR,
): { title: string; body: string } | null {
  if (audience === 'driver' && event === 'wallet.updated' && isErrorPayload(payload)) return null;
  const table: Record<string, BilingualCopy> = audience === 'customer' ? CUSTOMER_PUSH : DRIVER_PUSH;
  const entry = table[event];
  if (!entry) return null;
  const copy = language === GoLanguage.EN ? entry.en : entry.ar;
  return { title: fill(copy.title, payload), body: fill(copy.body, payload) };
}

/** Replaces {key} with the payload's value; numbers get thousands separators. */
function fill(text: string, payload: unknown) {
  if (!text.includes('{')) return text;
  const values = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  return text.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key];
    if (typeof value === 'number') return value.toLocaleString('en-US');
    return value == null ? '' : String(value);
  });
}

function isErrorPayload(payload: unknown) {
  return !!payload && typeof payload === 'object' && 'error' in payload;
}
