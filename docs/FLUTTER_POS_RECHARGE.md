# تذكرة Flutter — شحن محفظة السائق من المتاجر (POS)

موجّهة لمطوّر تطبيق السائق.
الـBackend جاهز ومختبر في `Beroya_on`. **لم يُنفَّذ أي شيء في تطبيق Flutter بعد.** ادمج داخل مشروعكم الحالي وبنفس الـarchitecture.

مرجع النظام الكامل: `STORES_POS.md`.

---

## القواعد

1. الشحن يتم في المتجر فقط (الكاشير). التطبيق **لا ينفّذ** أي شحن ولا يرسل أي مبلغ.
2. الرصيد المعروض يأتي دائماً من `GET /api/v1/go/driver/wallet`. لا تحسب الرصيد محلياً من الإشعار.
3. لا رسوم ولا عمولة: المبلغ المشحون = المبلغ المضاف للمحفظة.
4. لا تخزّن بيانات مالية في `SharedPreferences`.

---

## 1. الإشعار عند الشحن

### Push

| الحدث | العنوان | النص |
|---|---|---|
| `wallet.pos_recharge` | تم شحن محفظتك | تم شحن محفظتك بمبلغ {amount} ل.س من {store_name} |
| `wallet.pos_recharge_reversed` | إلغاء شحن | أُلغي شحن بمبلغ {amount} ل.س (المرجع {reference}) |

النصوص تأتي جاهزة من الخادم حسب لغة المستخدم.

### Socket (namespace السائق)

بالترتيب:

1. `wallet.updated` — نفس جسم `GET /driver/wallet` (و`wallet.low_balance` إن انطبق).
2. `wallet.pos_recharge`:

```json
{ "reference": "PR-WFTWEHCCWQ", "amount": 25000, "currency": "SYP", "store_name": "سوبرماركت الشام" }
```

3. أو `wallet.pos_recharge_reversed`:

```json
{ "reference": "RV-…", "original_reference": "PR-…", "amount": 25000, "currency": "SYP" }
```

عند استلام أي منها: حدّث شاشة المحفظة من `wallet.updated` أو أعد طلب `GET /driver/wallet`، واعرض Snackbar.

قد يصل الإشعار متأخراً أو لا يصل؛ الشحن ناجح بغض النظر. لا تعتمد عليه كمصدر للرصيد.

---

## 2. سجل الشحن من المتاجر

`GET /api/v1/go/driver/wallet/pos-recharges?page=1&limit=20` (دور `DRIVER`)

```json
{
  "data": [
    {
      "reference": "PR-WFTWEHCCWQ",
      "type": "POS_RECHARGE",
      "amount": "25000.00",
      "currency": "SYP",
      "store_name": "سوبرماركت الشام",
      "store_code": "ST-9MYM28",
      "status": "COMPLETED",
      "reversed_at": null,
      "created_at": "2026-10-15T12:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

- `amount` نص عشري؛ حوّله بـ`Decimal` أو اعرضه كما هو منسّقاً. لا تستخدم `double` لحسابات مالية.
- `status`: `COMPLETED` أو `REVERSED` (اعرض `reversed_at` وشارة "ملغاة").
- الترتيب من الأحدث للأقدم. استخدم pagination عادي (infinite scroll).

### الشاشة

- مدخل من شاشة المحفظة: "الشحن من المتاجر".
- كل صف: المبلغ، اسم المتجر، التاريخ والوقت المحلي، المرجع (قابل للنسخ)، الحالة.
- حالة فارغة: "لا يوجد شحن من متاجر بعد".

---

## 3. التسمية

نوع الحركة `POS_RECHARGE` يُعرض: **"شحن من متجر"** / **"Store recharge"**.

---

## 4. "أين أشحن؟" (اختياري)

لا يوجد endpoint عام لقائمة المتاجر في هذه المرحلة. لا تعرض قائمة مخترعة؛ يمكن عرض نص ثابت: "اشحن من أي متجر معتمد من Beroya بإعطاء رقم جوالك المسجل".

---

## 5. الاختبار اليدوي

1. سجّل دخول السائق التجريبي `+963922222222`.
2. من لوحة التحكم (`/erp/pos` بحساب كاشير) اشحن 25000.
3. تحقق: Push + تحديث الرصيد فوراً + ظهور الصف في السجل.
4. اعكس الشحنة من `/admin/stores/[storeId]` (مدير): Push الإلغاء + الحالة `REVERSED`.
