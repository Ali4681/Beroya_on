# تذكرة Flutter — صور فئات الرحلات

موجّهة لمطوّر تطبيق **الزبون** (وشاشة اختيار الفئة عند السائق إن وُجدت).
الـBackend جاهز في `Beroya_on`، والإدارة ترفع الصور من الداشبورد (**الفئات والتسعير**). **لم يُنفَّذ أي شيء في تطبيق Flutter بعد.** ادمج داخل مشروعكم الحالي.

---

## القواعد غير القابلة للنقاش

1. مصدر الصورة الوحيد هو الحقل `image_url` من قائمة الفئات — **لا** تستخدم أصولاً ثابتة حسب `code` إلا كـ fallback عند `null` أو فشل التحميل.
2. `image_url` مسار **نسبي** بالنسبة لمضيف الـAPI. ابنِ الـURL الكامل: `{API_BASE}{image_url}`.
3. معامل `?v=` في الرابط هو كاش-باستر (`updated_at`). عند تغيّره أعد جلب الصورة (لا تعتمد على كاش قديم بلا مفتاح الإصدار).
4. صورة الفئة **عامة** (`GET` بدون توكن). لا ترسل Bearer على طلب الصورة إلا إن كان وكيل الشبكة عندكم يفرضه على كل المسارات.
5. `image_url === null` يعني لا صورة مرفوعة — اعرض placeholder محلي (أيقونة سيارة / لون حسب الفئة) ولا تُظهر خطأ للمستخدم.

---

## متى تظهر الصورة؟

| الشاشة | السلوك |
| --- | --- |
| اختيار فئة الرحلة (يومي / VIP / عائلي / سيدات / …) | صورة بجانب أو فوق اسم الفئة |
| تقدير الأجرة / ملخص الطلب | صورة مصغّرة للفئة المختارة إن وُجدت |
| سائق — قائمة الفئات النشطة | نفس الحقل من `GET /driver/ride-categories` |

---

## 1. جلب الفئات

### يومي / فئات المركبات العادية

```http
GET /api/v1/go/customer/ride-categories
```

### خدمة لها فئة مخصّصة (مثال: إسعاف)

```http
GET /api/v1/go/customer/ride-categories?service_type=AMBULANCE
```

- بدون `service_type` أو `DAILY` → فئات المركبات اليومية (يُستثنى منها الرموز المحجوزة مثل `AMBULANCE`).
- `service_type=AMBULANCE` → فئة الإسعاف فقط.

### السائق

```http
GET /api/v1/go/driver/ride-categories
```

نفس شكل العنصر (`PublicCategoryDto`).

---

## 2. شكل العنصر

```json
{
  "id": "uuid",
  "code": "FAMILY",
  "name_ar": "عائلي",
  "name_en": "Family",
  "sort_order": 3,
  "max_passengers": 6,
  "image_url": "/api/v1/go/customer/ride-categories/<uuid>/image?v=1760263200000",
  "pricing": {
    "base_fare": "1000",
    "price_per_km": "400",
    "price_per_minute": "80",
    "minimum_fare": "2500",
    "currency": "SYP"
  }
}
```

| الحقل | ملاحظات |
| --- | --- |
| `image_url` | `string \| null` — نسبي للمضيف |
| `pricing` | `null` إن لم تُسعَّر الفئة بعد — لا تعرضها للطلب إن كان منتجكم يخفي غير المسعّرة |
| `name_ar` / `name_en` | اختر حسب لغة التطبيق |
| `code` | ثابت داخلي (`VIP`, `FAMILY`, …) — للشروط فقط، ليس نص واجهة |

---

## 3. تحميل الصورة

```http
GET {API_BASE}/api/v1/go/customer/ride-categories/:categoryId/image?v=...
```

- من `image_url` مباشرة أسهل من إعادة بناء المسار.
- الاستجابة: بايتات JPEG/PNG/WebP، `Cache-Control: public, max-age=86400`.
- استخدم مكتبة صور مع كاش (مثل `cached_network_image`) ومفتاح كاش يعتمد على **الرابط كاملاً بما فيه `v=`**.

مثال بناء الرابط:

```dart
Uri resolveCategoryImage(String apiBase, String? imageUrl) {
  if (imageUrl == null || imageUrl.isEmpty) {
    throw StateError('no image');
  }
  final base = apiBase.endsWith('/') ? apiBase.substring(0, apiBase.length - 1) : apiBase;
  return Uri.parse(imageUrl.startsWith('http') ? imageUrl : '$base$imageUrl');
}
```

---

## 4. واجهة مقترحة

1. قائمة أفقية أو شبكة لبطاقات الفئات مرتبة بـ `sort_order` تصاعدياً.
2. كل بطاقة:
   - صورة مربعة/مستطيلة مدوّرة الحواف (`image_url` أو placeholder).
   - الاسم حسب اللغة.
   - اختياري: حد أدنى للأجرة من `pricing.minimum_fare` إن وُجد.
3. عند فشل الشبكة للصورة فقط: أبقِ البطاقة واعرض placeholder — لا تفشل القائمة كلها.
4. بعد اختيار الفئة احفظ `ride_category_id` وأرسله في `estimate` / إنشاء الرحلة كما هو اليوم.

---

## 5. التحديث بعد تغيير الإدارة

الإدارة قد تستبدل الصورة في أي وقت. عند كل فتح لشاشة الحجز:

1. أعد `GET /customer/ride-categories` (أو استخدم كاش قصير TTL ثم refresh).
2. إن تغيّر `image_url` (خصوصاً `v=`) ستُحمَّل الصورة الجديدة تلقائياً إن كان مفتاح الكاش يعتمد على الرابط.

لا تعتمد على WebSocket لتحديث صور الفئات.

---

## 6. Checklist للدمج

- [ ] موديل الفئة يتضمن `image_url` اختياري
- [ ] عرض الصورة في منتقي الفئات + fallback عند `null`/خطأ
- [ ] حل المسار النسبي مع `API_BASE`
- [ ] كاش صورة مفتاحه يتضمن `?v=`
- [ ] دعم `service_type` عند خدمات مثل الإسعاف
- [ ] السائق يستخدم نفس الحقل إن ظهرت الفئات عنده
- [ ] لا كسر لتدفق VIP/لغة السائق الحالي (`FLUTTER_VIP_TOURIST_LANGUAGE.md`)

---

## مراجع باك

| المسار | الغرض |
| --- | --- |
| `GET /customer/ride-categories` | قائمة + `image_url` |
| `GET /customer/ride-categories/:id/image` | بايتات الصورة (عام) |
| `GET /driver/ride-categories` | نفس الشكل للسائق |
| داشبورد `/admin/categories` | رفع / استبدال / إزالة الصورة |

**لم يُطلب من Flutter رفع صور** — الرفع من لوحة الإدارة فقط.
