import { GoErrorCode } from './go-error-codes';

export type AppLang = 'ar' | 'en';

type Msg = { ar: string; en: string };

/** Default messages per error code. Prefer these over hardcoded throw strings. */
const BY_CODE: Partial<Record<GoErrorCode, Msg>> = {
  [GoErrorCode.VALIDATION_ERROR]: { ar: 'طلب غير صالح', en: 'Validation failed' },
  [GoErrorCode.UNAUTHORIZED]: { ar: 'غير مصرّح', en: 'Unauthorized' },
  [GoErrorCode.ROLE_NOT_ALLOWED]: { ar: 'غير مسموح لهذا الدور', en: 'Role not allowed' },
  [GoErrorCode.BRANCH_SCOPE_DENIED]: { ar: 'خارج نطاق فرعك', en: 'Outside your branch scope' },
  [GoErrorCode.NOT_FOUND]: { ar: 'غير موجود', en: 'Not found' },
  [GoErrorCode.CONFLICT]: { ar: 'تعارض', en: 'Conflict' },
  [GoErrorCode.RATE_LIMITED]: { ar: 'محاولات كثيرة، حاول لاحقاً', en: 'Too many requests' },
  [GoErrorCode.INTERNAL_ERROR]: { ar: 'خطأ داخلي', en: 'Internal server error' },
  [GoErrorCode.SERVICE_UNAVAILABLE]: { ar: 'الخدمة غير متاحة', en: 'Service unavailable' },
  [GoErrorCode.INVALID_CREDENTIALS]: { ar: 'بيانات الدخول غير صحيحة', en: 'Invalid credentials' },
  [GoErrorCode.ACCOUNT_DISABLED]: { ar: 'الحساب معطّل', en: 'Account disabled' },
  [GoErrorCode.ACCOUNT_NOT_FOUND]: { ar: 'الحساب غير موجود', en: 'Account not found' },
  [GoErrorCode.REFRESH_TOKEN_INVALID]: { ar: 'جلسة غير صالحة', en: 'Invalid refresh token' },
  [GoErrorCode.OTP_INVALID]: { ar: 'رمز التحقق غير صحيح', en: 'Invalid OTP' },
  [GoErrorCode.OTP_EXPIRED]: { ar: 'انتهت صلاحية رمز التحقق', en: 'OTP expired' },
  [GoErrorCode.OTP_TOO_MANY_ATTEMPTS]: { ar: 'محاولات كثيرة لرمز التحقق', en: 'Too many OTP attempts' },
  [GoErrorCode.OTP_RESEND_TOO_SOON]: { ar: 'انتظر قبل إعادة إرسال الرمز', en: 'OTP resend too soon' },
  [GoErrorCode.ACTIVE_RIDE_EXISTS]: { ar: 'لديك رحلة نشطة', en: 'Active ride already exists' },
  [GoErrorCode.RIDE_NOT_FOUND]: { ar: 'الرحلة غير موجودة', en: 'Ride not found' },
  [GoErrorCode.RIDE_NOT_ACTIVE]: { ar: 'الرحلة غير نشطة', en: 'Ride is not active' },
  [GoErrorCode.TRACKING_LINK_EXPIRED]: { ar: 'انتهت هذه الرحلة ولم يعد الرابط فعّالاً', en: 'This ride has ended' },
  [GoErrorCode.DISCOUNT_CODE_INVALID]: { ar: 'كود الخصم غير صالح', en: 'Discount code is invalid' },
  [GoErrorCode.DISCOUNT_CODE_EXPIRED]: { ar: 'انتهت صلاحية كود الخصم', en: 'Discount code expired' },
  [GoErrorCode.DISCOUNT_CODE_NOT_ALLOWED_FOR_CATEGORY]: {
    ar: 'هذا الكود غير مسموح لهذه الفئة',
    en: 'Discount code not allowed for this category',
  },
  [GoErrorCode.DISCOUNT_CODE_NOT_ALLOWED_FOR_RIDE_TYPE]: {
    ar: 'هذا الكود غير مسموح لهذا النوع من الرحلات',
    en: 'Discount code not allowed for this ride type',
  },
  [GoErrorCode.DISCOUNT_CODE_USAGE_EXHAUSTED]: {
    ar: 'استُنفد استخدام كود الخصم',
    en: 'Discount code usage exhausted',
  },
  [GoErrorCode.DISCOUNT_CODE_NEW_USERS_ONLY]: {
    ar: 'هذا الكود للمستخدمين الجدد فقط',
    en: 'This code is for new users only',
  },
  [GoErrorCode.DISCOUNT_CODE_NOT_ALLOWED_FOR_AREA]: {
    ar: 'هذا الكود غير مسموح لهذه المنطقة',
    en: 'Discount code not allowed for this area',
  },
  [GoErrorCode.DISCOUNT_CODE_NOT_ALLOWED_FOR_SERVICE]: {
    ar: 'هذا الكود غير مخصص للرحلات اليومية',
    en: 'This code is not for daily rides',
  },
  [GoErrorCode.SAVED_PLACES_LIMIT_REACHED]: {
    ar: 'وصلت للحد الأقصى للأماكن المحفوظة',
    en: 'Saved places limit reached',
  },
  [GoErrorCode.WALLET_INSUFFICIENT_BALANCE]: {
    ar: 'رصيد المحفظة غير كافٍ',
    en: 'Insufficient wallet balance',
  },
  [GoErrorCode.WALLET_CODE_INVALID]: {
    ar: 'كود الشحن غير صالح',
    en: 'Recharge code is invalid',
  },
  [GoErrorCode.WALLET_CODE_ALREADY_USED]: {
    ar: 'تم استخدام كود الشحن مسبقاً',
    en: 'Recharge code already used',
  },
  [GoErrorCode.WALLET_CODE_EXPIRED]: {
    ar: 'انتهت صلاحية كود الشحن',
    en: 'Recharge code expired',
  },
  [GoErrorCode.RECIPIENT_NOT_FOUND]: {
    ar: 'لا يوجد عميل بهذا الرقم',
    en: 'No customer found for this phone',
  },
  [GoErrorCode.TRANSFER_TO_SELF]: {
    ar: 'لا يمكن التحويل لنفسك',
    en: 'Cannot transfer to yourself',
  },
  [GoErrorCode.STORE_ACCOUNT_NOT_LINKED]: {
    ar: 'هذا الحساب غير مرتبط بمتجر فعّال',
    en: 'This account is not linked to a store',
  },
  [GoErrorCode.STORE_SUSPENDED]: {
    ar: 'المتجر موقوف، لا يمكن تنفيذ عمليات الشحن',
    en: 'The store is suspended and cannot recharge wallets',
  },
  [GoErrorCode.STORE_BALANCE_INSUFFICIENT]: {
    ar: 'رصيد المتجر غير كافٍ لهذا الشحن',
    en: 'Insufficient store balance for this recharge',
  },
  [GoErrorCode.RECHARGE_LIMIT_EXCEEDED]: {
    ar: 'المبلغ أكبر من الحد المسموح للشحن الواحد ({limit})',
    en: 'Amount exceeds the per-recharge limit ({limit})',
  },
  [GoErrorCode.RECHARGE_BELOW_MINIMUM]: {
    ar: 'أول شحن لمحفظة السائق يجب ألا يقل عن {minimum}',
    en: "The driver's first top-up must be at least {minimum}",
  },
  [GoErrorCode.DRIVER_NOT_RECHARGEABLE]: {
    ar: 'لا يمكن شحن محفظة هذا السائق حالياً',
    en: "This driver's wallet cannot be recharged right now",
  },
  [GoErrorCode.CURRENCY_MISMATCH]: {
    ar: 'العملة غير مطابقة لعملة المتجر',
    en: 'Currency does not match the store currency',
  },
};

/** Variants keyed by code_detail (stable machine tag). */
const BY_DETAIL: Partial<Record<GoErrorCode, Record<string, Msg>>> = {
  [GoErrorCode.DISCOUNT_CODE_EXPIRED]: {
    CUSTOMER_LIMIT_REACHED: { ar: 'انتهت المدة', en: 'This offer has ended' },
  },
  [GoErrorCode.DISCOUNT_CODE_USAGE_EXHAUSTED]: {
    PER_CUSTOMER_LIMIT_REACHED: {
      ar: 'لقد استخدمت هذا الكود من قبل',
      en: 'You have already used this code',
    },
  },
  [GoErrorCode.DISCOUNT_CODE_NOT_ALLOWED_FOR_AREA]: {
    BRANCH: {
      ar: 'هذا الكود خاص بمحافظة {name}',
      en: 'This code is only valid in {name} governorate',
    },
    EVENT: {
      ar: 'هذا الكود خاص بفعالية {name}',
      en: 'This code is only valid for the {name} event',
    },
  },
};

/** First tag of Accept-Language → ar|en (default AR). */
export function resolveAcceptLanguage(header: string | string[] | undefined): AppLang {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return 'ar';
  const primary = raw.split(',')[0]?.trim().toLowerCase() ?? '';
  if (primary.startsWith('en')) return 'en';
  return 'ar';
}

export function localizeErrorMessage(
  code: string,
  lang: AppLang,
  extra?: Record<string, unknown>,
  fallbackMessage?: string,
): string {
  const detail =
    typeof extra?.code_detail === 'string'
      ? extra.code_detail
      : typeof extra?.reason === 'string'
        ? extra.reason
        : undefined;
  const byDetail = BY_DETAIL[code as GoErrorCode];
  const msg = (detail && byDetail?.[detail]) || BY_CODE[code as GoErrorCode];
  if (!msg) {
    // Keep throw-site message when we have no catalog entry (and it isn't just the bare code).
    if (fallbackMessage && fallbackMessage !== code) return fallbackMessage;
    return lang === 'en' ? code : code;
  }
  return fill(msg[lang], extra, lang);
}

function fill(template: string, extra: Record<string, unknown> | undefined, lang: AppLang) {
  if (!template.includes('{')) return template;
  const values = extra ?? {};
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (key === 'name') {
      const localized =
        lang === 'en'
          ? (values.name_en ?? values.name_ar ?? values.name)
          : (values.name_ar ?? values.name_en ?? values.name);
      return localized == null ? '' : String(localized);
    }
    const value = values[key];
    return value == null ? '' : String(value);
  });
}
