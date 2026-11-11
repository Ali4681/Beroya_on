# -*- coding: utf-8 -*-
"""Official Arabic test-access PDF for government app approval review."""
from pathlib import Path
import re

import arabic_reshaper
from bidi.algorithm import get_display
from fpdf import FPDF

OUT = Path(__file__).with_name("QA_TEST_ACCOUNTS_HANDOVER.pdf")
FONT = "ArabicUI"

NAVY = (18, 52, 71)
TEAL = (26, 107, 122)
SOFT = (236, 244, 246)
LINE = (200, 214, 220)
INK = (28, 36, 42)
MUTED = (95, 110, 120)

TODAY_AR = "١ تشرين الثاني ٢٠٢٦"
DRIVER_APP_VERSION = "1.0.0"
CUSTOMER_APP_VERSION = "1.0.2"
STAFF_PASSWORD = "Beroya@12345"
OTP = "123456"
DESK_URL = "https://beroyaon.com/login"
LANDING_URL = "https://beroyaon.com/ar"
SUPPORT_EMAIL = "support@beroyaon.com"
SUPPORT_PHONE = "+963989901010"

_LTR_RE = re.compile(
    r"(\+963\d+|https?://[^\s]+|[\w.+-]+@[\w.-]+\.\w+|Beroya@\S+|\d+\.\d+\.\d+)"
)


def ar(text: str) -> str:
    held: list[str] = []

    def hold(m: re.Match[str]) -> str:
        held.append(m.group(1))
        return f"<<{len(held) - 1}>>"

    protected = _LTR_RE.sub(hold, text)
    shaped = get_display(arabic_reshaper.reshape(protected))
    for i, token in enumerate(held):
        shaped = shaped.replace(f"<<{i}>>", token)
        shaped = shaped.replace(f">>{i}<<", token)
    return shaped


def is_pure_ltr(text: str) -> bool:
    stripped = text.replace("\n", "").strip()
    if not stripped:
        return True
    return not any("\u0600" <= ch <= "\u06FF" for ch in stripped)


class OfficialPDF(FPDF):
    def header(self) -> None:
        self.set_fill_color(*NAVY)
        self.rect(0, 0, 210, 10, "F")
        self.set_fill_color(*TEAL)
        self.rect(0, 10, 210, 1, "F")
        self.set_y(2.2)
        self.set_font(FONT, "B", 8)
        self.set_text_color(255, 255, 255)
        self.cell(0, 5.5, ar("منصة بيرويا للنقل — وثيقة الوصول لبيئة الاختبار"), align="C")
        self.set_y(14)

    def footer(self) -> None:
        self.set_y(-12)
        self.set_draw_color(*LINE)
        self.line(self.l_margin, self.get_y(), self.l_margin + self.epw, self.get_y())
        self.ln(1.2)
        self.set_font(FONT, "", 7.5)
        self.set_text_color(*MUTED)
        self.cell(self.epw / 2, 5, ar("سريّ للاختبار الرسمي"), align="R")
        self.cell(self.epw / 2, 5, f"{self.page_no()} / {{nb}}", align="L")

    def title_block(self) -> None:
        y0 = self.get_y()
        self.set_fill_color(*SOFT)
        self.rect(self.l_margin, y0, self.epw, 18, "F")
        self.set_xy(self.l_margin + 3, y0 + 2.5)
        self.set_font(FONT, "B", 14)
        self.set_text_color(*NAVY)
        self.cell(self.epw - 6, 6.5, ar("دليل الوصول والاختبار"), align="R")
        self.set_xy(self.l_margin + 3, y0 + 10)
        self.set_font(FONT, "", 8.5)
        self.set_text_color(*MUTED)
        self.cell(
            self.epw - 6,
            5,
            ar(f"مخصّص لجهات الاعتماد الرسمية — تاريخ التجهيز: {TODAY_AR}"),
            align="R",
        )
        self.set_y(y0 + 21)

    def h2(self, text: str) -> None:
        self.ln(2.5)
        y = self.get_y()
        self.set_fill_color(*TEAL)
        self.rect(self.l_margin + self.epw - 1.8, y + 0.8, 1.8, 5.5, "F")
        self.set_x(self.l_margin)
        self.set_font(FONT, "B", 10.5)
        self.set_text_color(*NAVY)
        self.multi_cell(self.epw - 4, 6, ar(text), align="R")
        self.ln(0.8)

    def p(self, text: str) -> None:
        self.set_x(self.l_margin)
        self.set_font(FONT, "", 9)
        self.set_text_color(*INK)
        self.multi_cell(self.epw, 5.4, ar(text), align="R")
        self.ln(1)

    def bullet(self, text: str) -> None:
        self.set_x(self.l_margin)
        self.set_font(FONT, "", 9)
        self.set_text_color(*INK)
        self.multi_cell(self.epw, 5.2, ar(f"•  {text}"), align="R")
        self.ln(0.4)

    def callout(self, title: str, body: str) -> None:
        y0 = self.get_y()
        self.set_font(FONT, "", 8.5)
        lines = self.multi_cell(self.epw - 8, 5, ar(body), dry_run=True, output="LINES")
        box_h = 7 + len(lines) * 5 + 6
        self.set_fill_color(*SOFT)
        self.set_draw_color(*TEAL)
        self.rect(self.l_margin, y0, self.epw, box_h, "DF")
        self.set_fill_color(*TEAL)
        self.rect(self.l_margin, y0, 2, box_h, "F")
        self.set_xy(self.l_margin + 5, y0 + 2)
        self.set_font(FONT, "B", 9)
        self.set_text_color(*TEAL)
        self.multi_cell(self.epw - 8, 5.2, ar(title), align="R")
        self.set_x(self.l_margin + 5)
        self.set_font(FONT, "", 8.5)
        self.set_text_color(*INK)
        self.multi_cell(self.epw - 8, 5, ar(body), align="R")
        self.set_y(y0 + box_h + 2.5)

    def link_row(self, label: str, url: str) -> None:
        y0 = self.get_y()
        self.set_fill_color(252, 253, 254)
        self.set_draw_color(*LINE)
        self.rect(self.l_margin, y0, self.epw, 11, "DF")
        self.set_xy(self.l_margin + 2.5, y0 + 1.2)
        self.set_font(FONT, "B", 8)
        self.set_text_color(*NAVY)
        self.cell(self.epw - 5, 4.2, ar(label), align="R")
        self.set_xy(self.l_margin + 2.5, y0 + 5.5)
        self.set_font(FONT, "", 8)
        self.set_text_color(*TEAL)
        self.cell(self.epw - 5, 4.2, url, align="L")
        self.set_y(y0 + 13)

    def table(self, headers: list[str], rows: list[list[str]], widths: list[float]) -> None:
        line_h = 4.4

        def prepare(cell: str, header: bool) -> tuple[str, str]:
            if header:
                return ar(cell), "C"
            if is_pure_ltr(cell):
                return cell, "L"
            return ar(cell), "C"

        def draw(cells: list[str], header: bool = False, zebra: bool = False) -> None:
            prepared = [prepare(c, header) for c in cells]
            max_lines = 1
            for i, (cell, _) in enumerate(prepared):
                lines = self.multi_cell(widths[i], line_h, cell, dry_run=True, output="LINES")
                max_lines = max(max_lines, len(lines))
            row_h = max(max_lines * line_h + 2, 8)
            # only break if the whole row won't fit
            if self.get_y() + row_h > self.page_break_trigger:
                self.add_page()
            y0 = self.get_y()
            x0 = self.l_margin
            if header:
                self.set_font(FONT, "B", 7.5)
                self.set_fill_color(*NAVY)
                self.set_text_color(255, 255, 255)
            else:
                self.set_font(FONT, "", 7.5)
                self.set_fill_color(*(SOFT if zebra else (255, 255, 255)))
                self.set_text_color(*INK)
            for i, (cell, align) in enumerate(prepared):
                x = x0 + sum(widths[:i])
                self.set_draw_color(*LINE)
                self.set_xy(x, y0)
                mode = "DF" if (header or zebra) else "D"
                self.rect(x, y0, widths[i], row_h, mode)
                self.set_xy(x, y0 + 1)
                self.multi_cell(widths[i], line_h, cell, align=align)
            self.set_y(y0 + row_h)

        draw(headers, header=True)
        for idx, row in enumerate(rows):
            draw(row, zebra=idx % 2 == 1)
        self.ln(2)


def main() -> None:
    pdf = OfficialPDF()
    pdf.alias_nb_pages()
    windir = Path(r"C:\Windows\Fonts")
    pdf.add_font(FONT, "", str(windir / "tahoma.ttf"))
    pdf.add_font(FONT, "B", str(windir / "tahomabd.ttf"))
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.set_margins(12, 15, 12)
    pdf.add_page()

    pdf.title_block()
    pdf.p(
        "تتضمّن هذه الوثيقة بيانات الدخول اللازمة لاختبار منصة بيرويا "
        "(تطبيق العميل، تطبيق السائق، ولوحة التحكم)، ضمن بيئة مخصّصة للمراجعة والاعتماد."
    )
    pdf.callout(
        "ملخص سريع للدخول",
        f"لوحة التحكم: البريد + كلمة المرور  {STAFF_PASSWORD}   |   التطبيقات: الهاتف + رمز التحقق  {OTP}",
    )

    pdf.h2("أولاً — حسابات التطبيقات (محافظة حلب)")
    pdf.table(
        ["النطاق", "رمز التحقق", "رقم الهاتف", "الوصف", "الواجهة", "#"],
        [
            ["حلب", OTP, "+9639110301", "عميل معتمد", f"تطبيق العميل {CUSTOMER_APP_VERSION}", "1"],
            ["حلب", OTP, "+9639220301", "سائق معتمد ومركبة مؤهّلة", f"تطبيق السائق {DRIVER_APP_VERSION}", "2"],
        ],
        [20, 22, 34, 44, 44, 8],
    )
    pdf.bullet("عميل إضافي: +9639110302  —  سائقون إضافيون: +9639220302 و +9639220303")

    pdf.h2("ثانياً — حسابات لوحة التحكم")
    pdf.p("الدخول بالبريد الإلكتروني فقط مع كلمة المرور الموحّدة أعلاه.")
    pdf.table(
        ["النطاق", "كلمة المرور", "البريد الإلكتروني", "الصلاحية", "#"],
        [
            ["فرع حلب", STAFF_PASSWORD, "cs.alp@beroyaon.com", "خدمة العملاء", "3"],
            ["فرع حلب", STAFF_PASSWORD, "cssup.aleppo@beroyaon.com", "مشرف خدمة العملاء", "4"],
            ["فرع حلب", STAFF_PASSWORD, "ops.aleppo@beroyaon.com", "العمليات", "5"],
            ["فرع حلب", STAFF_PASSWORD, "wallet.aleppo@beroyaon.com", "مسؤول المحفظة", "6"],
            ["عام", STAFF_PASSWORD, "finance@beroyaon.com", "المالية", "7"],
            ["عام", STAFF_PASSWORD, "admin@beroyaon.com", "المدير", "8"],
            ["عام", STAFF_PASSWORD, "superadmin@beroyaon.com", "المدير الأعلى", "9"],
        ],
        [26, 32, 62, 42, 10],
    )

    pdf.h2("ثالثاً — حسابات المتجر (نقطة البيع)")
    pdf.p(
        "حسابات كاشير متجر حلب التجريبي (ALP-01). "
        "الدخول من لوحة التحكم بنفس كلمة المرور، لشحن محفظة السائق من المتجر."
    )
    pdf.table(
        ["المتجر", "كلمة المرور", "البريد الإلكتروني", "الصلاحية", "#"],
        [
            ["ALP-01 حلب", STAFF_PASSWORD, "store.aleppo@beroyaon.com", "كاشير متجر", "10"],
            ["ALP-01 حلب", STAFF_PASSWORD, "store.aleppo2@beroyaon.com", "كاشير متجر", "11"],
        ],
        [32, 32, 62, 36, 10],
    )

    pdf.h2("رابعاً — روابط الوصول والإصدارات")
    pdf.link_row("تسجيل الدخول إلى لوحة التحكم", DESK_URL)
    pdf.link_row("الصفحة التعريفية للمنصة", LANDING_URL)
    pdf.bullet(
        f"تطبيق السائق {DRIVER_APP_VERSION}  |  تطبيق العميل {CUSTOMER_APP_VERSION}  |  "
        f"تاريخ التجهيز: {TODAY_AR}"
    )
    pdf.bullet("يُثبَّت التطبيقان من حزمة الاختبار المعتمدة المسلَّمة مع هذه الوثيقة.")

    pdf.h2("خامساً — طريقة الدخول")
    pdf.bullet(f"التطبيقات: أدخل رقم الهاتف من الجدول ثم رمز التحقق {OTP} (مفعّل مسبقاً للاختبار).")
    pdf.bullet(f"لوحة التحكم والمتجر: افتح الرابط أعلاه، ثم البريد من الجدول وكلمة المرور {STAFF_PASSWORD}.")

    pdf.h2("سادساً — ما يمكن اختباره")
    pdf.bullet("عميل وسائق معتمدان مع محفظة ومركبة ومستندات سارية.")
    pdf.bullet("رحلات بحالات مختلفة، وشكاوى وتنبيهات تشغيلية، وتقارير ومحفظة بحسب الصلاحية.")
    pdf.bullet("نقطة بيع المتجر: شحن محفظة السائق من رصيد المتجر التجريبي.")

    pdf.h2("سابعاً — الدعم الفني")
    pdf.callout(
        "للتواصل عند أي مشكلة في الدخول أو الاستخدام",
        f"البريد: {SUPPORT_EMAIL}     |     واتس آب واتصال (نفس الرقم): {SUPPORT_PHONE}",
    )

    pdf.h2("ثامناً — ملاحظات")
    pdf.bullet("البيانات وهمية ومخصّصة للاختبار فقط — يُرجى عدم مشاركتها خارج فريق المراجعة.")
    pdf.bullet("الفرع المرجعي للاختبار: محافظة حلب.")

    pdf.ln(2)
    pdf.set_draw_color(*TEAL)
    pdf.set_line_width(0.3)
    y_line = pdf.get_y()
    pdf.line(pdf.l_margin, y_line, pdf.l_margin + pdf.epw, y_line)
    pdf.ln(2)
    pdf.set_font(FONT, "", 8)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(
        pdf.epw,
        4.5,
        ar("منصة بيرويا — وثيقة رسمية لتسهيل اختبار الاعتماد. جميع الحقوق محفوظة."),
        align="C",
    )

    pdf.output(str(OUT))
    print(f"Wrote {OUT} ({pdf.page_no()} pages)")


if __name__ == "__main__":
    main()
