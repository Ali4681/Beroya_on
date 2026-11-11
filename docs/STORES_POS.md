# المتاجر (POS) وأرصدة المتاجر وشحن محفظة السائق

مرجع تقني لنظام شحن محافظ السائقين عبر المتاجر المعتمدة.

## القاعدة الأساسية

عندما ينجح متجر في شحن محفظة سائق، يُخصم **نفس المبلغ بالضبط** من رصيد المتجر ويُضاف إلى محفظة السائق، داخل معاملة قاعدة بيانات واحدة.

- لا رسوم ولا عمولة ولا أرباح للمتجر (`fees = 0`, `commission = 0` في الإيصال).
- لا تحويل عملات: عملة المتجر يجب أن تطابق عملة المحفظة، وإلا `CURRENCY_MISMATCH`.
- لا محفظة ثانية: الشحن يمر عبر `GoDriverWallet` الموجودة وسجل `GoWalletTransaction` الموجود بنوع جديد `POS_RECHARGE`.
- رصيد المتجر الافتتاحي دائماً 0، ولا يتغير إلا عبر حركات السجل.

## نموذج البيانات (migration `20261015150000_stores_pos`)

| الجدول | الغرض |
|---|---|
| `go_stores` | المتجر: `code` فريد (`ST-XXXXXX`)، الفرع، العملة، `balance`، الحالة `ACTIVE/SUSPENDED`، حد أعلى اختياري للشحنة. |
| `go_store_ledger_entries` | سجل غير قابل للتعديل: `type`، `direction`، `amount`، `balance_before`، `balance_after`، `reference`، المنفّذ، السائق، `wallet_transaction_id`، `idempotency_key` + `request_hash`. |
| `users.store_id` | ربط مستخدم بدور `STORE_OPERATOR` بمتجر واحد. |

أنواع السجل: `ADMIN_CREDIT` (SC-)، `DRIVER_RECHARGE_DEBIT` (PR-)، `REVERSAL_CREDIT` (RV-)، `ADMIN_ADJUSTMENT` (SA-).

حمايات على مستوى قاعدة البيانات:

- `CHECK`: `amount > 0`، `balance >= 0`، `balance_after = balance_before ± amount` حسب الاتجاه.
- Trigger `go_store_ledger_immutable`: يمنع `UPDATE` و`DELETE` على السجل.
- Trigger `go_stores_no_delete`: يمنع حذف المتاجر (التعليق بدل الحذف).
- `UNIQUE (store_id, idempotency_key)`، و`UNIQUE` على `wallet_transaction_id`، وعكس واحد فقط لكل شحنة.

## الصلاحيات

| الدور | المسموح |
|---|---|
| `SUPER_ADMIN`, `ADMIN` | كل شيء في `admin/stores`: إنشاء، تعديل، تعليق/تفعيل، إضافة رصيد، تسوية، عكس شحنة، المشغّلون، المطابقة. |
| `FINANCE` | القراءة + إضافة رصيد (`balance-credits`). |
| `STORE_OPERATOR` | `pos/*` فقط، ومتجره يُحدَّد من الخادم عبر `users.store_id`. لا يقبل أي `store_id` أو `balance` من العميل (يُرفض الطلب بـ 400). |
| `DRIVER` | `driver/wallet/pos-recharges` لسجله فقط. |

لا يوجد نظام صلاحيات موازٍ: نفس `RolesGuard` ونفس تسجيل دخول الموظفين `/auth/staff/login`.

## الواجهات (`/api/v1/go`)

لوحة الإدارة:

- `GET admin/stores/overview`، `GET admin/stores`، `POST admin/stores`
- `GET|PATCH admin/stores/:storeId`، `PATCH admin/stores/:storeId/status`
- `POST admin/stores/:storeId/balance-credits` (يتطلب `Idempotency-Key`)
- `POST admin/stores/:storeId/balance-adjustments` (سبب إلزامي)
- `GET admin/stores/:storeId/ledger|statistics|audit|operators`
- `POST admin/stores/:storeId/operators`، `PATCH admin/stores/:storeId/operators/:userId`
- `POST admin/stores/ledger/:entryId/reverse`
- `GET admin/stores/reconciliation`

نقطة البيع:

- `GET pos/me` — المتجر والرصيد وإحصاءات اليوم.
- `POST pos/drivers/lookup` — بحث برقم الجوال؛ الرقم مُقنّع (`0922***222`)؛ حد 20 بحث/دقيقة لكل مشغّل.
- `POST pos/recharges` — يتطلب `Idempotency-Key`.
- `GET pos/transactions`، `GET pos/transactions/:reference` (الإيصال).

السائق: `GET driver/wallet/pos-recharges`.

## مسار الشحن

1. التحقق من الجوال والمبلغ (أرقام عربية مقبولة، لا صفر ولا سالب، خانتان عشريتان كحد أقصى).
2. داخل معاملة واحدة:
   - قفل Redis `wallet:<driverId>` + `SELECT … FOR UPDATE` على صف المتجر؛
   - فحص حالة المتجر، أهلية السائق، تطابق العملة، الحد الأعلى، الحد الأدنى للشحنة الأولى، كفاية الرصيد؛
   - إضافة للمحفظة (`POS_RECHARGE`) مع تسوية أي مستحقات قائمة بنفس منطق المحفظة الحالي؛
   - خصم المتجر + صف سجل يحمل `wallet_transaction_id`؛
   - صف تدقيق.
3. بعد الـcommit فقط: إشعار السائق (push + socket). فشل الإشعار يُسجَّل ولا يعيد العملية.

أي فشل داخل المعاملة يُلغي كل شيء.

## منع التكرار

- `IdempotencyInterceptor` العام: نفس المفتاح ونفس الجسم يعيد الاستجابة المخزنة؛ جسم مختلف يعطي `IDEMPOTENCY_KEY_REUSED`.
- على مستوى المتجر: `UNIQUE (store_id, idempotency_key)` + `request_hash`. نفس المفتاح من مشغّلَين لنفس المتجر يعيد نفس الإيصال (`replayed: true`) ولا يخصم مرتين.
- الواجهة تولّد المفتاح عند الدخول لشاشة التأكيد، وتعيد استخدامه عند "إعادة المحاولة" بعد خطأ شبكة.

## العكس

مسموح للمديرين فقط وبشروط آمنة:

- يُرفض إذا صرف السائق المبلغ أو كان محجوزاً (`WALLET_INSUFFICIENT_BALANCE`).
- يعيد أي مستحقات سُوّيت بالشحنة.
- عكس واحد فقط لكل شحنة.
- `POST erp/wallet-transactions/:transactionId/reverse` العام يرفض `POS_RECHARGE` (`USE_STORE_REVERSAL`) حتى لا يختل رصيد المتجر.

## المطابقة

`GET admin/stores/reconciliation` يفحص 7 قواعد، منها:

- رصيد كل متجر = آخر `balance_after`؛
- سلسلة before/after متصلة؛
- كل `DRIVER_RECHARGE_DEBIT` له حركة محفظة مطابقة بالمبلغ والسائق؛
- كل `POS_RECHARGE` في المحافظ له صف سجل.

ملاحظة: إذا تطابق `created_at` لصفين في نفس الميلي ثانية، فقد يظهر تحذير سلسلة كاذب نادر، لأن الترتيب الثانوي على `id`.

## الواجهة الأمامية

- `/admin/stores`، `/admin/stores/[storeId]`، `/admin/stores/reconciliation`
- `/erp/pos`، `/erp/pos/transactions`، `/erp/pos/transactions/[reference]` (إيصال قابل للطباعة 80mm)

## الاختبارات

- وحدة: `src/modules/go/stores/store-money.spec.ts`.
- e2e: `test/stores-pos.e2e-spec.ts` (الحالات 1–33 + العكس + الـtriggers + المطابقة) على قاعدة `beroya_go_test`.
