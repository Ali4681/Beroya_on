# -*- coding: utf-8 -*-
"""Generate plain-language Arabic PDF: cancellation & compensation for non-technical readers."""
from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from fpdf import FPDF

OUT = Path(__file__).with_name("CANCELLATION_COMPENSATION_POLICY_SIMPLE.pdf")
FONT = "ArabicUI"


def ar(text: str) -> str:
    return get_display(arabic_reshaper.reshape(text))


class SimplePDF(FPDF):
    def header(self) -> None:
        self.set_font(FONT, "B", 10)
        self.set_text_color(90, 90, 90)
        self.set_x(self.l_margin)
        self.cell(self.epw, 8, ar("برويا — دليل مبسّط للإلغاء والتعويض"), align="R", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(210, 210, 210)
        self.line(self.l_margin, self.get_y(), self.l_margin + self.epw, self.get_y())
        self.ln(5)

    def footer(self) -> None:
        self.set_y(-15)
        self.set_font(FONT, "", 8)
        self.set_text_color(130, 130, 130)
        self.cell(0, 10, f"{self.page_no()}/{{nb}}", align="C")

    def h1(self, text: str) -> None:
        self.set_x(self.l_margin)
        self.set_font(FONT, "B", 18)
        self.set_text_color(20, 20, 20)
        self.multi_cell(self.epw, 10, ar(text), align="R")
        self.ln(2)

    def h2(self, text: str) -> None:
        self.ln(4)
        self.set_x(self.l_margin)
        self.set_font(FONT, "B", 13)
        self.set_text_color(30, 70, 120)
        self.multi_cell(self.epw, 8, ar(text), align="R")
        self.ln(1)

    def p(self, text: str) -> None:
        self.set_x(self.l_margin)
        self.set_font(FONT, "", 11)
        self.set_text_color(35, 35, 35)
        self.multi_cell(self.epw, 7, ar(text), align="R")
        self.ln(1.5)

    def bullet(self, text: str) -> None:
        self.set_x(self.l_margin)
        self.set_font(FONT, "", 11)
        self.set_text_color(35, 35, 35)
        self.multi_cell(self.epw, 7, ar(f"- {text}"), align="R")
        self.ln(0.5)

    def box(self, text: str) -> None:
        self.set_x(self.l_margin)
        self.set_fill_color(245, 248, 252)
        self.set_font(FONT, "", 10)
        self.set_text_color(40, 40, 40)
        self.multi_cell(self.epw, 6.5, ar(text), align="R", fill=True)
        self.ln(2)

    def table(self, headers: list[str], rows: list[list[str]], widths: list[float]) -> None:
        line_h = 6

        def draw(cells: list[str], header: bool = False) -> None:
            if self.get_y() > 260:
                self.add_page()
            rendered = [ar(c) for c in cells]
            max_lines = 1
            for i, cell in enumerate(rendered):
                lines = self.multi_cell(widths[i], line_h, cell, dry_run=True, output="LINES")
                max_lines = max(max_lines, len(lines))
            row_h = max(max_lines * line_h + 2, 9)
            y0 = self.get_y()
            x0 = self.l_margin
            if header:
                self.set_font(FONT, "B", 10)
                self.set_fill_color(30, 70, 120)
                self.set_text_color(255, 255, 255)
            else:
                self.set_font(FONT, "", 9)
                self.set_fill_color(250, 250, 250)
                self.set_text_color(30, 30, 30)
            for i, cell in enumerate(rendered):
                x = x0 + sum(widths[:i])
                self.set_xy(x, y0)
                self.rect(x, y0, widths[i], row_h)
                if header:
                    self.set_xy(x, y0)
                    self.cell(widths[i], row_h, "", fill=True)
                self.set_xy(x, y0 + 1.5)
                self.multi_cell(widths[i], line_h, cell, align="C")
            self.set_y(y0 + row_h)

        draw(headers, header=True)
        for row in rows:
            draw(row)
        self.ln(3)


def main() -> None:
    pdf = SimplePDF()
    pdf.alias_nb_pages()
    windir = Path(r"C:\Windows\Fonts")
    pdf.add_font(FONT, "", str(windir / "tahoma.ttf"))
    pdf.add_font(FONT, "B", str(windir / "tahomabd.ttf"))
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    pdf.h1("سياسة إلغاء الرحلة والتعويض")
    pdf.p("شرح مبسّط لغير المختصين بالبرمجة — كيف يعمل الإلغاء والتعويض في برويا الآن.")
    pdf.box(
        "هذه النسخة محدّثة بعد تفعيل القواعد الجديدة: "
        "إلغاء العميل بعد تحرك السائق بنقاط أعلى، إلغاء السائق بنقاط وخصم محفظة، "
        "إلغاء من المكتب، وخصم محفظة السائق عند تحمّله تكلفة التعويض."
    )

    pdf.h2("الفكرة باختصار")
    pdf.p(
        "عندما يطلب شخص سيارة، تمرّ الرحلة بمراحل واضحة: "
        "بحث عن سائق، ثم قبول السائق، ثم السائق في الطريق، ثم الوصول لنقطة الالتقاط، "
        "ثم بداية الرحلة، ثم انتهاؤها."
    )
    pdf.p("الإلغاء والتعويض يجيبان عن سؤالين: من يقدر يوقف الرحلة؟ ومتى؟ وماذا يحدث للطرف الآخر؟")

    pdf.h2("١) إلغاء العميل (الراكب)")
    pdf.p("متى يقدر العميل يلغي؟")
    pdf.bullet("أثناء البحث عن سائق: نعم، وبلا رسوم وبلا نقاط.")
    pdf.bullet("بعد قبول السائق مباشرة: نعم. خلال دقيقتين (أو دقيقة إذا كانت الرحلة مجدولة) يكون الإلغاء بلا عقوبة.")
    pdf.bullet("بعد هذه الدقائق وقبل أن يتحرك السائق: يقدر يلغي، مع نقص نقاط في «الباسبورت». لا يُخصم منه مبلغ نقدي.")
    pdf.bullet("بعد أن يتحرك السائق أو يصل لنقطة الالتقاط: يقدر يلغي، مع خصم نقاط أعلى. بلا رسوم نقدية.")
    pdf.bullet("بعد بدء الرحلة: لا يستطيع الإلغاء من التطبيق.")

    pdf.p("ماذا يحدث عملياً عند الإلغاء؟")
    pdf.bullet("الرحلة تُغلق.")
    pdf.bullet("السائق يتحرر ويصبح متاحاً لطلبات أخرى.")
    pdf.bullet("لا فاتورة إلغاء على العميل — العقوبة نقاط فقط.")

    pdf.h2("٢) السائق")
    pdf.p("السائق يمكنه إلغاء الرحلة بعد القبول أو وهو في الطريق (قبل الوصول).")
    pdf.bullet("عند إلغاء السائق: تُخصم نقاط من باسبورت السائق، ويُخصم مبلغ من محفظته. العميل لا يُعاقب بالنقاط.")
    pdf.bullet("رفض العرض قبل القبول: يمرّ الطلب لسائق آخر (هذا ليس إلغاء رحلة).")
    pdf.bullet(
        "تسجيل أن العميل لم يحضر: بعد الوصول وانتظار ١٠ دقائق. "
        "تُغلق الرحلة كـ«عدم حضور» وتنقص نقاط من العميل فقط (بدون رسوم نقدية على العميل)."
    )

    pdf.h2("٣) الإلغاء من المكتب (الموظفون)")
    pdf.bullet("مشرف خدمة العملاء أو الأدمن يمكنه إلغاء رحلة نشطة من نظام المكتب مع كتابة سبب.")
    pdf.bullet("يمكن اختيارياً: خصم نقاط من العميل، و/أو خصم نقاط من السائق، و/أو خصم من محفظة السائق.")
    pdf.bullet("الافتراضي: بدون عقوبة على العميل؛ عقوبة السائق فقط إذا اختارها الموظف.")

    pdf.h2("٤) التعويض (شيء مختلف عن الإلغاء)")
    pdf.p(
        "التعويض ليس زر إلغاء. يُستخدم عندما تكون هناك مشكلة في الخدمة، "
        "مثل تأخير كبير، سوء معاملة، أو خطأ واضح في المسار."
    )
    pdf.p("كيف يعمل داخل الشركة:")
    pdf.bullet("مشرف خدمة العملاء يقرر خصم مبلغ أو نسبة من أجرة العميل كتسوية/تعويض.")
    pdf.bullet("قسم المالية يحدد من يتحمل التكلفة داخلياً: الشركة، أو السائق، أو الاثنان بنسبة معيّنة.")
    pdf.bullet("إذا اختيرت الشركة: لا يخصم من محفظة السائق.")
    pdf.bullet("إذا اختير السائق أو التقسيم: يُخصم نصيب السائق من محفظته فوراً.")
    pdf.p(
        "إذا وُجد على الرحلة خصم ترويجي وتعويض معاً، يبقى المبلغ المستحق معلّقاً "
        "حتى يقرر المشرف: نطبّق الخصم فقط، أو التعويض فقط، أو الاثنين معاً."
    )

    pdf.add_page()
    pdf.h2("٥) أمثلة من الحياة اليومية")
    pdf.table(
        ["النتيجة اليوم", "الموقف"],
        [
            ["مجاني، بلا نقاط", "العميل ألغى وهو ما زال يبحث عن سائق"],
            ["مجاني، بلا نقاط", "العميل ألغى بعد القبول بـ ٣٠ ثانية"],
            ["إلغاء مسموح + نقص نقاط", "العميل ألغى بعد القبول بـ ٥ دقائق والسائق لم يتحرك"],
            ["إلغاء مسموح + نقاط أعلى", "العميل ألغى والسائق في الطريق أو وصل"],
            ["غير مسموح من التطبيق", "العميل يريد الإلغاء بعد بدء الرحلة"],
            ["نقاط + خصم محفظة على السائق؛ العميل بلا عقوبة", "السائق ألغى بعد القبول"],
            ["عدم حضور + نقص نقاط للعميل", "السائق وصل وانتظر ١٠ دقائق والعميل لم يظهر"],
            ["إلغاء مع سبب وعقوبات اختيارية", "موظف المكتب ألغى الرحلة"],
            ["تعويض للعميل؛ إن تحمّل السائق يخصم من محفظته", "العميل اشتكى بعد رحلة سيئة"],
        ],
        [85, 105],
    )

    pdf.h2("٦) قواعد سريعة للتذكير")
    pdf.bullet("العميل: نقاط فقط — لا رسوم نقدية عند الإلغاء أو عدم الحضور.")
    pdf.bullet("السائق عند خطئه (إلغاء أو تحمّل تعويض): نقاط + خصم من المحفظة.")
    pdf.bullet("بعد بدء الرحلة: الإلغاء من التطبيق مغلق؛ يبقى الإلغاء الإداري من المكتب عند الحاجة.")
    pdf.bullet("التعويض قرار داخلي لجودة الخدمة، وليس بديلاً عن زر الإلغاء.")

    pdf.h2("الخلاصة")
    pdf.box(
        "العميل يلغي بسهولة مبكراً، وبعد تحرك السائق يلغي أيضاً لكن بنقاط أعلى. "
        "السائق إن ألغى يتحمّل نقاطاً وخصماً من محفظته، والعميل لا يُعاقب. "
        "المكتب يمكنه الإلغاء عند الحاجة. التعويض يقلل مستحق العميل، "
        "وإذا تحمّله السائق يُخصم من محفظته مباشرة."
    )
    pdf.p("هذه النسخة موجّهة للإدارة والتشغيل والشركاء. توجد نسخة تقنية مفصّلة للمطورين في ملف PDF منفصل.")

    pdf.output(str(OUT))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
