# تواصل — خدمة العملاء (واتس / اتصال)

شاشة الحساب «تواصل → خدمة العملاء» كانت تعرض **قريباً**. الرقم يُدار من لوحة التحكم: **إدارة → الدعم والتواصل** ويصل للتطبيق عبر:

`GET /api/v1/go/app/info?app=customer` أو `?app=driver` (عام، بدون توكن)

هوية الزبون منفصلة عن السائق — انظر `docs/FLUTTER_APP_IDENTITY_CUSTOMER_DRIVER.md`.

```json
{
  "app": "customer",
  "support_phone": "+963989901010",
  "support_whatsapp": "+963989901010",
  "support_email": "support@beroyaon.com",
  "terms_url": "...",
  "privacy_url": "...",
  "about_ar": "...",
  "min_supported_version": "1.0.0",
  "latest_version": "1.0.0"
}
```

## المطلوب في Flutter

1. اجلب `app/info?app=customer|driver` حسب هوية الـbuild عند فتح الحساب / شاشة التواصل (أو من كاش **خاص بهذا التطبيق**).
2. أزل شارة **قريباً** عن صف «خدمة العملاء» إذا وُجد `support_phone` أو `support_whatsapp`.
3. عند الضغط على الصف افتح bottom sheet فيه خياران:

| الخيار | الإجراء |
|--------|--------|
| اتصال | `launchUrl(Uri.parse('tel:$phone'))` |
| واتس آب | `https://wa.me/${digitsOnly}` حيث `digitsOnly` = الرقم بدون `+` ومسافات |

```dart
String waMe(String raw) {
  final digits = raw.replaceAll(RegExp(r'\D'), '');
  return 'https://wa.me/$digits';
}

Future<void> openSupportChooser({
  required String? phone,
  required String? whatsapp,
}) async {
  final call = (phone ?? '').trim();
  final wa = (whatsapp ?? phone ?? '').trim();
  // أظهر Sheet: اتصال / واتس آب (أخفِ الخيار إن كان الحقل فارغًا)
  // اتصال → tel:$call
  // واتس → waMe(wa)
}
```

4. إن كان الحقلان فارغين في الـ API، أبقِ «قريباً» أو أخفِ الصف.

## ملاحظة

تعديل واجهة «قريباً» يتم في **مشروع تطبيق العميل (Flutter)** وليس في ريبو `Beroya_on` (Backend + Desk فقط).
افتح مشروع Flutter هنا أو أعطِ مساره ليُنفَّذ التغيير مباشرة.
