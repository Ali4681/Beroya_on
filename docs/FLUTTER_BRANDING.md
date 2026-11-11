# دليل مطوّر Flutter — Dynamic App Branding & Remote App Icon

هذا المستند موجّه لمطوّر تطبيق Flutter (عميل / سائق).  
الـBackend والـDashboard جاهزان في مستودع `Beroya_on`. تطبيق Flutter **منفصل**؛ ادمج هذا الدليل داخل مشروعكم الحالي. لا تنشئ تطبيقاً جديداً.

الهدف: الإدارة تغيّر الشعار والألوان والحركات من الداشبورد، والتطبيق يطبّقها **بدون تحديث متجر**. أيقونة الشاشة الرئيسية تتبدّل أيضاً بدون تحديث، لكن فقط من مجموعة أيقونات **مضمّنة مسبقاً** في الـbuild.

> **هوية منفصلة:** تطبيق الزبون ≠ تطبيق السائق. مرّر دائماً `?app=customer` أو `?app=driver`. التفاصيل والقبول في `docs/FLUTTER_APP_IDENTITY_CUSTOMER_DRIVER.md`.

---

## 1. تصنيف التغييرات (مهم)

### بدون تحديث التطبيق

| العنصر | المصدر |
| --- | --- |
| الشعار | URL من السيرفر |
| Primary / Secondary / Background | hex من السيرفر |
| Splash ديناميكي (صورة / GIF / Lottie) | URL + مدة |
| Loading / Home / Success / Error / Empty | URL |
| تبديل أيقونة بين `icon_01` … `icon_20` | id من السيرفر + أصول أصلية مضمّنة |

### يحتاج تحديث متجر

- أيقونة جديدة غير مضمّنة (`icon_21`)
- اسم التطبيق الظاهر في الـlauncher إذا كان native metadata
- Package name / Bundle ID
- أي تغيير في `AndroidManifest` / `Info.plist` / aliases جديدة

### ممنوع تقنياً

لا تحمّل PNG من السيرفر وتحوّله إلى **Launcher Icon**. نظام التشغيل لا يسمح بذلك. المسار الصحيح:

```
Build التطبيق
  ├── icon_01
  ├── icon_02
  ├── …
  └── icon_20

Dashboard يختار id
  → Backend يخزّن id
  → Flutter يقرأ id
  → Android activity-alias / iOS alternate icon
```

---

## 2. الـAPI التي يستخدمها التطبيق

Prefix الافتراضي: `/api/v1/go`

التطبيق **لا يحتاج JWT** للـbranding، حتى يعمل الـsplash قبل تسجيل الدخول.

| Method | Path | Auth | الاستخدام |
| --- | --- | --- | --- |
| `GET` | `/app/branding?app=customer\|driver` | عام | إعدادات الـbranding المنشورة **لهذا التطبيق فقط** |
| `GET` | `/app/branding/assets/:slot?app=…&v={version}` | عام | ملف الأصل (شعار، GIF، Lottie، …) لنفس `app` |

`:slot` المسموح:

`logo` · `splash_image` · `splash_animation` · `loading` · `home` · `success` · `error` · `empty`

مسارات الإدارة (`/admin/config/branding`) للداشبورد فقط. لا تستدعها من التطبيق.

أخطاء الـAPI بالشكل الموحد للمشروع:

```json
{
  "statusCode": 404,
  "code": "NOT_FOUND",
  "message": "Asset not set",
  "path": "/api/v1/go/app/branding/assets/logo",
  "timestamp": "...",
  "request_id": "..."
}
```

فرّع على `code` وليس على نص `message`.

---

## 3. شكل الاستجابة (snake_case)

`GET /api/v1/go/app/branding`

```json
{
  "version": 12,
  "logo_url": "/api/v1/go/app/branding/assets/logo?v=12",
  "login_top_url": "/api/v1/go/app/branding/assets/login_top?v=12",
  "home_top_url": "/api/v1/go/app/branding/assets/home_top?v=12",
  "account_top_url": "/api/v1/go/app/branding/assets/account_top?v=12",
  "colors": {
    "primary": "#313193",
    "secondary": "#25C5D1",
    "background": "#FFFFFF"
  },
  "splash": {
    "image_url": "/api/v1/go/app/branding/assets/splash_image?v=12",
    "animation_url": "/api/v1/go/app/branding/assets/splash_animation?v=12",
    "animation_type": "gif",
    "duration_ms": 3000,
    "animation_enabled": true
  },
  "animations": {
    "loading_url": "/api/v1/go/app/branding/assets/loading?v=12",
    "home_url": "/api/v1/go/app/branding/assets/home?v=12",
    "success_url": "/api/v1/go/app/branding/assets/success?v=12",
    "error_url": "/api/v1/go/app/branding/assets/error?v=12",
    "empty_url": "/api/v1/go/app/branding/assets/empty?v=12"
  },
  "app_icon": {
    "android": "icon_03",
    "ios": "icon_03"
  },
  "available_icons": [
    {
      "id": "icon_01",
      "name": "Icon 01",
      "android": true,
      "ios": true,
      "preview_color": "#313193"
    }
  ]
}
```

ملاحظات:

- الحقول غير المعيَّنة تكون `null` وليس سلسلة فارغة.
- الألوان دائماً `#RRGGBB`.
- `animation_type`: `none` | `image` | `gif` | `lottie`.
- `duration_ms`: بين 500 و 15000. القيمة الافتراضية 2500.
- `version` يزيد **فقط عند Publish** من الداشبورد، وليس عند حفظ المسودة.
- `login_top_url` / `home_top_url` / `account_top_url`: زينة أعلى **منفصلة** لكل شاشة (تسجيل الدخول، الرئيسية، حسابي).
- `logo_url`: لوجو تسجيل الدخول والرئيسية (حسابي يعتمد على الزينة من الأعلى فقط).
- السبلاش (`splash.image_url` / `splash.animation_url`) يُعرض **كامل الشاشة**؛ إن كان الاثنان `null` استخدم السبلاش الافتراضي المحلي، مع إبقاء رقم الإصدار ظاهراً فوق الصورة.
-` روابط أصول البراندينغ من الـAPI **نسبية** دائماً (`/api/v1/go/...`). `APP_PUBLIC_URL` هو أصل موقع التتبع (`…/t/{token}`) وليس أصل الـAPI. حوّل روابط الأصول إلى مطلقة في التطبيق:`

```dart
String? absoluteUrl(String? url, String apiBase) {
  if (url == null || url.isEmpty) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  final origin = Uri.parse(apiBase).origin; // مثال: http://10.0.2.2:8000
  return url.startsWith('/') ? '$origin$url' : '$apiBase/$url';
}
```

عناوين التطوير:

| الجهاز | أصل الـAPI |
| --- | --- |
| محاكي Android | `http://10.0.2.2:8000/api/v1/go` |
| محاكي iOS | `http://127.0.0.1:8000/api/v1/go` |
| جهاز حقيقي | IP الجهاز على الشبكة + المنفذ 8000 |
| إنتاج | أصل الـAPI العام (`https://apiberoyaon.beroyaon.com`) |

---

## 4. الـarchitecture داخل تطبيقكم

لا تضع استدعاء الـAPI داخل كل Screen. افصل الطبقات حسب نمط المشروع (Bloc / Riverpod / GetX / ChangeNotifier):

```
lib/.../branding/
  branding_model.dart        // parse JSON
  branding_api.dart          // GET فقط
  branding_cache.dart        // SharedPreferences / Hive / الموجود لديكم
  branding_service.dart      // hydrate + refresh + version
  branding_theme.dart        // ColorScheme من hex
  app_icon_manager.dart      // MethodChannel واحد للمنصتين
  widgets/
    branded_asset.dart       // صورة / GIF / Lottie + fallback
    dynamic_splash.dart
```

استخدم الـHTTP client والـlocal storage الموجودين. لا تضف package جديدة إلا إذا لم يتوفر البديل.

حزم مقترحة فقط عند الحاجة:

| الحاجة | حزمة |
| --- | --- |
| GIF من الشبكة مع كاش | `cached_network_image` (يعرض GIF متحركاً وليس إطاراً واحداً) |
| Lottie JSON | `lottie` |
| كاش الإعدادات | الموجود لديكم (`shared_preferences` كافٍ لـJSON الإعدادات) |

لا تستخدم package عشوائية لتبديل أيقونة الـlauncher. نفّذ Native MethodChannel.

---

## 5. تدفق التشغيل (Cache First)

التطبيق يجب أن يفتح حتى لو السيرفر معطّل أو لا يوجد إنترنت. **ممنوع** Network-first يحجب الـstartup.

```
App Start
  → Native splash (ثابت، سريع)
  → Flutter يبدأ
  → اقرأ branding من الكاش فوراً
  → إن لم يوجد كاش: branding افتراضي مضمّن في الأصول
  → اعرض Dynamic Flutter Splash من الكاش/الافتراضي
  → انتقل للشاشة الرئيسية بعد duration_ms
  → في الخلفية: GET /app/branding
       → إذا localVersion == serverVersion: لا تعِد تحميل الأصول
       → إذا تغيّر version: حدّث الكاش، طبّق الألوان/الشعار، بدّل الأيقونة
```

قواعد:

1. لا تنتظر الشبكة قبل أول إطار Flutter.
2. لا تحمّل GIF/Lottie كبيراً بشكل يمنع الإقلاع؛ اعرض splash ثابت كـplaceholder ثم الحركة عند الجاهزية.
3. أي استثناء في branding يُبتلع؛ التطبيق يكمل بالافتراضي.
4. خزّن JSON الإعدادات + `selected_app_icon` محلياً.

مثال منطق الإصدار:

```dart
Future<void> refresh() async {
  try {
    final remote = await api.fetch(); // BrandingConfig
    if (remote.version == cached.version) return;
    await cache.write(remote);
    applyTheme(remote);
    await AppIconManager.setIcon(
      defaultTargetPlatform == TargetPlatform.iOS
          ? remote.appIcon.ios
          : remote.appIcon.android,
    );
    notifyListeners(); // أو emit في Bloc
  } catch (_) {
    // ابقَ على الكاش / الافتراضي
  }
}
```

---

## 6. Branding الافتراضي (بدون كاش وبدون شبكة)

ضمّن `assets/branding/default.json` بنفس شكل الـAPI، مثلاً:

```json
{
  "version": 1,
  "logo_url": null,
  "colors": {
    "primary": "#313193",
    "secondary": "#25C5D1",
    "background": "#FFFFFF"
  },
  "splash": {
    "image_url": null,
    "animation_url": null,
    "animation_type": "none",
    "duration_ms": 2500,
    "animation_enabled": false
  },
  "animations": {
    "loading_url": null,
    "home_url": null,
    "success_url": null,
    "error_url": null,
    "empty_url": null
  },
  "app_icon": {
    "android": "icon_01",
    "ios": "icon_01"
  }
}
```

عند `null` استخدم شعار/ألوان التطبيق الحالية كـfallback.

---

## 7. الثيم الديناميكي

لا تكتب الألوان hardcoded في كل شاشة. ابنِ `ThemeData` / `ColorScheme` من:

- `branding.colors.primary`
- `branding.colors.secondary`
- `branding.colors.background`

```dart
Color parseHex(String hex, Color fallback) {
  final cleaned = hex.replaceFirst('#', '');
  if (cleaned.length != 6) return fallback;
  final value = int.tryParse(cleaned, radix: 16);
  return value == null ? fallback : Color(0xFF000000 | value);
}
```

اربط الثيم بمصدر الـbranding (InheritedWidget / BlocBuilder / Consumer) حتى يتحدّث الـUI بعد refresh بدون إعادة تشغيل كاملة. إعادة تشغيل كاملة مقبولة فقط لتبديل أيقونة الـlauncher على بعض الأجهزة.

---

## 8. الشعار الديناميكي

اعرض `logo_url` عبر ويدجت واحد (`BrandedAsset`) مع:

- loading صغير
- error → شعار الأصول المحلية
- كاش شبكة
- عمل offline من الكاش

لا تستدعِ `Image.network` مباشرة في كل شاشة.

استخدم `logo_url` في **تسجيل الدخول** و**الرئيسية**. شاشة **حسابي** لا تعرض لوجو كبيراً؛ الزينة الموسمية من `account_top_url`.

---

## 8bis. زينة أعلى الشاشات (منفصلة لكل شاشة)

| Slot | الحقل العام | الشاشة |
| --- | --- | --- |
| `login_top` | `login_top_url` | تسجيل الدخول |
| `home_top` | `home_top_url` | الرئيسية |
| `account_top` | `account_top_url` | حسابي |

- كل ملف مستقل؛ إن كان `null` لتلك الشاشة فلا زينة فوقها.
- رفع: `POST /admin/config/branding/upload` مع `slot` المناسب.
- مسح: `PATCH /admin/config/branding` مع `clear_slot` ثم Publish.

---

## 9. Dynamic Splash (إلزامي)

لا تعتمد على الـnative splash وحده. التسلسل:

```
Native Splash
  → Flutter starts
  → Dynamic Flutter Splash
  → (اختياري) تحميل branding في الخلفية
  → Home
```

الـDynamic Splash يدعم:

| `splash.animation_type` | ماذا تعرض |
| --- | --- |
| `none` | `splash.image_url` كامل الشاشة، وإلا fallback محلي (خريطة + لوجو) |
| `image` | `splash.image_url` **فول سكرين** (فريم موسم كامل) |
| `gif` | `splash.animation_url` كـGIF متحرك فول سكرين |
| `lottie` | `splash.animation_url` كـLottie JSON فول سكرين |

إذا `splash.animation_enabled == false` تجاهل الحركة واعرض `splash.image_url` كاملة إن وُجدت، وإلا السبلاش الافتراضي.

المدة: `splash.duration_ms` ثم انتقل للـHome. لا تجعل GIF/Lottie يمدّد الإقلاع إلى ما لا نهاية؛ استخدم المدة كحد أقصى حتى لو الحركة لم تكتمل.

اعرض رقم `version` فوق صورة/حركة السبلاش.

خلفية الـsplash عند غياب ملف منشور: السبلاش الافتراضي المحلي (ليس مربعاً صغيراً للنص فقط).

---

## 10. GIF

عندما يكون النوع `gif`:

- اعرض GIF حقيقي (كل الإطارات)، ليس أول frame.
- `CachedNetworkImage` يفعل ذلك على الموبايل.
- Network URL + كاش + loading + error.
- إذا فشل التحميل: fallback → `splash.image_url` ثم `logo_url` ثم أصل محلي.
- لا تحجب `runApp` حتى ينتهي تحميل الـGIF.

---

## 11. Lottie

عندما يكون النوع `lottie`:

```dart
Lottie.network(
  url,
  errorBuilder: (_, __, ___) => fallbackImage,
)
```

إذا فشل التحميل أو JSON غير صالح: fallback → صورة ثابتة / شعار.  
لا تُسقط التطبيق.

ميّز الملف من:

1. `animation_type == lottie` (المصدر الرسمي)
2. أو امتداد/محتوى `.json` إذا كان الـslot عاماً (loading/home/…)

---

## 12. الحركات داخل التطبيق

نفس ويدجت الأصول لكل من:

| الحقل | أين يُستخدم |
| --- | --- |
| `animations.loading_url` | مؤشرات التحميل |
| `animations.home_url` | الصفحة الرئيسية (اختياري) |
| `animations.success_url` | نجاح عملية |
| `animations.error_url` | خطأ |
| `animations.empty_url` | قائمة فارغة |

النوع غير مذكور صراحة لهذه الحقول. استنتجه:

- الرابط ينتهي بـ `.json` أو Content-Type `application/json` → Lottie
- `.gif` أو `image/gif` → GIF
- غير ذلك → صورة

إذا كان الرابط `null` استخدم الحركة/الأيقونة الحالية في التطبيق.

---

## 13. App Icon — القاعدة

الخادم يرسل فقط **id**:

```json
"app_icon": { "android": "icon_03", "ios": "icon_03" }
```

القيم المسموحة حالياً: `icon_01` … `icon_20` (عشرون أيقونة).

أي قيمة أخرى: **تجاهلها وأبقِ الأيقونة الحالية**. لا تُسقط التطبيق.

خزّن آخر id محلياً (`selected_app_icon`). Offline استخدم المخزّن. عند عودة الشبكة وطباعة version جديد، طبّق id الجديد.

Abstraction واحدة:

```dart
class AppIconManager {
  static const channel = MethodChannel('com.beroya.go/app_icon');
  static final bundled = {
    for (var i = 1; i <= 20; i++) 'icon_${i.toString().padLeft(2, '0')}',
  };

  static Future<void> setIcon(String id) async {
    if (!bundled.contains(id)) return;
    try {
      await channel.invokeMethod('setIcon', {'id': id});
    } catch (_) {
      // أبقِ الأيقونة الحالية
    }
  }
}
```

نفس الـchannel على Android و iOS. التنفيذ الأصلي يختلف.

---

## 14. Android — activity-alias

1. أزل فلتر `LAUNCHER` من `MainActivity` حتى لا تظهر أيقونتان.
2. أضف alias لكل أيقونة، كلها `targetActivity=".MainActivity"`.
3. واحد فقط `android:enabled="true"` عند التثبيت (عادة `IconAlias01` = `icon_01`).

```xml
<activity
    android:name=".MainActivity"
    android:exported="true"
    android:launchMode="singleTop"
    android:theme="@style/LaunchTheme">
    <!-- بدون action MAIN + category LAUNCHER هنا -->
</activity>

<activity-alias
    android:name=".IconAlias01"
    android:enabled="true"
    android:exported="true"
    android:icon="@mipmap/icon_01"
    android:label="@string/app_name"
    android:targetActivity=".MainActivity">
    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>
</activity-alias>

<!-- كرّر IconAlias02 … IconAlias20 مع android:enabled="false" -->
```

الأصول: `res/mipmap-*/icon_01.png` … `icon_20.png` (أو adaptive xml).

Kotlin (داخل `MainActivity.configureFlutterEngine`):

```kotlin
val aliases = (1..20).map { n ->
    val id = "icon_%02d".format(n)
    val alias = ".IconAlias%02d".format(n)
    id to alias
}

MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.beroya.go/app_icon")
    .setMethodCallHandler { call, result ->
        if (call.method != "setIcon") {
            result.notImplemented()
            return@setMethodCallHandler
        }
        val id = call.argument<String>("id") ?: return@setMethodCallHandler result.error("invalid_icon", null, null)
        val match = aliases.firstOrNull { it.first == id }
            ?: return@setMethodCallHandler result.error("invalid_icon", id, null)
        aliases.forEach { (key, alias) ->
            packageManager.setComponentEnabledSetting(
                ComponentName(this, alias),
                if (key == match.first) PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP,
            )
        }
        result.success(null)
    }
```

سلوك متوقع:

- الأيقونة في الـlauncher قد تتأخر ثوانٍ / تحتاج إعادة رسم الـlauncher.
- بعد kill / restart / reboot يبقى الـalias المفعّل.
- طلب نفس الـid مرتين: نفّذ أو تجاهل؛ لا تُحدث أيقونات مكررة.
- id غير معروف: لا تعطّل كل الـaliases (وإلا تختفي أيقونة التطبيق).

تحقّق يدوياً: أيقونة **واحدة** فقط على الشاشة الرئيسية، والتطبيق يفتح على نفس `MainActivity`.

---

## 15. iOS — Alternate App Icons

1. أضف App Icon sets في `Assets.xcassets`:

- `AppIcon` = الافتراضي = `icon_01`
- `AppIcon-02` … `AppIcon-20` للبدائل

2. في `Info.plist` عرّف `CFBundleAlternateIcons`. مفتاح كل بديل يجب أن يطابق الـid القادم من السيرفر (`icon_02` …):

```xml
<key>CFBundleIcons</key>
<dict>
  <key>CFBundlePrimaryIcon</key>
  <dict>
    <key>CFBundleIconFiles</key>
    <array>
      <string>AppIcon</string>
    </array>
  </dict>
  <key>CFBundleAlternateIcons</key>
  <dict>
    <key>icon_02</key>
    <dict>
      <key>CFBundleIconFiles</key>
      <array>
        <string>AppIcon-02</string>
      </array>
    </dict>
    <!-- كرّر icon_03 … icon_20 بنفس الشكل -->
  </dict>
</dict>
```

3. نفس MethodChannel في `AppDelegate.swift`:

```swift
channel.setMethodCallHandler { call, result in
  guard call.method == "setIcon" else {
    result(FlutterMethodNotImplemented)
    return
  }
  let id = (call.arguments as? [String: Any])?["id"] as? String ?? "icon_01"
  let allowed = (1...20).map { String(format: "icon_%02d", $0) }
  guard allowed.contains(id) else {
    result(FlutterError(code: "invalid_icon", message: id, details: nil))
    return
  }
  guard UIApplication.shared.supportsAlternateIcons else {
    result(nil) // جهاز لا يدعم؛ لا تُسقط التطبيق
    return
  }
  let target: String? = (id == "icon_01") ? nil : id
  if UIApplication.shared.alternateIconName == target {
    result(nil)
    return
  }
  UIApplication.shared.setAlternateIconName(target) { error in
    if let error {
      result(FlutterError(code: "icon_failed", message: error.localizedDescription, details: nil))
    } else {
      result(nil)
    }
  }
}
```

`icon_01` = `setAlternateIconName(nil)` (العودة للافتراضي).

iOS قد يعرض حوار نظام عند التبديل؛ هذا سلوك Apple وليس خطأ في التطبيق.

---

## 16. إضافة `icon_21` لاحقاً

الحد الحالي المتفق عليه مع الـBackend والداشبورد هو **20 أيقونة** (`icon_01` … `icon_20`). لإضافة المزيد:

1. أصل Android (mipmap + activity-alias + خريطة Kotlin)
2. أصل iOS (xcassets + Info.plist + قائمة Swift)
3. أضف id في `AppIconManager.bundled` في Dart
4. أصدر تحديث متجر
5. بعد انتشار التحديث، الـBackend يرفع `APP_ICON_COUNT` والداشبورد يظهر الأيقونة الجديدة

حتى ذلك الحين، التطبيق يتجاهل أي id غير مضمّن.

---

## 17. معالجة الأخطاء (لا تمنع التشغيل)

| الفشل | التصرف |
| --- | --- |
| GIF فشل | صورة splash ثم الشعار ثم أصل محلي |
| Lottie فشل | صورة ثابتة ثم شعار |
| `GET /app/branding` فشل | كاش ثم افتراضي |
| أصل 404 | fallback محلي |
| `app_icon` غير معروف | أبقِ الأيقونة الحالية |
| الجهاز لا يدعم alternate icons | تجاهل بصمت |
| JSON تالف في الكاش | احذف الكاش واستخدم الافتراضي |

---

## 18. الأداء

- Cache first، تحديث الشبكة في الخلفية.
- اعتمد `?v={version}` في روابط الأصول لكاش HTTP صحيح.
- إذا `version` لم يتغيّر لا تعِد تنزيل الشعار/الحركات.
- لا تحمّل كل الحركات الخمس عند الإقلاع؛ حمّل splash أولاً والباقي عند الحاجة (lazy).
- `duration_ms` حد أقصى للـsplash وليس انتظار اكتمال الشبكة.

---

## 19. الأمان من جهة التطبيق

- `GET /app/branding` عام عمداً (لا أسرار فيه).
- لا تطلب endpoints الإدارة من التطبيق.
- لا تنفّذ ملفات مرفوعة؛ اعرض صورة/JSON كبيانات فقط.
- تحقق أن `app_icon` ضمن القائمة المضمّنة قبل استدعاء الـnative.
- حوّل الروابط النسبية بنفس أصل الـAPI المعروف لديكم؛ لا تتبع URLاً عشوائياً من حقل غير متوقع.

---

## 20. قائمة اختبار لمطوّر Flutter

### عام

- [ ] تثبيت جديد: افتراضي ثم سحب الإعدادات
- [ ] مستخدم لديه كاش قديم: يتحدّث عند زيادة `version`
- [ ] Offline: يفتح بالكاش
- [ ] السيرفر متوقف: يفتح بالافتراضي/الكاش
- [ ] إعادة فتح بعد kill
- [ ] إعادة تشغيل الجهاز

### Splash / أصول

- [ ] صورة ثابتة
- [ ] GIF يتحرك فعلياً
- [ ] Lottie يتحرك
- [ ] فشل GIF/Lottie → fallback
- [ ] الملف الكبير لا يجمّد الإقلاع
- [ ] الألوان تتغير في الشاشات المشتركة للثيم

### Android icons

- [ ] `icon_01 → 02 → … → 20 → 01`
- [ ] أيقونة واحدة في الـlauncher (بدون duplicate)
- [ ] التطبيق يفتح بعد التبديل
- [ ] الخلفية / القتل / إعادة التشغيل / reboot
- [ ] بدون إنترنت تبقى الأيقونة المختارة

### iOS icons

- [ ] نفس تسلسل التبديل
- [ ] لا crash على جهاز بدون دعم alternate icons
- [ ] `icon_01` يعيد الافتراضي
- [ ] السلوك Offline كما فوق

---

## 21. ماذا يوجد في `Beroya_on` مقابل ماذا عندكم

| أين | ماذا |
| --- | --- |
| Dashboard `/admin/config/branding` | رفع الأصول، الألوان، اختيار الأيقونة، مسودة/نشر |
| Backend `GET /app/branding` | المصدر الوحيد للتطبيق |
| مشروع Flutter (عندكم) | الكاش، الثيم، الـsplash، GIF/Lottie، MethodChannel، الأيقونات المضمّنة |

الداشبورد لا يرفع launcher icon. يختار فقط من `available_icons`.

---

## 22. Checklist دمج سريع

1. أضف model + API + cache + service حسب بنية المشروع.
2. اقرأ الكاش في `main()` قبل `runApp` (بدون انتظار الشبكة).
3. لفّ `MaterialApp` بثيم مشتق من branding.
4. استبدل الـsplash الحالي بمرحلة Flutter ديناميكية.
5. اعرض الشعار والحركات عبر ويدجت أصول واحد.
6. اربط MethodChannel + aliases أندرويد + alternate iOS للأيقونات العشرين.
7. في الخلفية: fetch → قارن `version` → حدّث.
8. تأكد أن فشل أي خطوة لا يمنع الدخول للتطبيق.

إذا احتجتم دمج هذا داخل ريبو Flutter المحدد، أرسلوا مسار المشروع لنُنفَّذ الطبقات على الـarchitecture الموجودة لديكم بدل نسخ تطبيق جديد.
