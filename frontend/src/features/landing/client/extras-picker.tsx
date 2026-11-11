"use client";

import { Accessibility, Baby, Check, Luggage, Plus, UserRound, type IconNode } from "lucide";
import { useState } from "react";

import { cx } from "@/shared/lib/cx";
import { Icon } from "@/shared/ui/icon";

type Option = { id: string; label: string };

type ExtrasPickerProps = {
  options: Option[];
  hint: string;
  summaryTitle: string;
  summaryCategory: string;
  summaryEmpty: string;
  matchNote: string;
};

const icons: Record<string, IconNode> = {
  female: UserRound,
  child: Baby,
  luggage: Luggage,
  access: Accessibility,
};

export function ExtrasPicker({ options, hint, summaryTitle, summaryCategory, summaryEmpty, matchNote }: ExtrasPickerProps) {
  const [selected, setSelected] = useState<string[]>([options[1]?.id ?? ""]);

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  const chosen = options.filter((option) => selected.includes(option.id));

  return (
    <div className="grid gap-5">
      <div>
        <p className="mb-4 text-sm font-medium text-muted">{hint}</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {options.map((option) => {
            const isOn = selected.includes(option.id);
            return (
              <li key={option.id}>
                <button
                  type="button"
                  aria-pressed={isOn}
                  onClick={() => toggle(option.id)}
                  className={cx(
                    "group flex w-full items-center gap-3.5 rounded-2xl border p-4 text-start transition duration-300 ease-out-soft",
                    isOn
                      ? "border-brand bg-brand/10 shadow-glow"
                      : "border-line bg-surface hover:-translate-y-0.5 hover:border-line-strong",
                  )}
                >
                  <span
                    className={cx(
                      "grid size-11 shrink-0 place-items-center rounded-xl transition duration-300",
                      isOn ? "bg-brand text-ink" : "bg-canvas text-heading",
                    )}
                  >
                    <Icon node={icons[option.id] ?? Plus} size={20} />
                  </span>
                  <span className="flex-1 text-[15px] leading-6 font-semibold text-heading">{option.label}</span>
                  <span
                    className={cx(
                      "grid size-6 shrink-0 place-items-center rounded-full border transition duration-300",
                      isOn ? "border-brand bg-brand text-ink" : "border-line-strong text-transparent",
                    )}
                  >
                    <Icon node={Check} size={13} strokeWidth={2.8} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="card relative overflow-hidden rounded-3xl p-5" aria-live="polite">
        <div className="absolute -top-16 -end-16 size-40 rounded-full bg-brand/15 blur-2xl" />
        <p className="relative text-xs font-medium text-muted">{summaryTitle}</p>
        <p className="relative mt-1 text-lg font-semibold text-heading">{summaryCategory}</p>
        <ul className="relative mt-4 flex min-h-20 flex-wrap content-start gap-2">
          {chosen.length === 0 ? <li className="text-sm text-muted">{summaryEmpty}</li> : null}
          {chosen.map((option) => (
            <li
              key={option.id}
              className="pop-in inline-flex items-center gap-1.5 rounded-full bg-heading px-3 py-1.5 text-[13px] font-medium text-canvas"
            >
              <Icon node={icons[option.id] ?? Plus} size={14} />
              {option.label}
            </li>
          ))}
        </ul>
        <p className="relative mt-4 flex items-start gap-2 border-t border-line pt-4 text-[13px] leading-6 text-muted">
          <Icon node={Check} size={15} className="mt-1 shrink-0 text-success" />
          {matchNote}
        </p>
      </div>
    </div>
  );
}
