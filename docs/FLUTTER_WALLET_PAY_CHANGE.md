# تذكرة Flutter — دفع بالمحفظة + إرجاع الباقي للمحفظة

موجّهة لتطبيقي **الزبون** و**السائق**.
الـBackend جاهز في `Beroya_on`. ادمج داخل مشروعكم الحالي وبنفس الـarchitecture.

Base: `/api/v1/go`

---

## القواعد

1. لا تحسب الأجرة أو الباقي محلياً من تقديرات قديمة — اعتمد حقول الـAPI بعد الإنهاء.
2. المبالغ نص عشري أو رقم من الـJSON؛ للعرض نسّقها، وللحسابات المالية فضّل `Decimal` لا `double`.
3. كل طلبات `POST` الحساسة تتطلب هيدر **Idempotency-Key** (UUID جديد لكل محاولة منطقية).
4. لا تخزّن أرصدة المحفظة في `SharedPreferences` كمصدر حقيقة — حدّث من `GET …/wallet` أو `wallet.updated`.

---

## 1. الزبون — الدفع بالمحفظة عند إنشاء الرحلة

`POST /customer/rides` (أو مسار إنشاء الرحلة عندكم)

```json
{
  "payment_method": "WALLET",
  "...": "باقي حقول الإنشاء كما هي"
}
```

| الحالة | السلوك |
|---|---|
| رصيد كافٍ | يُحجز المبلغ (`wallet_paid_amount`)، `payment_status` يبدأ `PENDING` |
| رصيد غير كافٍ | `409` / `WALLET_INSUFFICIENT_BALANCE` مع `{ required, balance, currency }` — اعرض الرصيد واطلب شحن/كود أو التحويل لـ`CASH` |

عند الإلغاء / عدم وجود سائق / no-show: الباك يرجع الحجز تلقائياً (`RIDE_REFUND`). لا تستدعِ إرجاعاً يدوياً.

`GET /customer/wallet` + سوكِت `wallet.updated` لعرض الرصيد.

---

## 2. بعد إنهاء الرحلة — حقول الدفع في الفاتورة

`POST /driver/rides/:rideId/end` و`GET /driver/rides/:rideId/invoice` يعيدان `invoice` وفيه:

| حقل | المعنى |
|---|---|
| `customer_payable` | ما يجب أن يدفعه الزبون بعد الخصم/التعويض |
| `payment_method` | `CASH` \| `WALLET` |
| `wallet_paid_amount` | ما خُصم من محفظة الزبون |
| `cash_due` | الكاش المتبقي = `max(0, customer_payable − wallet_paid_amount)` |
| `change_returned_amount` | الباقي المُرجع لمحفظة الزبون (0 إن لم يُرجع) |
| `can_return_change` | `true` إن لم يُرجع الباقي بعد |

سوكِت الزبون `ride.completed` يتضمن أيضاً: `payment_method`, `payment_status`, `wallet_paid_amount`, `cash_due`.

### حالات العرض (سائق)

| شرط | واجهة مقترحة |
|---|---|
| `payment_method == WALLET` و`cash_due == 0` | «مدفوعة بالمحفظة» — لا كاش |
| `cash_due > 0` | «استلم كاش: {cash_due}» |
| `can_return_change == true` | حقل «المبلغ المستلم» + زر «إرجاع الباقي للمحفظة» |
| `change_returned_amount > 0` | «أُرجع باقي {change_returned_amount} للمحفظة» |

---

## 3. السائق — إرجاع الباقي لمحفظة الزبون

عندما الزبون يدفع كاش أكبر من `cash_due` (أو أدّى كامل الأجرة كاش بورقة أكبر):

`POST /driver/rides/:rideId/return-change`  
هيدر: `Idempotency-Key: <uuid>`

```json
{ "cash_received": 10000 }
```

الحساب في الباك:

```
cash_due = invoice.cash_due
change   = cash_received − cash_due   // يجب > 0
```

- يُضاف `change` لمحفظة الزبون.
- يُخصم نفس المبلغ من محفظة السائق (رصيد متاح).
- مرة واحدة لكل رحلة (إعادة الطلب → `CONFLICT`).

### رد نجاح (مثال)

```json
{
  "ride_id": "…",
  "cash_received": 10000,
  "cash_due": 7500,
  "change_returned_amount": 2500,
  "already": false,
  "payment_status": "COLLECTED"
}
```

### أخطاء مهمة

| كود | متى | ماذا تعرض |
|---|---|---|
| `VALIDATION_ERROR` | `cash_received ≤ cash_due` | المبلغ المستلم لا يُنتج باقياً |
| `DRIVER_WALLET_INSUFFICIENT` | رصيد السائق المتاح أقل من الباقي | «الرصيد لا يكفي لإرجاع الباقي — أعِد الباقي كاش» + `{ required, available }` |
| `CONFLICT` | الباقي مُرجع مسبقاً | اعرض `change_returned_amount` من التفاصيل |
| `INVALID_RIDE_TRANSITION` | الرحلة ليست `COMPLETED` | أخفِ الزر |

### سوكِت الزبون

`wallet.change_returned`:

```json
{ "ride_id": "…", "amount": 2500, "currency": "SYP" }
```

ثم حدّث المحفظة من `wallet.updated` أو `GET /customer/wallet`.

---

## 4. تدفق مقترح في تطبيق السائق

```
إنهاء الرحلة (end)
  → اعرض invoice.customer_payable / cash_due / payment_method
  → إن cash_due > 0: اجمع الكاش
  → إن can_return_change:
        أدخل cash_received
        إن cash_received > cash_due → POST return-change
        وإلا اكتفِ بالكاش (لا تستدعِ return-change)
```

لا تستدعِ `return-change` إذا لم يكن هناك باقي.

---

## 5. قبول

**زبون**

- [ ] إنشاء رحلة بـ`payment_method: WALLET` ينجح مع رصيد كافٍ ويفشل بوضوح بدونه
- [ ] بعد الرحلة يظهر أثر الخصم/الإرجاع في المحفظة
- [ ] عند إرجاع باقي من السائق يصل `wallet.change_returned` ويتحدث الرصيد

**سائق**

- [ ] الفاتورة تعرض `cash_due` و`can_return_change`
- [ ] `return-change` مع `cash_received` أكبر من `cash_due` يُرجع الباقي
- [ ] رصيد سائق غير كافٍ → رسالة واضحة بدون شطب الباقي من الكاش يدوياً في الواجهة بشكل مضلل
- [ ] إعادة نفس العملية على نفس الرحلة لا تُضاعف الإرجاع

---

## خارج النطاق

- شام كاش (`SHAM_CASH`) معطّل في V1.
- شحن محفظة السائق من المتجر → `FLUTTER_POS_RECHARGE.md`.
- تصميم UI التفصيلي.
