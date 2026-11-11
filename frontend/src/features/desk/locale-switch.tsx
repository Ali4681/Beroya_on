"use client";

import type { Locale } from "@/core/i18n/config";
import { t } from "@/features/desk/i18n/t";

const OPTIONS = [
  { code: "ar" as const, label: "عربي" },
  { code: "en" as const, label: "EN" },
];

export function DeskLocaleSwitch({ locale, onChange }: { locale: Locale; onChange: (locale: Locale) => void }) {
  return (
    <div role="group" aria-label={t("اللغة")} className="relative grid h-9 grid-cols-2 rounded-full border border-line bg-heading/[0.04] p-0.5 text-[11px] font-semibold">
      <span
        aria-hidden
        className={`pointer-events-none absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-full bg-teal shadow-glow transition-[inset-inline-start] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${locale === "en" ? "start-1/2" : "start-0.5"}`}
      />
      {OPTIONS.map((option) => {
        const active = locale === option.code;
        return (
          <button
            key={option.code}
            type="button"
            lang={option.code}
            aria-pressed={active}
            className={`relative z-10 h-full rounded-full px-2.5 transition-colors duration-300 ${active ? "text-on-teal" : "text-muted hover:text-heading"}`}
            onClick={() => {
              if (!active) onChange(option.code);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
