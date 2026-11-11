"use client";

import { Check, CircleAlert, Lightbulb, Minus, Plus, RotateCcw, type IconNode } from "lucide";
import { useState, type ReactNode } from "react";

import { getDeskLocale, localeTag, t } from "@/features/desk/i18n/t";
import { BusyMark, btnGhost, btnPrimary } from "@/features/desk/ui";
import { Icon } from "@/shared/ui/icon";

type Row = Record<string, unknown>;

// ------------------------------------------------------------------ words

type Word = { one: string; two: string; few: string; many: string; en: [string, string] };

const WORDS = {
  second: { one: "ثانية واحدة", two: "ثانيتان", few: "ثوانٍ", many: "ثانية", en: ["second", "seconds"] },
  minute: { one: "دقيقة واحدة", two: "دقيقتان", few: "دقائق", many: "دقيقة", en: ["minute", "minutes"] },
  hour: { one: "ساعة واحدة", two: "ساعتان", few: "ساعات", many: "ساعة", en: ["hour", "hours"] },
  day: { one: "يوم واحد", two: "يومان", few: "أيام", many: "يوماً", en: ["day", "days"] },
  meter: { one: "متر واحد", two: "متران", few: "أمتار", many: "متر", en: ["meter", "meters"] },
  km: { one: "كيلومتر واحد", two: "كيلومتران", few: "كيلومترات", many: "كم", en: ["km", "km"] },
  ride: { one: "رحلة واحدة", two: "رحلتان", few: "رحلات", many: "رحلة", en: ["ride", "rides"] },
  driver: { one: "سائق واحد", two: "سائقان", few: "سائقين", many: "سائقاً", en: ["driver", "drivers"] },
  point: { one: "نقطة واحدة", two: "نقطتان", few: "نقاط", many: "نقطة", en: ["point", "points"] },
  passenger: { one: "راكب واحد", two: "راكبان", few: "ركاب", many: "راكباً", en: ["passenger", "passengers"] },
} satisfies Record<string, Word>;

export type WordKey = keyof typeof WORDS;

export function formatCount(value: number) {
  return new Intl.NumberFormat(localeTag(), { maximumFractionDigits: 2 }).format(value);
}

export function countText(value: number, word: WordKey) {
  const forms = WORDS[word];
  const shown = formatCount(value);
  if (getDeskLocale() !== "ar") return `${shown} ${value === 1 ? forms.en[0] : forms.en[1]}`;
  if (value === 1) return forms.one;
  if (value === 2) return forms.two;
  const tail = Number.isInteger(value) ? Math.abs(value) % 100 : -1;
  return `${shown} ${tail >= 3 && tail <= 10 ? forms.few : forms.many}`;
}

export function unitWord(value: number, word: WordKey) {
  const forms = WORDS[word];
  if (getDeskLocale() !== "ar") return value === 1 ? forms.en[0] : forms.en[1];
  const tail = Number.isInteger(value) ? Math.abs(value) % 100 : -1;
  return tail >= 3 && tail <= 10 ? forms.few : forms.many;
}

export function durationText(seconds: number) {
  if (!Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  if (total === 0) return countText(0, "second");
  const parts: [number, WordKey][] = [
    [Math.floor(total / 86400), "day"],
    [Math.floor((total % 86400) / 3600), "hour"],
    [Math.floor((total % 3600) / 60), "minute"],
    [total % 60, "second"],
  ];
  return parts
    .filter(([n]) => n > 0)
    .map(([n, word]) => countText(n, word))
    .join(getDeskLocale() === "ar" ? " و" : " ");
}

export function distanceText(meters: number) {
  if (!Number.isFinite(meters)) return "—";
  if (meters >= 1000) return countText(Math.round(meters / 10) / 100, "km");
  return countText(meters, "meter");
}

export function clockText(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value || "—";
  const hour = Number(match[1]);
  const minute = match[2];
  if (hour === 0 && minute === "00") return t("منتصف الليل");
  if (hour === 12 && minute === "00") return t("الظهر");
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? t("صباحاً") : t("مساءً")}`;
}

export function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

// ------------------------------------------------------------------ draft

function same(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Local copy of saved values; `changes` holds only the edited keys. Resets when the saved values change. */
export function useDraft<T extends Row>(initial: T) {
  const [draft, setDraft] = useState<T>(initial);
  const signature = JSON.stringify(initial);
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    setDraft(initial);
  }
  const changed = Object.keys(initial).filter((key) => !same(draft[key], initial[key]));
  return {
    draft,
    set<K extends keyof T>(key: K, value: T[K]) {
      setDraft((current) => ({ ...current, [key]: value }));
    },
    dirty: changed.length > 0,
    changes: Object.fromEntries(changed.map((key) => [key, draft[key]])) as Partial<T>,
    reset() {
      setDraft(initial);
    },
  };
}

// ------------------------------------------------------------------ controls

export function Switch({
  checked,
  onChange,
  onLabel = t("مفعّلة"),
  offLabel = t("متوقفة"),
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  onLabel?: string;
  offLabel?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`group inline-flex h-10 shrink-0 cursor-pointer items-center gap-2.5 rounded-full py-1 pe-3.5 ps-1 text-sm font-semibold ring-1 ring-inset transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
        checked ? "bg-teal/10 text-accent ring-teal/40" : "bg-heading/[0.04] text-muted ring-line-strong hover:text-heading"
      }`}
    >
      <span className={`flex h-8 w-14 items-center rounded-full p-1 transition-colors ${checked ? "justify-end bg-teal" : "justify-start bg-line-strong"}`}>
        <span className="grid size-6 place-items-center rounded-full bg-surface text-accent shadow-card">
          {checked ? <Icon node={Check} size={14} strokeWidth={3} /> : null}
        </span>
      </span>
      {checked ? onLabel : offLabel}
    </button>
  );
}

const DIGITS: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "٫": ".", "٬": "" };

function parseTyped(raw: string) {
  const clean = raw.replace(/[٠-٩٫٬]/g, (char) => DIGITS[char] ?? char).replace(/[,\s]/g, "");
  if (!clean || clean === "-") return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  placeholder,
  invalid = false,
  label,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  invalid?: boolean;
  label: string;
}) {
  const [typing, setTyping] = useState<string | null>(null);
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const bump = (delta: number) => {
    setTyping(null);
    const base = value ?? min ?? 0;
    onChange(clamp(Math.round((base + delta) * 100) / 100));
  };
  const shown = typing ?? (value == null ? "" : formatCount(value));
  const button =
    "grid w-11 shrink-0 cursor-pointer place-items-center text-body transition-colors hover:bg-brand/10 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div
      dir="ltr"
      className={`flex h-11 items-stretch overflow-hidden rounded-xl border bg-surface transition-colors focus-within:ring-4 ${
        invalid ? "border-danger focus-within:ring-danger/15" : "border-line-strong focus-within:border-teal focus-within:ring-brand/15"
      }`}
    >
      <button type="button" className={`${button} border-e border-line`} aria-label={`${label} −`} disabled={value != null && min != null && value <= min} onClick={() => bump(-step)}>
        <Icon node={Minus} size={16} />
      </button>
      <label className="flex min-w-0 flex-1 items-center gap-2 px-3">
        <span className="sr-only">{label}</span>
        <input
          className="h-full min-w-0 flex-1 bg-transparent text-center text-[15px] font-semibold tabular-nums text-heading outline-none placeholder:font-normal placeholder:text-muted"
          inputMode="decimal"
          value={shown}
          placeholder={placeholder}
          onFocus={() => setTyping(value == null ? "" : String(value))}
          onBlur={() => setTyping(null)}
          onChange={(event) => {
            setTyping(event.target.value);
            onChange(parseTyped(event.target.value));
          }}
        />
        {unit ? <span className="shrink-0 text-xs font-medium text-muted" dir="auto">{unit}</span> : null}
      </label>
      <button type="button" className={`${button} border-s border-line`} aria-label={`${label} +`} disabled={value != null && max != null && value >= max} onClick={() => bump(step)}>
        <Icon node={Plus} size={16} />
      </button>
    </div>
  );
}

export type UnitOption = { key: string; word: WordKey; factor: number };

export const TIME_UNITS_SEC: UnitOption[] = [
  { key: "sec", word: "second", factor: 1 },
  { key: "min", word: "minute", factor: 60 },
  { key: "hour", word: "hour", factor: 3600 },
];

export const TIME_UNITS_MIN: UnitOption[] = [
  { key: "min", word: "minute", factor: 1 },
  { key: "hour", word: "hour", factor: 60 },
  { key: "day", word: "day", factor: 1440 },
];

export const DISTANCE_UNITS: UnitOption[] = [
  { key: "m", word: "meter", factor: 1 },
  { key: "km", word: "km", factor: 1000 },
];

function bestUnit(value: number | null, units: UnitOption[]) {
  if (!value) return units[0];
  return [...units].reverse().find((unit) => value % unit.factor === 0) ?? units[0];
}

/** Stepper over a base unit (seconds, minutes or meters) shown in a unit the user picks. */
export function UnitStepper({
  value,
  onChange,
  units,
  min,
  max,
  invalid,
  label,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  units: UnitOption[];
  min?: number;
  max?: number;
  invalid?: boolean;
  label: string;
}) {
  const [unitKey, setUnitKey] = useState(() => bestUnit(value, units).key);
  const unit = units.find((item) => item.key === unitKey) ?? units[0];
  const shown = value == null ? null : Math.round((value / unit.factor) * 100) / 100;
  return (
    <div className="grid content-start gap-1.5">
      <Stepper
        label={label}
        value={shown}
        min={min == null ? undefined : min / unit.factor}
        max={max == null ? undefined : max / unit.factor}
        unit={unitWord(shown ?? 0, unit.word)}
        invalid={invalid}
        onChange={(next) => onChange(next == null ? null : Math.round(next * unit.factor))}
      />
      {units.length > 1 ? (
        <div className="flex gap-1" role="radiogroup" aria-label={t("الوحدة")}>
          {units.map((item) => (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={item.key === unit.key}
              className={`h-7 flex-1 rounded-lg text-xs font-semibold transition-colors ${
                item.key === unit.key ? "bg-brand/12 text-accent ring-1 ring-inset ring-brand/35" : "text-muted hover:bg-heading/[0.05] hover:text-heading"
              }`}
              onClick={() => setUnitKey(item.key)}
            >
              {unitWord(5, item.word)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A number that may be turned off ("no limit"). */
export function OptionalStepper({
  value,
  onChange,
  offLabel,
  onLabel,
  defaultOn,
  ...stepper
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  offLabel: string;
  onLabel: string;
  defaultOn: number;
} & Omit<Parameters<typeof Stepper>[0], "value" | "onChange">) {
  const on = value != null;
  return (
    <div className="grid gap-2">
      <Choice
        value={on ? "on" : "off"}
        onChange={(next) => onChange(next === "on" ? value ?? defaultOn : null)}
        options={[
          { value: "off", label: offLabel },
          { value: "on", label: onLabel },
        ]}
      />
      {on ? <Stepper {...stepper} value={value} onChange={onChange} /> : null}
    </div>
  );
}

export function Choice<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string; hint?: string }[];
}) {
  return (
    <div className={`grid gap-1.5 ${options.some((option) => option.hint) ? "" : "grid-flow-col auto-cols-fr"}`} role="radiogroup">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-start transition-colors ${
              active ? "border-teal bg-teal/[0.08]" : "border-line-strong hover:border-teal/45"
            }`}
          >
            <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 ${active ? "border-teal" : "border-line-strong"}`}>
              {active ? <span className="size-2 rounded-full bg-teal" /> : null}
            </span>
            <span className="min-w-0">
              <span className={`block text-sm font-semibold ${active ? "text-heading" : "text-body"}`}>{option.label}</span>
              {option.hint ? <span className="mt-0.5 block text-xs leading-5 text-muted">{option.hint}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ layout

export function SettingLine({
  label,
  help,
  error,
  children,
  stacked = false,
}: {
  label: string;
  help?: ReactNode;
  error?: string | null;
  children: ReactNode;
  stacked?: boolean;
}) {
  return (
    <div className={`grid gap-3 py-5 ${stacked ? "" : "md:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] md:items-start md:gap-8"}`}>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-heading">{label}</p>
        {help ? <div className="mt-1 text-[13px] leading-6 text-muted">{help}</div> : null}
      </div>
      <div className="grid min-w-0 gap-1.5">
        {children}
        {error ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-danger-ink">
            <Icon node={CircleAlert} size={14} />
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function Summary({ children, off = false, title = t("ماذا يحدث بهذه الإعدادات؟") }: { children: ReactNode; off?: boolean; title?: string }) {
  return (
    <div className={`flex gap-3 rounded-xl px-4 py-3.5 ring-1 ring-inset ${off ? "bg-heading/[0.035] ring-line" : "bg-brand/[0.07] ring-brand/25"}`}>
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg bg-surface shadow-card ${off ? "text-muted" : "text-accent"}`}>
        <Icon node={Lightbulb} size={16} />
      </span>
      <div className="min-w-0">
        <p className={`text-xs font-semibold ${off ? "text-muted" : "text-accent"}`}>{title}</p>
        <div className="mt-1 grid gap-1 text-sm leading-7 text-heading">{children}</div>
      </div>
    </div>
  );
}

function SaveBar({ dirty, saving, blocked, onSave, onReset }: { dirty: boolean; saving: boolean; blocked: boolean; onSave: () => void; onReset: () => void }) {
  if (!dirty) {
    return (
      <div className="flex items-center gap-2 border-t border-line px-5 py-3 text-xs font-medium text-muted">
        <Icon node={Check} size={14} className="text-success" />
        {t("كل التغييرات محفوظة")}
      </div>
    );
  }
  return (
    <div className="sticky bottom-3 z-10 mx-3 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-surface px-4 py-3 shadow-float">
      <p className="flex items-center gap-2 text-sm font-semibold text-heading">
        <span className="size-2 rounded-full bg-warning" />
        {blocked ? t("صحّح القيم المعلّمة بالأحمر قبل الحفظ") : t("لديك تغييرات لم تُحفظ بعد")}
      </p>
      <div className="flex gap-2">
        <button className={btnGhost} type="button" onClick={onReset} disabled={saving}>
          <Icon node={RotateCcw} size={15} />
          {t("تراجع")}
        </button>
        <button className={btnPrimary} type="button" onClick={onSave} disabled={saving || blocked}>
          {saving ? <BusyMark /> : <Icon node={Check} size={16} />}
          {t("حفظ التغييرات")}
        </button>
      </div>
    </div>
  );
}

export function SettingsSection({
  id,
  icon,
  title,
  description,
  enabled,
  onToggle,
  summary,
  children,
  extra,
  save,
}: {
  id: string;
  icon: IconNode;
  title: string;
  description: string;
  enabled?: boolean;
  onToggle?: (next: boolean) => void;
  summary?: ReactNode;
  children?: ReactNode;
  extra?: ReactNode;
  save?: { dirty: boolean; saving: boolean; blocked: boolean; onSave: () => void; onReset: () => void };
}) {
  const off = enabled === false;
  return (
    <section id={id} className="scroll-mt-36 rounded-2xl border border-line bg-surface shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5">
        <div className="flex min-w-0 flex-1 gap-3.5">
          <span className={`grid size-11 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${off ? "bg-heading/[0.05] text-muted ring-line" : "bg-brand/12 text-accent ring-brand/25"}`}>
            <Icon node={icon} size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold leading-7 text-heading">{title}</h2>
            <p className="mt-0.5 max-w-2xl text-[13px] leading-6 text-muted">{description}</p>
          </div>
        </div>
        {onToggle ? <Switch checked={enabled === true} onChange={onToggle} /> : null}
      </header>
      {summary ? <div className="px-5 pt-4">{summary}</div> : null}
      {children ? <div className={`divide-y divide-line px-5 transition-opacity ${off ? "opacity-60" : ""}`}>{children}</div> : null}
      {extra ? <div className="px-5 pb-5">{extra}</div> : null}
      {save ? <SaveBar {...save} /> : null}
    </section>
  );
}

export function SectionNav({ items }: { items: { id: string; label: string; icon: IconNode; on?: boolean }[] }) {
  return (
    <nav aria-label={t("أقسام الصفحة")} className="sticky top-[4.5rem] z-20 overflow-x-auto rounded-2xl [scrollbar-width:none] border border-line bg-surface/95 p-1.5 shadow-card backdrop-blur-md">
      <ul className="flex min-w-max gap-1">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(event) => {
                event.preventDefault();
                document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="flex h-9 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-body transition-colors hover:bg-brand/10 hover:text-heading"
            >
              <Icon node={item.icon} size={15} className="text-accent" />
              {item.label}
              {item.on === undefined ? null : (
                <span className={`size-2 rounded-full ${item.on ? "bg-success" : "bg-line-strong"}`} title={item.on ? t("مفعّلة") : t("متوقفة")} />
              )}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function useSectionSave(save: (changes: Row) => Promise<unknown>) {
  const [saving, setSaving] = useState(false);
  return {
    saving,
    async run(changes: Row) {
      setSaving(true);
      try {
        await save(changes);
      } finally {
        setSaving(false);
      }
    },
  };
}
