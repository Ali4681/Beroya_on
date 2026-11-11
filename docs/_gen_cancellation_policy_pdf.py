# -*- coding: utf-8 -*-
"""Generate Arabic PDF: ride cancellation & compensation policy."""
from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from fpdf import FPDF

OUT = Path(__file__).with_name("CANCELLATION_COMPENSATION_POLICY.pdf")


def ar(text: str) -> str:
    return get_display(arabic_reshaper.reshape(text))


class PolicyPDF(FPDF):
    def header(self) -> None:
        self.set_font("DejaVu", "B", 10)
        self.set_text_color(80, 80, 80)
        self.cell(0, 8, ar("Beroya — سياسة الإلغاء والتعويض"), align="R", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(200, 200, 200)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(4)

    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("DejaVu", "", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"{self.page_no()}/{{nb}}", align="C")

    def h1(self, text: str) -> None:
        self.set_x(self.l_margin)
        self.set_font("DejaVu", "B", 18)
        self.set_text_color(20, 20, 20)
        self.multi_cell(self.epw, 10, ar(text), align="R")
        self.ln(2)

    def h2(self, text: str) -> None:
        self.ln(3)
        self.set_x(self.l_margin)
        self.set_font("DejaVu", "B", 13)
        self.set_text_color(30, 60, 110)
        self.multi_cell(self.epw, 8, ar(text), align="R")
        self.ln(1)

    def h3(self, text: str) -> None:
        self.ln(1)
        self.set_x(self.l_margin)
        self.set_font("DejaVu", "B", 11)
        self.set_text_color(40, 40, 40)
        self.multi_cell(self.epw, 7, ar(text), align="R")

    def _block(self, text: str, size: int = 10, fill: bool = False) -> None:
        self.set_x(self.l_margin)
        self.set_font("DejaVu", "", size)
        self.set_text_color(30, 30, 30)
        kwargs = {"align": "R"}
        if fill:
            self.set_fill_color(245, 248, 252)
            kwargs["fill"] = True
        self.multi_cell(self.epw, 6.5, ar(text), **kwargs)
        self.ln(1)

    def p(self, text: str) -> None:
        self._block(text)

    def bullet(self, text: str) -> None:
        # Put marker on the right visually after bidi by appending it in logical Arabic order
        self._block(f"- {text}")

    def note(self, text: str) -> None:
        self._block(text, size=9, fill=True)

    def table(self, headers: list[str], rows: list[list[str]], col_widths: list[float] | None = None) -> None:
        n = len(headers)
        if col_widths is None:
            col_widths = [self.epw / n] * n
        line_h = 5.5

        def draw_row(cells: list[str], header: bool = False) -> None:
            if self.get_y() > 265:
                self.add_page()
            max_lines = 1
            rendered = [ar(c) for c in cells]
            for i, cell in enumerate(rendered):
                lines = self.multi_cell(col_widths[i], line_h, cell, dry_run=True, output="LINES")
                max_lines = max(max_lines, len(lines))
            row_h = max(max_lines * line_h + 2, 8)
            y0 = self.get_y()
            x0 = self.l_margin
            if header:
                self.set_font("DejaVu", "B", 9)
                self.set_fill_color(30, 60, 110)
                self.set_text_color(255, 255, 255)
            else:
                self.set_font("DejaVu", "", 8)
                self.set_fill_color(248, 248, 248)
                self.set_text_color(30, 30, 30)
            for i, cell in enumerate(rendered):
                self.set_xy(x0 + sum(col_widths[:i]), y0)
                self.rect(x0 + sum(col_widths[:i]), y0, col_widths[i], row_h)
                self.set_xy(x0 + sum(col_widths[:i]), y0 + 1)
                self.multi_cell(col_widths[i], line_h, cell, align="C", fill=header)
            self.set_y(y0 + row_h)

        draw_row(headers, header=True)
        for row in rows:
            draw_row(row, header=False)
        self.ln(2)


def main() -> None:
    pdf = PolicyPDF()
    pdf.alias_nb_pages()
    windir = Path(r"C:\Windows\Fonts")
    # Tahoma covers Arabic on Windows
    pdf.add_font("DejaVu", "", str(windir / "tahoma.ttf"))
    pdf.add_font("DejaVu", "B", str(windir / "tahomabd.ttf"))

    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    pdf.h1("سياسة إلغاء الرحلة والتعويض")
    pdf.p("وثيقة مرجعية لمنتج Beroya — تلخّص ما هو مطبّق في النظام اليوم، وما يُقترح إضافته لاحقاً.")
    pdf.note("المصادر التقنية: ride-rules.ts · ride-state-machine.ts · rides.service.ts · compensation · fare-stack · README للـ Backend")

    # --- Section 1 ---
    pdf.h2("١) ملخص سريع")
    pdf.bullet("إلغاء العميل مفعّل بحالات محددة ونافذة مجانية وعقوبة باسبورت عند التأخير.")
    pdf.bullet("السائق لا يلغي الرحلة حالياً؛ يمكنه رفض عرض أو تسجيل عدم حضور العميل (NO_SHOW).")
    pdf.bullet("التعويض (Compensation) مسار موظفين منفصل يقلّل مستحق العميل ويحدد من يتحمل التكلفة.")
    pdf.bullet("محدّث: إلغاء سائق + إلغاء موظف + إلغاء عميل بعد التحرك بنقاط أعلى + خصم محفظة عند bearer/إلغاء سائق.")

    # --- Section 2 ---
    pdf.h2("٢) دورة حياة الرحلة (الحالات)")
    pdf.table(
        ["معناه", "الحالة"],
        [
            ["بحث عن سائق", "SEARCHING"],
            ["تم إسناد سائق", "DRIVER_ASSIGNED"],
            ["السائق في الطريق", "DRIVER_EN_ROUTE"],
            ["وصل نقطة الالتقاط", "ARRIVED"],
            ["الرحلة جارية", "IN_PROGRESS"],
            ["اكتملت", "COMPLETED"],
            ["ألغاها العميل", "CANCELLED_BY_CUSTOMER"],
            ["لم يحضر العميل", "NO_SHOW"],
            ["انقطعت / استُبدلت / فشل البحث", "INTERRUPTED / REPLACED / FAILED_NO_DRIVER"],
        ],
        [95, 95],
    )

    # --- Section 3 ---
    pdf.h2("٣) سياسة إلغاء العميل (مطبّقة)")
    pdf.h3("متى يُسمح؟")
    pdf.bullet("مسموح في: SEARCHING أو DRIVER_ASSIGNED أو DRIVER_EN_ROUTE أو ARRIVED.")
    pdf.bullet("ممنوع بعد IN_PROGRESS.")
    pdf.bullet("بعد EN_ROUTE/ARRIVED: نقاط EN_ROUTE_CANCELLATION (−25).")
    pdf.bullet("الـ API: POST /customer/rides/:rideId/cancel (idempotent).")

    pdf.h3("النافذة المجانية بعد الإسناد")
    pdf.table(
        ["العقوبة بعد النافذة", "النافذة المجانية", "نوع الرحلة"],
        [
            ["late_cancel + LATE_CANCELLATION (−10 باسبورت)", "دقيقتان من assigned_at", "فورية (IMMEDIATE)"],
            ["نفس العقوبة", "دقيقة واحدة من assigned_at", "مجدولة (SCHEDULED)"],
            ["بدون عقوبة إلغاء متأخر", "لا ينطبق (لا إسناد بعد)", "أثناء SEARCHING"],
        ],
        [70, 60, 60],
    )

    pdf.h3("ماذا يحدث عند الإلغاء؟")
    pdf.bullet("تغيير الحالة إلى CANCELLED_BY_CUSTOMER وتسجيل cancelled_at.")
    pdf.bullet("تحرير عمولة المحفظة المحجوزة (releaseHold).")
    pdf.bullet("تحرير حجز كود الخصم (releaseForRide).")
    pdf.bullet("تحرير السائق وإعادته ONLINE.")
    pdf.bullet("إشعار realtime: ride.cancelled للعميل و ride.customer_cancelled للسائق.")
    pdf.bullet("لا رسوم مالية ولا استرداد — عقوبة النقاط مخفية عن العميل (Ticket §23.9).")

    pdf.note("نص الواجهة في المكتب: «يمكن للعميل إلغاء الرحلة ما دامت قيد البحث أو بمجرد الإسناد.» وبعد التحرك: «لم يعد بإمكان العميل إلغاء الرحلة بعد تحرك السائق.»")

    # --- Section 4 ---
    pdf.h2("٤) السائق: رفض العرض وعدم الحضور")
    pdf.h3("رفض العرض (ليس إلغاء رحلة)")
    pdf.bullet("السائق يرفض offer عبر مسار العروض — الرحلة تبقى تبحث عن سائق آخر.")

    pdf.h3("عدم حضور العميل (NO_SHOW) — مطبّق")
    pdf.bullet("الـ API: POST /driver/rides/:rideId/no-show")
    pdf.bullet("شرط الحالة: ARRIVED فقط مع وجود arrived_at.")
    pdf.bullet("شرط الوقت: مرور 10 دقائق من الوصول (NO_SHOW_AFTER_ARRIVED_SEC = 600).")
    pdf.bullet("قبل اكتمال الانتظار يُرفض الطلب مع retry_after_sec.")
    pdf.bullet("النتيجة: حالة NO_SHOW، تحرير الخصم والحجز، عقوبة باسبورت NO_SHOW (−15)، إشعار ride.no_show.")
    pdf.bullet("لا أجرة ولا entitlement ولا compensation تلقائي للسائق عند no-show.")

    pdf.h3("إلغاء السائق والموظف")
    pdf.bullet("CANCELLED_BY_DRIVER: POST /driver/rides/:rideId/cancel — نقاط سائق + خصم محفظة.")
    pdf.bullet("CANCELLED_BY_STAFF: POST /erp/rides/:rideId/cancel — عقوبات اختيارية.")

    # --- Section 5 ---
    pdf.add_page()
    pdf.h2("٥) التعويض (Compensation) — مطبّق")
    pdf.p("التعويض ليس غرامة إلغاء؛ هو تخفيض goodwill على مستحق العميل (غالباً بعد رحلة مكتملة) يقرره الموظفون.")

    pdf.h3("التطبيق (مشرف خدمة العملاء)")
    pdf.bullet("من تفاصيل الرحلة: POST /erp/rides/:rideId/compensation")
    pdf.bullet("النوع: PERCENTAGE من الأجرة، أو FIXED_AMOUNT بمبلغ ثابت.")
    pdf.bullet("يُحسب applied_amount ويحدّث compensation_total و customer_payable.")

    pdf.h3("توزيع التكلفة — من يتحمل؟ (المالية / الأدمن)")
    pdf.bullet("POST /erp/finance/compensations/:id/allocation")
    pdf.table(
        ["المعنى", "bearer"],
        [
            ["لم يُحدَّد بعد", "UNASSIGNED"],
            ["تتحمل المنصة", "BEROYA"],
            ["يتحمل السائق", "DRIVER"],
            ["توزيع بين المنصة والسائق (مجموع الحصص = المبلغ)", "SPLIT"],
        ],
        [120, 70],
    )
    pdf.note("DRIVER أو SPLIT يرحّل خصماً إلى محفظة السائق (wallet_posted_at). BEROYA metadata فقط.")

    pdf.h3("قرار الخصم والتعويض معاً (Fare Stack — Ticket §44)")
    pdf.bullet("إذا وُجد خصم وتعويض معاً: fare_stack_decision = PENDING والمستحق يبقى الأجرة الإجمالية.")
    pdf.bullet("المشرف/الأدمن يثبّت عبر POST /erp/rides/:rideId/fare-stack:")
    pdf.table(
        ["الأثر", "القرار"],
        [
            ["يُطبَّق الخصم فقط؛ لا يُطرح التعويض", "DISCOUNT_ONLY"],
            ["يُطبَّق التعويض فقط؛ يُحرَّر كود الخصم", "COMPENSATION_ONLY"],
            ["يُطرح الخصم والتعويض معاً (لا يقل عن صفر)", "BOTH"],
        ],
        [120, 70],
    )

    # --- Section 6 ---
    pdf.h2("٦) الانتظار والدفع (مرتبط لكن ليس إلغاء)")
    pdf.bullet("انتظار مجاني عند الالتقاط قبل احتساب انتظار مدفوع: دقيقتان (FREE_WAITING_SEC) — يُستخدم عند إنهاء رحلة ناجحة.")
    pdf.bullet("حالات الدفع تُغلق عند COMPLETED فقط: CASH_EXPECTED / PENDING → COLLECTED أو WAIVED.")
    pdf.bullet("مستحقات السائق (entitlements) تُنشأ على الرحلات المكتملة، لا على الإلغاء أو no-show.")

    # --- Section 7 ---
    pdf.h2("٧) القيم الافتراضية في الكود (RideDefaults)")
    pdf.table(
        ["القيمة", "الثابت"],
        [
            ["120 ثانية (دقيقتان)", "IMMEDIATE_CANCEL_FREE_AFTER_ACCEPT_SEC"],
            ["60 ثانية (دقيقة)", "SCHEDULED_CANCEL_FREE_AFTER_ACCEPT_SEC"],
            ["10 نقاط (مخفية)", "LATE_CANCEL_HIDDEN_SCORE"],
            ["120 ثانية", "FREE_WAITING_SEC"],
            ["600 ثانية (10 دقائق)", "NO_SHOW_AFTER_ARRIVED_SEC"],
            ["15 نقطة (مخفية)", "NO_SHOW_HIDDEN_SCORE"],
        ],
        [70, 120],
    )

    # --- Section 8 ---
    pdf.h2("٨) فجوات مقترحة لإكمال السياسة")
    pdf.table(
        ["ملاحظات التنفيذ", "الفجوة"],
        [
            ["حالة جديدة + انتقالات + عقوبة سائق + إعادة بحث للعميل", "إلغاء السائق"],
            ["مبلغ/نسبة عند late cancel أو no-show؛ مستفيد السائق/المنصة", "رسوم إلغاء / عدم حضور"],
            ["كيان refund أو حركة محفظة (مهم مع الدفع غير النقدي)", "استرداد"],
            ["خصم فعلي من محفظة السائق أو قيد محاسبي", "ربط bearer بالمال"],
            ["إلغاء إداري مع سبب وتدقيق", "إلغاء من الـ Desk"],
            ["صفحة/نص سياسة في تطبيق العميل والسائق", "توثيق موجّه للمستخدم"],
        ],
        [110, 80],
    )

    # --- Section 9 ---
    pdf.h2("٩) اقتراح سياسة منتج جاهزة للتبنّي")
    pdf.h3("أ) إلغاء العميل")
    pdf.bullet("مجاني أثناء البحث + داخل النافذة بعد الإسناد.")
    pdf.bullet("خارج النافذة وقبل التحرك: إلغاء + نقاط (± رسوم اختيارية لاحقاً).")
    pdf.bullet("بعد DRIVER_EN_ROUTE: الإبقاء على المنع الحالي أو السماح برسوم أعلى.")

    pdf.h3("ب) عدم الحضور")
    pdf.bullet("الإبقاء على 10 دقائق بعد ARRIVED → NO_SHOW + نقاط.")
    pdf.bullet("لاحقاً: رسوم no-show لصالح السائق عند توفّر دفع إلكتروني.")

    pdf.h3("ج) إلغاء السائق (جديد)")
    pdf.bullet("مسموح في DRIVER_ASSIGNED / DRIVER_EN_ROUTE بأسباب محددة.")
    pdf.bullet("عقوبة باسبورت سائق + إعادة البحث للعميل بدون عقوبة على العميل.")
    pdf.bullet("إلغاء بعد الوصول بدون سبب مشروع → عقوبة أشد.")

    pdf.h3("د) التعويض التشغيلي (الإبقاء على الحالي)")
    pdf.bullet("لمشاكل الجودة (تأخير، مسار خاطئ، سوء معاملة…).")
    pdf.bullet("المشرف يطبّق → المالية توزّع التحمل عبر bearer.")

    # --- Section 10 ---
    pdf.h2("١٠) أين تُعدَّل القواعد في المشروع")
    pdf.table(
        ["الملف / المسار", "الموضوع"],
        [
            ["Beroya-On-Backend/.../rides/ride-rules.ts", "الأوقات والعقوبات الافتراضية"],
            [".../rides/ride-state-machine.ts", "من يقدر يلغي ومتى"],
            [".../rides/rides.service.ts", "cancelByCustomer / noShow"],
            [".../compensation/", "تطبيق التعويض وتوزيع التكلفة"],
            [".../rides/fare-stack.ts و fare-settlement", "قرار الخصم+التعويض"],
            ["frontend/.../ops-screens.tsx", "واجهة تفاصيل الرحلة"],
            ["frontend/.../finance-screens.tsx", "شاشة التعويضات"],
        ],
        [130, 60],
    )

    pdf.ln(4)
    pdf.h2("الخلاصة")
    pdf.p(
        "Beroya لديها اليوم سياسة إلغاء عميل صارمة، وتسجيل عدم حضور بعد الانتظار، "
        "ومسار تعويض موظفين مع قرار خصم/تعويض. لإكمال المنتج تجارياً يُنصح بإضافة إلغاء السائق، "
        "رسوم مالية للإلغاء/عدم الحضور، وربط «من يتحمل التكلفة» بحركة مالية حقيقية."
    )
    pdf.note("هذه الوثيقة وصفية للمرجع الداخلي. أي تغيير على الأرقام أو الحالات يجب أن يمر عبر تحديث RideDefaults وآلة الحالات والاختبارات.")

    pdf.output(str(OUT))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
