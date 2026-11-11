# -*- coding: utf-8 -*-
"""Professional Arabic PDF: license technical answers for Beroya On."""
from pathlib import Path
import re

import arabic_reshaper
from bidi.algorithm import get_display
from fpdf import FPDF

OUT = Path(__file__).with_name("LICENSE_TECH_ANSWERS.pdf")
FONT = "ArabicUI"

NAVY = (15, 45, 62)
TEAL = (22, 99, 112)
SOFT = (240, 246, 248)
LINE = (210, 222, 228)
INK = (32, 40, 48)
MUTED = (110, 122, 132)
OK_BG = (232, 245, 240)
OK_FG = (28, 110, 80)
PLAN_BG = (255, 246, 235)
PLAN_FG = (150, 90, 30)

TODAY_AR = "١ تشرين الثاني ٢٠٢٦"

_LTR_RE = re.compile(
    r"(https?://[^\s]+|[\w.+-]+@[\w.-]+\.\w+|[A-Za-z][A-Za-z0-9_./\\-]{2,})"
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


class Doc(FPDF):
    def header(self) -> None:
        self.set_fill_color(*NAVY)
        self.rect(0, 0, 210, 18, "F")
        self.set_fill_color(*TEAL)
        self.rect(0, 18, 210, 1.4, "F")
        self.set_xy(14, 4)
        self.set_font(FONT, "B", 11)
        self.set_text_color(255, 255, 255)
        self.cell(0, 6, ar("منصة بيرويا للنقل"), align="C", new_x="LMARGIN", new_y="NEXT")
        self.set_font(FONT, "", 8)
        self.set_text_color(210, 225, 230)
        self.cell(0, 5, ar("وثيقة إجابات تقنية — ملف الترخيص"), align="C")
        self.set_y(24)

    def footer(self) -> None:
        self.set_y(-14)
        self.set_draw_color(*LINE)
        self.set_line_width(0.2)
        self.line(14, self.get_y(), 196, self.get_y())
        self.ln(2)
        self.set_font(FONT, "", 7.5)
        self.set_text_color(*MUTED)
        self.cell(91, 5, ar("سريّ — للاستخدام الرسمي"), align="R")
        self.cell(91, 5, f"{self.page_no()} / {{nb}}", align="L")

    def hero(self) -> None:
        y = self.get_y()
        self.set_fill_color(*SOFT)
        self.rect(14, y, 182, 26, "F")
        self.set_draw_color(*TEAL)
        self.set_line_width(0.6)
        self.line(14, y, 14, y + 26)
        self.set_xy(20, y + 4)
        self.set_font(FONT, "B", 15)
        self.set_text_color(*NAVY)
        self.cell(170, 7, ar("إجابات البنود التقنية لملف الترخيص"), align="R", new_x="LMARGIN", new_y="NEXT")
        self.set_x(20)
        self.set_font(FONT, "", 9)
        self.set_text_color(*MUTED)
        self.multi_cell(
            170,
            5,
            ar(f"مراجعة قراءة فقط للمستودع البرمجي — تاريخ التجهيز: {TODAY_AR}"),
            align="R",
        )
        self.set_y(y + 30)

    def section(self, title: str) -> None:
        self.ln(3)
        y = self.get_y()
        if y > 250:
            self.add_page()
            y = self.get_y()
        self.set_fill_color(*TEAL)
        self.rect(193.5, y + 1, 2.5, 6, "F")
        self.set_xy(14, y)
        self.set_font(FONT, "B", 11)
        self.set_text_color(*NAVY)
        self.cell(178, 8, ar(title), align="R")
        self.ln(9)
        self.set_draw_color(*LINE)
        self.set_line_width(0.2)
        self.line(14, self.get_y(), 196, self.get_y())
        self.ln(3)

    def body(self, text: str) -> None:
        self.set_x(14)
        self.set_font(FONT, "", 9.5)
        self.set_text_color(*INK)
        self.multi_cell(182, 5.6, ar(text), align="R")
        self.ln(1.5)

    def item(self, label: str, text: str) -> None:
        self.set_x(14)
        self.set_font(FONT, "B", 9)
        self.set_text_color(*TEAL)
        self.multi_cell(182, 5.2, ar(label), align="R")
        self.set_x(14)
        self.set_font(FONT, "", 9)
        self.set_text_color(*INK)
        self.multi_cell(182, 5.2, ar(text), align="R")
        self.ln(1.8)

    def status_row(self, status: str, text: str) -> None:
        """status: implemented | planned"""
        y = self.get_y()
        if y > 265:
            self.add_page()
            y = self.get_y()
        implemented = status == "implemented"
        badge = "منفّذ" if implemented else "مخطط"
        bg = OK_BG if implemented else PLAN_BG
        fg = OK_FG if implemented else PLAN_FG
        self.set_font(FONT, "", 8.5)
        lines = self.multi_cell(148, 4.8, ar(text), dry_run=True, output="LINES")
        h = max(10, len(lines) * 4.8 + 4)
        self.set_fill_color(252, 253, 254)
        self.set_draw_color(*LINE)
        self.rect(14, y, 182, h, "DF")
        self.set_fill_color(*bg)
        self.rect(160, y + 2.2, 32, 6.2, "F")
        self.set_xy(160, y + 2.5)
        self.set_font(FONT, "B", 8)
        self.set_text_color(*fg)
        self.cell(32, 5.5, ar(badge), align="C")
        self.set_xy(18, y + 2)
        self.set_font(FONT, "", 8.5)
        self.set_text_color(*INK)
        self.multi_cell(140, 4.8, ar(text), align="R")
        self.set_y(y + h + 2)

    def matrix(self, rows: list[tuple[str, str, str]]) -> None:
        """rows: (item, answer, confirm) — drawn RTL-friendly as confirm | answer | item | #"""
        widths = [42, 78, 50, 12]  # confirm, answer, item, #
        headers = ["يحتاج تأكيدًا", "الإجابة من الكود", "البند", "#"]
        line_h = 4.3

        def draw_row(cells: list[str], header: bool = False, zebra: bool = False) -> None:
            rendered = [ar(c) for c in cells]
            max_lines = 1
            for i, cell in enumerate(rendered):
                lines = self.multi_cell(widths[i] - 2, line_h, cell, dry_run=True, output="LINES")
                max_lines = max(max_lines, len(lines))
            row_h = max(11, max_lines * line_h + 3)
            if self.get_y() + row_h > self.page_break_trigger:
                self.add_page()
            y0 = self.get_y()
            x0 = 14
            if header:
                self.set_font(FONT, "B", 8)
                self.set_fill_color(*NAVY)
                self.set_text_color(255, 255, 255)
            else:
                self.set_font(FONT, "", 7.6)
                self.set_fill_color(*(SOFT if zebra else (255, 255, 255)))
                self.set_text_color(*INK)
            for i, cell in enumerate(rendered):
                x = x0 + sum(widths[:i])
                self.set_draw_color(*LINE)
                self.set_xy(x, y0)
                self.rect(x, y0, widths[i], row_h, "DF" if (header or zebra) else "D")
                if header or zebra:
                    self.set_xy(x, y0)
                    self.cell(widths[i], row_h, "", fill=True)
                    self.rect(x, y0, widths[i], row_h)
                self.set_xy(x + 1, y0 + 1.5)
                self.multi_cell(widths[i] - 2, line_h, cell, align="C")
            self.set_y(y0 + row_h)

        draw_row(headers, header=True)
        for i, (item, answer, confirm) in enumerate(rows):
            draw_row([confirm, answer, item, str(i + 1)], zebra=i % 2 == 1)
        self.ln(2)


def main() -> None:
    pdf = Doc()
    pdf.alias_nb_pages()
    windir = Path(r"C:\Windows\Fonts")
    pdf.add_font(FONT, "", str(windir / "tahoma.ttf"))
    pdf.add_font(FONT, "B", str(windir / "tahomabd.ttf"))
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.set_margins(14, 26, 14)
    pdf.add_page()

    pdf.hero()
    pdf.body(
        "تلخّص هذه الوثيقة الإجابات التقنية المطلوبة ضمن ملف الترخيص، "
        "مع تمييز ما هو منفّذ في الكود عمّا هو مخطط أو غير ظاهر في المستودع."
    )

    # ── 1 ──
    pdf.section("١) آلية عمل التطبيق والربط والتقنيات")
    pdf.status_row(
        "implemented",
        "يوجد باك موحّد يربط تطبيق العميل وتطبيق السائق ولوحة التحكم عبر واجهات برمجية وبث لحظي.",
    )
    pdf.status_row(
        "implemented",
        "التقنيات الظاهرة: NestJS وPrisma وPostgreSQL وRedis وSocket.IO وBullMQ للخادم، وNext.js للوحة والويب.",
    )
    pdf.status_row(
        "planned",
        "مشاريع تطبيقات الموبايل (Flutter) غير مضمّنة داخل هذا المستودع؛ يتوفر توثيق فقط.",
    )
    pdf.item("المرجع", "Beroya-On-Backend/package.json — frontend/package.json — وحدات المصادقة والرحلات وحالة السائق.")

    # ── 2 ──
    pdf.section("٢) مواصفات الخوادم والاستضافة")
    pdf.status_row(
        "implemented",
        "من الإعدادات: قاعدة PostgreSQL وRedis، وتخزين وسائط عبر Cloudflare R2، ونطاق beroyaon.com في إعدادات CORS.",
    )
    pdf.status_row(
        "planned",
        "لا توجد في المشروع مواصفات أجهزة خوادم، ولا إثبات بالكود أن الاستضافة داخل سوريا.",
    )
    pdf.item("المرجع", "Beroya-On-Backend/.env.example — إعدادات قاعدة البيانات وRedis وR2.")

    # ── 3 ──
    pdf.section("٣) حفظ البيانات والأرشفة والحماية والنسخ الاحتياطي")
    pdf.status_row(
        "implemented",
        "البيانات التشغيلية تُحفظ في PostgreSQL، مع جلسات وحدود معدّل عبر Redis، وملفات عبر التخزين السحابي.",
    )
    pdf.status_row(
        "implemented",
        "عند حذف الحساب: تعطيل ناعم مع مسح الحقول الشخصية وتحرير رقم الهاتف (وليس جدول أرشفة منفصل).",
    )
    pdf.status_row(
        "planned",
        "لا يوجد في الكود حذف تلقائي للرحلات بعد سنة، ولا جدولة نسخ احتياطي شهري داخل الشركة.",
    )
    pdf.item("المرجع", "customers.service.ts وdriver-profile.service.ts (حذف الحساب — Ticket 27).")

    # page 2 — comparison + specifics + summary matrix
    pdf.add_page()
    pdf.section("٤) مقارنة القرارات مع التنفيذ")
    pdf.matrix(
        [
            (
                "حذف الرحلات بعد سنة",
                "غير منفّذ في الكود",
                "نعم — سياسة تشغيل",
            ),
            (
                "أرشفة بيانات المستخدم عند الحذف",
                "حذف ناعم + مسح بيانات شخصية",
                "نعم — تعريف الأرشفة",
            ),
            (
                "نسخ احتياطي شهري داخل الشركة",
                "غير موجود في المستودع",
                "نعم — إجراءات تشغيل",
            ),
            (
                "الاستضافة داخل سوريا",
                "غير مثبتة بالكود",
                "نعم — موقع الاستضافة",
            ),
            (
                "التتبع من هاتف السائق فقط",
                "منفّذ عبر تحديث موقع السائق",
                "لا",
            ),
        ]
    )
    pdf.item("مرجع التتبع", "driver-state.controller.ts — driver-state.service.ts — public-tracking.")

    pdf.section("٥) نقاط محددة مطلوبة")
    pdf.matrix(
        [
            (
                "معرّف الرحلة SMS أم بالتطبيق؟",
                "يظهر في التطبيق واللوحة. لا SMS لمعرّف الرحلة. SMS لرمز الدخول فقط",
                "جزئيًا — مشاركة يدوية؟",
            ),
            (
                "خصوصية وشروط عربي/إنجليزي + موافقة تسجيل",
                "صفحات ويب باللغتين موجودة. لا حقل موافقة في تسجيل OTP بالخادم",
                "نعم — شاشة التطبيق",
            ),
            (
                "أذونات الجهاز والميكروفون للطوارئ",
                "الخادم يدعم رفع صوت الطوارئ. قائمة أذونات الجهاز غير موجودة في هذا الريبو",
                "نعم — من مشروع الموبايل",
            ),
        ]
    )
    pdf.item(
        "المراجع",
        "otp.service.ts — صفحات privacy وterms في frontend — emergency.service.ts لمسار الصوت.",
    )

    pdf.section("٦) الجدول المختصر النهائي")
    pdf.matrix(
        [
            ("آلية العمل والربط والتقنيات", "باك موحّد + ويب؛ Flutter غير في الريبو", "لا للباك / نعم للموبايل"),
            ("الخوادم والاستضافة", "Postgres وRedis وR2 بلا مواصفات خادم", "نعم"),
            ("الحفظ والأرشفة والنسخ", "قاعدة بيانات + حذف ناعم؛ بلا retention/backup", "نعم"),
            ("معرّف الرحلة", "في التطبيق؛ لا SMS للمعرّف", "جزئيًا"),
            ("الخصوصية والشروط", "ويب ثنائي اللغة؛ بلا قبول في OTP", "نعم"),
            ("أذونات الجهاز", "صوت الطوارئ مدعوم بالخادم فقط", "نعم"),
            ("مصدر التتبع", "من هاتف السائق — منفّذ", "لا"),
        ]
    )

    pdf.ln(4)
    y = pdf.get_y()
    pdf.set_fill_color(*SOFT)
    pdf.rect(14, y, 182, 18, "F")
    pdf.set_xy(18, y + 3)
    pdf.set_font(FONT, "B", 9)
    pdf.set_text_color(*NAVY)
    pdf.cell(174, 5, ar("خلاصة التمييز"), align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(18)
    pdf.set_font(FONT, "", 8.5)
    pdf.set_text_color(*INK)
    pdf.multi_cell(
        174,
        4.8,
        ar("المنفّذ: الربط التقني، التتبع من السائق، الحذف الناعم، والصفحات القانونية على الويب. "
           "المخطط/غير الظاهر: استضافة سوريا، النسخ الشهري، حذف الرحلات بعد سنة، وموافقة/أذونات تطبيق الموبايل."),
        align="R",
    )

    pdf.output(str(OUT))
    print(f"Wrote {OUT} ({pdf.page_no()} pages)")


if __name__ == "__main__":
    main()
