# تذكرة Flutter — هوية التطبيق (زبون ≠ سائق)

موجّهة لمطوّري **تطبيق الزبون** و**تطبيق السائق** (مشروعان منفصلان).

الـBackend + الداشبورد في `Beroya_on` جاهزان: لكل تطبيق إعدادات منشورة **منفصلة** (ألوان، شعار، سبلاش، أيقونة، دعم، force-update).
**لم يُنفَّذ أي شيء في Flutter بعد.** ادمج داخل كل مشروع حسب الـarchitecture الحالية. لا تنشئ تطبيقاً جديداً.

---

## القواعد غير القابلة للنقاش

1. كل binary يحدّد هويته محلياً: `customer` أو `driver` — **نفس** القيمة المستخدمة في OTP (`app: CUSTOMER|DRIVER` بعد تطبيعها إلى lowercase في الـbranding/`app/info`).
2. **لا** تشارك كاش الـbranding أو `default.json` أو كاش `app/info` بين التطبيقين (مفاتيح تخزين منفصلة).
3. كل طلبات الهوية العامة تمرّر `?app=customer` أو `?app=driver`. بدون JWT.
4. فشل الشبكة/الـAPI: كاش → ثم `assets/branding/default_<app>.json` — التطبيق يفتح دائماً.
5. Package name / Bundle ID / اسم الـlauncher **ثابت per build** — لا يتغيّر من السيرفر (انظر `FLUTTER_BRANDING.md` §1).

---

## API

Base: `/api/v1/go`

| Method | Path | تطبيق الزبون | تطبيق السائق |
| --- | --- | --- | --- |
| `GET` | `/app/branding?app=…` | `app=customer` | `app=driver` |
| `GET` | `/app/branding/assets/:slot?app=…&v=…` | نفس `app` | نفس `app` |
| `GET` | `/app/info?app=…` | `app=customer` | `app=driver` |

- بدون `app` → الباك يعتبرها `customer` (توافق مؤقت). **لا تعتمد على ذلك** — أرسل `app` صراحةً دائماً.
- الاستجابة تتضمّن `"app": "customer" | "driver"`. ارفض/تجاهل إن اختلفت عن هوية الـbuild.
- روابط الأصول نسبية؛ حلّها ضد API base كما في `FLUTTER_BRANDING.md`.

مثال branding:

```json
{
  "app": "customer",
  "version": 3,
  "logo_url": "/api/v1/go/app/branding/assets/logo?app=customer&v=3",
  "colors": { "primary": "#313193", "secondary": "#25C5D1", "background": "#FFFFFF" },
  "splash": { "image_url": null, "animation_url": null, "animation_type": "none", "duration_ms": 2500, "animation_enabled": false },
  "animations": { "loading_url": null, "home_url": null, "success_url": null, "error_url": null, "empty_url": null },
  "app_icon": { "android": "icon_01", "ios": "icon_01" },
  "available_icons": []
}
```

مثال `app/info`:

```json
{
  "app": "driver",
  "support_phone": "+9639…",
  "support_whatsapp": "+9639…",
  "support_email": "…",
  "terms_url": "…",
  "privacy_url": "…",
  "about_ar": "…",
  "min_supported_version": "1.0.0",
  "latest_version": "2.0.0"
}
```

مسارات الإدارة (`/admin/config/branding` و `/admin/config/app-info`) للداشبورد فقط.

---

## المطلوب في كل مشروع Flutter

1. **`AppTarget`** (flavor / `--dart-define` / ثابت compile-time) = `customer` | `driver`.
2. **`BrandingApi.fetch(AppTarget)`** → `GET /app/branding?app=$target`.
3. **`AppInfoApi.fetch(AppTarget)`** → `GET /app/info?app=$target` (دعم + force-update).
4. **`BrandingCache` / `AppInfoCache`** بمفتاح يتضمّن `app` (مثال: `branding_v1_customer`).
5. **`main()`**: hydrate من الكاش قبل `runApp`؛ refresh في الخلفية؛ قارن `version` للـbranding فقط عند تغيّرها بعد Publish.
6. **Theme** من `branding.colors` الخاص بهذا التطبيق فقط.
7. **`AppIconManager`**: طبّق `app_icon` من استجابة **نفس** التطبيق؛ أصول `icon_01…20` مضمّنة في **ذلك** الـbuild. MethodChannel يمكن فصله (`com.beroya.customer/app_icon` vs `com.beroya.driver/app_icon`).
8. OTP يبقى يرسل `app: CUSTOMER` أو `DRIVER` كما هو — لا تخلط قيمة OTP uppercase مع query الـbranding إلا عبر تطبيع واضح إلى lowercase.

```dart
enum AppTarget { customer, driver }

extension AppTargetApi on AppTarget {
  String get query => name; // customer | driver
  String get otpApp => name.toUpperCase(); // CUSTOMER | DRIVER
}
```

---

## ما لا تبنيه

- كاش مشترك أو Singleton branding واحد لكلا التطبيقين.
- طلب `/app/branding` بدون `app` ثم افتراض أن الألوان صالحة للسائق.
- تحميل أيقونة launcher من URL السيرفر (ممنوع — انظر `FLUTTER_BRANDING.md`).
- استدعاء مسارات `/admin/config/*` من الموبايل.

---

## اختبار قبول

- [ ] من الداشبورد: **إدارة → هوية التطبيق → تطبيق الزبون** انشر لوناً مختلفاً عن **تطبيق السائق** → كل binary يعرض لوحته فقط.
- [ ] من الداشبورد: **الدعم والتواصل** غيّر `latest_version` للسائق فقط → تطبيق الزبون لا يجبر التحديث.
- [ ] kill / reboot / offline: كل تطبيق يحتفظ بكاشه دون تلويث الآخر.
- [ ] OTP login ما زال يرسل `app: CUSTOMER` أو `DRIVER` كما هو.
- [ ] روابط الأصول تتضمّن `app=` الصحيح وتعمل قبل تسجيل الدخول.

---

## مراجع

- `docs/FLUTTER_BRANDING.md` — splash، GIF/Lottie، أيقونات الـlauncher، cache-first.
- `docs/FLUTTER_SUPPORT_CONTACT.md` — شاشة التواصل من `app/info` (حدّث الاستدعاء لتمرير `?app=`).
