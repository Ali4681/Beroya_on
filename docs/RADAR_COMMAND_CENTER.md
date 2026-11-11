# Beroya Radar + مركز القيادة + المرونة عند انقطاع الاتصال

مرجع تقني للـBackend والداشبورد في `Beroya_on`. تطبيق السائق (Flutter) منفصل؛ تذكرته في `FLUTTER_RADAR_OFFLINE.md`.

لا شيء هنا يغيّر التسعير أو التوزيع أو العمولة أو المحافظ. لا يوجد surge.

---

## 1. التعريفات (مصدر واحد للأرقام)

| المقياس | التعريف |
| --- | --- |
| طلب | رحلة أُنشئت في الفترة (`created_at`)، **بدون** الرحلات البديلة (`replacement_of_ride_id`) |
| رحلة منتهية | `COMPLETED` + `CANCELLED` + `NO_SHOW` + `UNSERVED` + `INTERRUPTED` |
| نسبة الإكمال / الإلغاء / بلا سائق | العدد ÷ الرحلات المنتهية. `null` إذا لا توجد رحلات منتهية |
| متوسط زمن الإسناد | `assigned_at − created_at` للرحلات الفورية فقط |
| متوسط انتظار الزبون | `arrived_at − created_at` للرحلات الفورية فقط |
| قبول العروض | المقبولة ÷ (المقبولة + المرفوضة + المنتهية) من `go_ride_offers` حسب `offered_at` |
| سائق متصل | `availability = ONLINE` |
| سائق متاح | متصل + بلا رحلة نشطة + آخر موقع أحدث من `stale_location_seconds` (إعداد التوزيع الحالي) |
| موقع قديم | آخر موقع أقدم من `stale_location_seconds` |
| نقص فعلي في منطقة | طلبات تنتظر الآن > سائقون متاحون في نفس المنطقة |
| نقص متوقع | التوقع للساعة القادمة ≥ 1 و > السائقين المتاحين الآن |
| المقارنة | نفس طول الفترة مباشرة قبلها. التغيّر `null` إذا الفترة السابقة صفر (لا نخترع نسبة) |

المناطق: H3. كل رحلة تُخزّن `pickup_h3` بدقة 9، والعرض بدقة 8 (حي) أو 7 (منطقة أوسع). مستوى الطلب (مرتفع/متوسط/منخفض) **نسبي** داخل المنطقة المعروضة: أعلى 15% مرتفع، الـ35% التالية متوسط، الباقي منخفض.

درجة الخريطة الحرارية `heat` (0–5) للطلب = الأكبر بين طلبات الفترة والطلبات المنتظرة الآن، و`forecast.heat` للتوقع: المناطق التي فيها طلب تُرتّب وتُقسم إلى 5 شرائح متساوية (5 = الأكثر، 0 = لا طلب). القيم المتساوية تأخذ شريحة منتصف ترتيبها. الدرجة **نسبية** داخل المنطقة والفترة المعروضة وليست عدداً مطلقاً.

ألوان الدرجات (نفس الألوان في الداشبورد والتطبيق):

| الدرجة | اللون |
| --- | --- |
| 1 | `#C6F6FA` |
| 2 | `#7AE6F0` |
| 3 | `#22C7D6` |
| 4 | `#1F8D99` |
| 5 | `#0C4D57` |

التعبئة بشفافية ≈ 0.72 وحدود بيضاء رفيعة. الدرجة 0 بدون تعبئة.

## 2. التوقع (Forecast)

- الطريقة: متوسط موسمي — متوسط عدد الطلبات في **نفس ساعة الأسبوع** خلال آخر 2–4 أسابيع، لكل منطقة.
- الأفق: الساعة القادمة فقط.
- إذا أقل من أسبوعين بيانات: `forecast.status = insufficient_data`, `reason = NOT_ENOUGH_HISTORY`.
- إذا أقل من 5 طلبات في كل نوافذ المقارنة: `reason = TOO_FEW_REQUESTS`.
- في حالة البيانات غير الكافية القيمة `null`، والواجهة تقول ذلك صراحة. لا نعرض أرقاماً تاريخية على أنها توقع.
- التوقع ليس وعداً، ولا يؤثر على التوزيع أو السعر.

## 3. الـAPI

Prefix: `/api/v1/go`. الأخطاء بالشكل الموحد (`code`).

### Radar (موظفون: CS، CS_SUP، OPS، ADMIN، SUPER_ADMIN)

| Method | Path | ملاحظات |
| --- | --- | --- |
| `GET` | `/erp/radar/cells?branch_id&from&to&resolution=7|8` | الطلب المرصود + الحي الآن + التوقع لكل منطقة. أقصى نافذة 31 يوماً. كاش 30 ث |
| `GET` | `/erp/radar/cells/:cell` | تفاصيل منطقة: المجموع، الاتجاه، حسب الساعة/اليوم، الطلبات المنتظرة |
| `GET` | `/erp/radar/drivers?branch_id&min_lat&min_lng&max_lat&max_lng` | سائقون متصلون/مشغولون + عمر الموقع + `stale`. حد 2000 |
| `GET` | `/erp/radar/rides?branch_id&status&bbox` | رحلات نشطة وطلبات `SEARCHING` بدون هوية الزبون. حد 2000 |

### Radar السائق

| Method | Path | ملاحظات |
| --- | --- | --- |
| `GET` | `/driver/radar?lat&lng&radius_m` | مناطق قريبة + حتى 3 اقتراحات. 30 طلب/دقيقة (`RATE_LIMITED` 429). `notice: NO_GUARANTEE` |

السائق لا يرى سائقين آخرين ولا زبائن ولا أرقاماً مالية. الاقتراح: `score = 3 × طلبات منتظرة + (التوقع أو الطلبات الأخيرة) − السائقين المتاحين`، فقط القيم الموجبة.

### مركز القيادة

| Method | Path | الأدوار |
| --- | --- | --- |
| `GET` | `/erp/command-center/summary?branch_id&from&to` | CS، CS_SUP، OPS، ADMIN، SUPER_ADMIN |
| `GET` | `/erp/command-center/finance?branch_id&from&to` | FINANCE، ADMIN، SUPER_ADMIN |
| `GET` | `/admin/command-center/config` | أدوار التشغيل + FINANCE |
| `PATCH` | `/admin/command-center/config` | ADMIN، SUPER_ADMIN (يُسجَّل في التدقيق `COMMAND_CENTER_CONFIG_CHANGED`) |

`summary` يعيد: `live`، `period`، `previous`، `changes`، `acceptance`، `series` (ساعي أو يومي بتوقيت الفرع)، `insights`.

الملاحظات التشغيلية (`insights`) مبنية على أرقام فعلية فقط، وكل واحدة معها `evidence`:
`SHORTAGE_AREA`، `FORECAST_SHORTAGE` (فقط إذا التوقع متاح)، `ASSIGNMENT_TIME_RISING`، `CANCELLATION_RISING`، `UNSERVED_REQUESTS`، `STALE_DRIVER_ON_RIDE`.

### المالية

- **إجمالي الأجور ليس ربحاً ولا إيراداً.** يُعرض منفصلاً.
- إيراد الشركة = صافي العمولة (المخصومة − المعكوسة) + غرامات إلغاء السائقين.
- تكاليف الشركة = الحوافز المدفوعة + التعويضات التي تتحملها Beroya.
- محافظ الزبائن غير مرتبطة بفرع، فتعود `null` لأي مستخدم محصور بفرع.
- كل المبالغ بالليرة السورية (`SYP`) ومن جداول المحافظ والرحلات الفعلية.

### نتيجة عملية idempotent

| Method | Path | ملاحظات |
| --- | --- | --- |
| `GET` | `/operations/:key` | مفاتيح المستخدم نفسه فقط: `COMPLETED` (مع `response`) / `IN_PROGRESS` / `NOT_FOUND` |

## 4. التنبيهات التشغيلية

محرك كل دقيقة (queue `go-command-center`). إعدادات `GoCommandCenterConfig`:

| النوع | الشرط | الخطورة |
| --- | --- | --- |
| `DRIVER_COVERAGE_LOW` | طلبات منتظرة في المنطقة ≥ `coverage_min_unassigned` ولا يوجد سائقون متاحون كافون فيها وحولها (الحلقة الأولى من H3) | حرج عند الضعف ولا أحد قريب |
| `ASSIGNMENT_DELAYED` | طلب فوري `SEARCHING` أطول من `assignment_delay_seconds` (180) | حرج عند الضعف |
| `RIDE_DELAYED` | رحلة جارية تجاوزت `max(المدة × ride_delay_factor, المدة + ride_delay_min_extra_seconds)` | تحذير |
| `CANCELLATION_RATE_HIGH` | نسبة الإلغاء في آخر `cancellation_window_minutes` ≥ `cancellation_rate_pct`، فقط إذا الرحلات المنتهية ≥ `cancellation_min_rides` | حرج عند 1.5× |

- لا تكرار: `dedupe_key` + `dedupe_minutes`.
- عند زوال السبب يُغلق التنبيه تلقائياً (`auto_resolved: true`) ويُرسل `alert.resolved`.
- الحل: تنبيهات المناطق لـOPS / CS_SUP / ADMIN / SUPER؛ تنبيهات الرحلة كما كانت.
- **غير منفّذ عمداً:** تنبيه التسوية المالية (Financial Reconciliation). لا توجد قاعدة تسوية معتمدة في النظام؛ إضافته بقاعدة مخترعة قد تعطي إنذارات مالية خاطئة.

## 5. الـReal-time

- `radar.updated` كل دقيقة لكل فرع (ملخص فقط: `unassigned_now`، `available_drivers`، `shortage_cells`). الداشبورد يعيد الجلب بشكل مخفف (throttled).
- `alert.created` / `alert.claimed` / `alert.resolved`.
- **عزل الفروع على Socket.IO:** أي حدث يُعكس للموظفين يذهب لغرفة الفرع (`branch:{id}`) من `branch_id` في الحدث أو من فرع الرحلة. إذا لا يمكن تحديد الفرع يذهب للموظفين العامين فقط (`staff:global`). لم يعد هناك بث لكل الموظفين.

## 6. المرونة عند انقطاع الاتصال

Backend:
- الموقع: `recorded_at` المستقبلي يُقصّ إلى الآن (`clock_adjusted: true`). الموقع الأقدم من الموجود لا يستبدل الموقع الحي (`applied: false`) لكنه يُحفظ في المسار. الدفعة تعيد `live_applied`.
- `Idempotency-Key` موجود مسبقاً على العمليات الحرجة؛ أُضيف `GET /operations/:key` لمعرفة النتيجة بعد انقطاع.

الداشبورد:
- حالة الاتصال في الرأس: متصل / إعادة الاتصال / غير متصل.
- Socket: backoff 1–20 ث مع jitter، التوكن يُقرأ عند كل محاولة، وعند `UNAUTHORIZED` يُجدَّد التوكن (حتى مرتين) ثم يعيد الاتصال.
- بعد العودة: إعادة جلب كل البيانات المعروضة.
- عند تسجيل الخروج: مسح كاش الاستعلامات.
- لا طابور offline للعمليات المالية أو الحرجة.

## 7. قاعدة البيانات والنشر

Migration: `Beroya-On-Backend/prisma/migrations/20261015120000_radar_command_center`

- غير مدمّرة: أعمدة جديدة nullable أو بقيم افتراضية، فهارس جديدة، قيم enum جديدة (`ALTER TYPE ... ADD VALUE`)، جدول `go_command_center_configs`.
- `go_operational_alerts.ride_id` أصبح nullable (تنبيهات المناطق ليست مرتبطة برحلة).
- `pickup_h3` للرحلات القديمة يُملأ تدريجياً في الخلفية (2000 كل دقيقة)، ويمكن إعادة تشغيله بأمان.

النشر:

```bash
cd Beroya-On-Backend
npx prisma migrate deploy
npx prisma generate
npm run build
```

ثم الداشبورد: `npm run build` في `frontend`. لا متغيرات بيئة جديدة.

## 8. حدود معروفة

- التوقع موسمي بسيط؛ مع بيانات قليلة سيعرض "بيانات غير كافية" لفترة.
- الخريطة تعرض حتى 2000 سائق/رحلة.
- محافظ الزبائن لا تُقسم حسب الفرع.
- تنبيه التسوية المالية غير منفّذ (انظر §4).
