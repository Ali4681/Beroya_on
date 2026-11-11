"use client";

import { getDeskLocale, localeTag, t } from "@/features/desk/i18n/t";

import { ChevronLeft, ChevronRight, X } from "lucide";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { btnIcon, btnIconQuiet, FormDismissProvider, inputClass, labelClass } from "@/features/desk/ui";
import { cx } from "@/shared/lib/cx";
import { Icon } from "@/shared/ui/icon";

/** Digits, `/`, and `\` only (Syrian-style plate entry). */
const PLATE_DISALLOWED = /[^0-9/\\]/g;
export const PLATE_PATTERN = /^[0-9/\\]+$/;

export function sanitizePlateNumber(value: string) {
  return value.replace(PLATE_DISALLOWED, "");
}

export function isValidPlateNumber(value: string) {
  return PLATE_PATTERN.test(value.trim());
}

export function PlateInput({
  className,
  onInput,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode" | "pattern">) {
  return (
    <input
      {...props}
      type="text"
      inputMode="text"
      autoComplete="off"
      dir="ltr"
      spellCheck={false}
      pattern="[0-9/\\\\]+"
      title={t("أرقام و / و \\ فقط")}
      className={cx(inputClass, "desk-ltr-num tabular-nums", className)}
      onInput={(event) => {
        const el = event.currentTarget;
        const next = sanitizePlateNumber(el.value);
        if (next !== el.value) {
          el.value = next;
        }
        onInput?.(event);
      }}
    />
  );
}

const WEEKDAYS = ["س", "ح", "ن", "ث", "ر", "خ", "ج"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toLocalValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:00`;
}

function parseLocal(value: string) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthName(index: number) {
  return new Intl.DateTimeFormat(localeTag(), { month: "long" }).format(new Date(2020, index, 1));
}

function displayValue(value: string) {
  const date = parseLocal(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(localeTag(), { dateStyle: "medium" }).format(date);
}

export function CheckField({
  name,
  label,
  hint,
  defaultChecked = false,
  checked,
  onCheckedChange,
  value = "on",
  tone = "default",
}: {
  name?: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onCheckedChange?: (next: boolean) => void;
  value?: string;
  tone?: "default" | "warn";
}) {
  const controlled = checked !== undefined;
  const checkedRing =
    tone === "warn"
      ? "has-[:checked]:border-warning/55 has-[:checked]:bg-warning/[0.08]"
      : "has-[:checked]:border-teal/60 has-[:checked]:bg-brand/[0.06]";
  const markChecked =
    tone === "warn"
      ? "peer-checked:border-warning peer-checked:bg-warning peer-checked:text-warning-ink"
      : "peer-checked:border-teal peer-checked:bg-teal peer-checked:text-on-teal";
  return (
    <label
      className={`group flex cursor-pointer items-start gap-3 rounded-xl border border-line-strong bg-surface px-3.5 py-3 text-sm transition-colors hover:border-teal/45 ${checkedRing}`}
    >
      <input
        className="peer sr-only"
        type="checkbox"
        name={name}
        value={value}
        checked={controlled ? checked : undefined}
        defaultChecked={controlled ? undefined : defaultChecked}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
      />
      <span
        className={`mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-line-strong bg-surface text-transparent transition ${markChecked} peer-focus-visible:ring-4 peer-focus-visible:ring-brand/20`}
      >
        <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
          <path d="M3.2 8.2 6.4 11.4 12.8 4.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block font-medium leading-5 text-heading">{label}</span>
        {hint ? <span className="mt-1 block text-[12px] leading-5 text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

const DATE_PANEL = 340;

function placeDateBox(rect: DOMRect) {
  const width = Math.min(Math.max(rect.width, 288), window.innerWidth - 16);
  const right = Math.min(Math.max(8, window.innerWidth - rect.right), window.innerWidth - width - 8);
  const roomBelow = window.innerHeight - rect.bottom - 16;
  const roomAbove = rect.top - 16;
  if (roomBelow < DATE_PANEL && roomAbove > roomBelow) {
    return { right, width, bottom: window.innerHeight - rect.top + 8, maxHeight: Math.max(180, roomAbove) };
  }
  return { right, width, top: rect.bottom + 8, maxHeight: Math.max(180, roomBelow) };
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function clampDayValue(raw: string, minDay?: string, maxDay?: string) {
  if (!raw) return raw;
  const date = parseLocal(raw);
  if (!date) return raw;
  let key = dayKey(date);
  if (minDay && key < minDay.slice(0, 10)) key = minDay.slice(0, 10);
  if (maxDay && key > maxDay.slice(0, 10)) key = maxDay.slice(0, 10);
  const next = parseLocal(key);
  return next ? toLocalValue(next) : raw;
}

export function DateField({
  name,
  label,
  defaultValue = "",
  value: controlled,
  onValueChange,
  required = false,
  min,
  max,
}: {
  name?: string;
  label: string;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  /** Inclusive lower bound as `YYYY-MM-DD` (or datetime). Days before this are disabled. */
  min?: string;
  /** Inclusive upper bound as `YYYY-MM-DD` (or datetime). Days after this are disabled. */
  max?: string;
}) {
  const minDay = min?.slice(0, 10) || "";
  const maxDay = max?.slice(0, 10) || "";
  const initial = parseLocal(controlled ?? defaultValue);
  const [internal, setInternal] = useState(initial ? toLocalValue(initial) : "");
  const parsedControlled = controlled !== undefined ? parseLocal(controlled) : null;
  const value =
    controlled !== undefined ? (parsedControlled ? toLocalValue(parsedControlled) : "") : internal;
  function setValue(next: string) {
    const clamped = next ? clampDayValue(next, minDay || undefined, maxDay || undefined) : next;
    if (controlled === undefined) setInternal(clamped);
    onValueChange?.(clamped);
  }
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => initial ?? new Date());
  const [sheet, setSheet] = useState<"days" | "months" | "years">("days");
  const [box, setBox] = useState<{ top?: number; bottom?: number; right: number; width: number; maxHeight: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const selected = parseLocal(value);

  function syncBox() {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) setBox(placeDateBox(rect));
  }

  useLayoutEffect(() => {
    if (open) {
      setSheet("days");
      syncBox();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      const target = event.target as Node;
      if (root.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", close);
    window.addEventListener("resize", syncBox);
    window.addEventListener("scroll", syncBox, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("resize", syncBox);
      window.removeEventListener("scroll", syncBox, true);
    };
  }, [open]);

  const weekdays = getDeskLocale() === "ar" ? WEEKDAYS : ["Sa", "Su", "Mo", "Tu", "We", "Th", "Fr"];
  const now = new Date();
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 1) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [...Array.from({ length: lead }, () => 0), ...Array.from({ length: days }, (_, index) => index + 1)];

  function pickDay(day: number) {
    const next = new Date(year, month, day);
    setValue(toLocalValue(next));
    setCursor(next);
    setOpen(false);
  }

  function showMonth(nextYear: number, nextMonth: number) {
    setCursor(new Date(nextYear, nextMonth, 1));
  }

  const thisYear = now.getFullYear();
  const yearPage = Math.floor((year - (thisYear - 20)) / 12);
  const yearStart = thisYear - 20 + yearPage * 12;
  const yearCells = Array.from({ length: 12 }, (_, index) => yearStart + index);

  const cell =
    "h-9 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35";
  const pill =
    "inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg bg-heading/[0.05] px-2.5 text-sm font-semibold text-heading ring-1 ring-inset ring-line transition-colors hover:bg-heading/[0.08] hover:ring-teal/40";

  return (
    <div ref={root} className="relative grid content-start gap-1.5 text-sm">
      <span className={labelClass}>{label}</span>
      {name ? <input type="hidden" name={name} value={value} required={required && !value} /> : null}
      <button
        ref={trigger}
        type="button"
        className={`${inputClass} flex items-center justify-between gap-3 text-start`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((state) => !state)}
      >
        <span className={value ? "truncate font-medium text-heading" : "truncate text-muted"}>{displayValue(value) || t("اختر التاريخ")}</span>
        <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-accent" aria-hidden>
          <rect x="3" y="4.5" width="14" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3 8h14M7 3v3M13 3v3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open && box && typeof document !== "undefined" ? createPortal(
        <div ref={panelRef} id={panelId} role="dialog" style={{ top: box.top, bottom: box.bottom, right: box.right, width: box.width, maxHeight: box.maxHeight }} className="desk-pop fixed z-[80] overflow-hidden rounded-2xl border border-line bg-surface p-3.5 shadow-float">
          <div className="mb-3 flex items-center gap-1.5">
            <button className={btnIcon} type="button" aria-label={t("السابق")} onClick={() => sheet === "years" ? showMonth(year - 12, month) : showMonth(year, month - 1)}>
              <Icon node={ChevronLeft} size={16} className="rtl:rotate-180" />
            </button>
            <button type="button" className={`${pill} ${sheet === "months" ? "bg-brand/12 text-accent ring-brand/30" : ""}`} aria-label={t("الشهر")} aria-pressed={sheet === "months"} onClick={() => setSheet((current) => (current === "months" ? "days" : "months"))}>
              {monthName(month)}
            </button>
            <button type="button" className={`${pill} max-w-[5.75rem] tabular-nums ${sheet === "years" ? "bg-brand/12 text-accent ring-brand/30" : ""}`} aria-label={t("السنة")} aria-pressed={sheet === "years"} onClick={() => setSheet((current) => (current === "years" ? "days" : "years"))}>
              {year}
            </button>
            <button className={btnIcon} type="button" aria-label={t("التالي")} onClick={() => sheet === "years" ? showMonth(year + 12, month) : showMonth(year, month + 1)}>
              <Icon node={ChevronRight} size={16} className="rtl:rotate-180" />
            </button>
          </div>
          {sheet === "months" ? (
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: 12 }, (_, index) => {
                const active = index === month;
                const current = now.getFullYear() === year && now.getMonth() === index;
                return (
                  <button
                    key={index}
                    type="button"
                    className={`${cell} truncate px-1 text-[13px] ${active ? "bg-teal font-semibold text-on-teal" : `text-heading hover:bg-brand/10 ${current ? "font-semibold ring-1 ring-inset ring-brand/50" : ""}`}`}
                    onClick={() => {
                      showMonth(year, index);
                      setSheet("days");
                    }}
                  >
                    {monthName(index)}
                  </button>
                );
              })}
            </div>
          ) : null}
          {sheet === "years" ? (
            <div className="grid grid-cols-3 gap-1.5">
              {yearCells.map((item) => {
                const active = item === year;
                const current = item === thisYear;
                return (
                  <button
                    key={item}
                    type="button"
                    className={`${cell} tabular-nums ${active ? "bg-teal font-semibold text-on-teal" : `text-heading hover:bg-brand/10 ${current ? "font-semibold ring-1 ring-inset ring-brand/50" : ""}`}`}
                    onClick={() => {
                      showMonth(item, month);
                      setSheet("days");
                    }}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          ) : null}
          {sheet === "days" ? (
            <>
              <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-semibold text-muted">
                {weekdays.map((day) => <span key={day} className="py-1.5">{day}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, index) => {
                  const active = !!selected && day > 0 && selected.getFullYear() === year && selected.getMonth() === month && selected.getDate() === day;
                  const today = day > 0 && now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
                  const key = day > 0 ? dayKey(new Date(year, month, day)) : "";
                  const blocked = day > 0 && ((minDay && key < minDay) || (maxDay && key > maxDay));
                  return day === 0 ? (
                    <span key={`empty-${index}`} />
                  ) : (
                    <button
                      key={day}
                      type="button"
                      disabled={blocked}
                      aria-disabled={blocked || undefined}
                      className={`${cell} tabular-nums ${
                        blocked
                          ? "cursor-not-allowed text-muted/35"
                          : active
                            ? "bg-teal font-semibold text-on-teal shadow-glow"
                            : `text-heading hover:bg-brand/10 ${today ? "font-semibold text-accent ring-1 ring-inset ring-brand/55" : ""}`
                      }`}
                      onClick={() => {
                        if (blocked) return;
                        pickDay(day);
                      }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5">
                <button
                  type="button"
                  className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-accent transition-colors hover:bg-brand/10"
                  onClick={() => {
                    setValue("");
                    setOpen(false);
                  }}
                >
                  {t("مسح")}
                </button>
                {(() => {
                  const todayKey = dayKey(now);
                  const todayBlocked = (minDay && todayKey < minDay) || (maxDay && todayKey > maxDay);
                  return (
                    <button
                      type="button"
                      disabled={!!todayBlocked}
                      className={`rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors ${
                        todayBlocked ? "cursor-not-allowed text-muted/40" : "text-accent hover:bg-brand/10"
                      }`}
                      onClick={() => {
                        if (todayBlocked) return;
                        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        setValue(toLocalValue(today));
                        setCursor(today);
                        setOpen(false);
                      }}
                    >
                      {t("اليوم")}
                    </button>
                  );
                })()}
              </div>
            </>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTE_STEPS = Array.from({ length: 12 }, (_, index) => index * 5);
const TIME_PRESETS = ["00:00", "08:00", "12:00", "22:00"];

function parseTime(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function timeValue(hour: number, minute: number) {
  return `${pad(hour)}:${pad(minute)}`;
}

function dayPart(hour: number) {
  return hour < 12 ? t("صباحاً") : t("مساءً");
}

function timeLabel(hour: number, minute: number) {
  const clock = minute === 0 ? String(hour % 12 || 12) : `${hour % 12 || 12}:${pad(minute)}`;
  return `${clock} ${dayPart(hour)}`;
}

function timeNote(hour: number, minute: number) {
  if (minute !== 0) return null;
  if (hour === 0) return t("منتصف الليل");
  if (hour === 12) return t("الظهر");
  return null;
}

export function TimeField({
  name,
  defaultValue = "",
  value: controlled,
  onValueChange,
  required = false,
  presets = TIME_PRESETS,
}: {
  name?: string;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  presets?: string[];
}) {
  const [internal, setInternal] = useState(() => {
    const parsed = parseTime(defaultValue);
    return parsed ? timeValue(parsed.hour, parsed.minute) : "";
  });
  const value = controlled ?? internal;
  function setValue(next: string) {
    if (controlled === undefined) setInternal(next);
    onValueChange?.(next);
  }
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<"hours" | "minutes">("hours");
  const [box, setBox] = useState<{ top?: number; bottom?: number; right: number; width: number; maxHeight: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const parsed = parseTime(value);
  const hour = parsed?.hour ?? 0;
  const minute = parsed?.minute ?? 0;
  const pm = hour >= 12;

  function syncBox() {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) setBox(placeDateBox(rect));
  }

  useLayoutEffect(() => {
    if (open) syncBox();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      const target = event.target as Node;
      if (root.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", syncBox);
    window.addEventListener("scroll", syncBox, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", syncBox);
      window.removeEventListener("scroll", syncBox, true);
    };
  }, [open]);

  function pickHour(hour12: number) {
    const next = (hour12 % 12) + (pm ? 12 : 0);
    setValue(timeValue(next, minute));
    setSheet("minutes");
  }

  function pickMinute(next: number) {
    setValue(timeValue(hour, next));
    setOpen(false);
  }

  function pickPeriod(nextPm: boolean) {
    if (nextPm === pm) return;
    setValue(timeValue((hour % 12) + (nextPm ? 12 : 0), minute));
  }

  function step(delta: number) {
    const total = (((hour * 60 + minute + delta) % 1440) + 1440) % 1440;
    setValue(timeValue(Math.floor(total / 60), total % 60));
  }

  const cell =
    "h-10 rounded-xl text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35";
  const segment = (active: boolean) =>
    `min-w-16 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${active ? "bg-teal text-on-teal shadow-glow" : "text-body hover:bg-heading/[0.06] hover:text-heading"}`;
  const digit = (active: boolean) =>
    `rounded-xl px-2 py-0.5 transition-colors ${active ? "bg-brand/12 text-accent" : "text-heading hover:bg-heading/[0.05]"}`;
  const note = parsed ? timeNote(hour, minute) : null;

  return (
    <div ref={root} className="relative">
      {name ? <input type="hidden" name={name} value={value} required={required && !value} /> : null}
      <button
        ref={trigger}
        type="button"
        className={`${inputClass} flex items-center justify-between gap-3 text-start`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (!open) setSheet("hours");
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (!parsed || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
          event.preventDefault();
          step(event.key === "ArrowUp" ? 5 : -5);
        }}
      >
        <span className={parsed ? "flex min-w-0 items-baseline gap-2" : "truncate text-muted"}>
          {parsed ? (
            <>
              <span className="font-semibold tabular-nums text-heading" dir="ltr">{pad(hour % 12 || 12)}:{pad(minute)}</span>
              <span className="text-xs font-medium text-muted">{dayPart(hour)}{note ? ` · ${note}` : ""}</span>
            </>
          ) : t("اختر الوقت")}
        </span>
        <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-accent" aria-hidden>
          <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10 6v4l2.6 1.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && box && typeof document !== "undefined" ? createPortal(
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={t("اختر الوقت")}
          style={{ top: box.top, bottom: box.bottom, right: box.right, width: Math.min(box.width, 320), maxHeight: box.maxHeight }}
          className="desk-pop fixed z-[80] overflow-auto rounded-2xl border border-line bg-surface shadow-float"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line bg-heading/[0.025] px-4 py-3.5">
            <div className="grid gap-0.5">
              <div className="flex items-center text-[30px] font-semibold leading-none tracking-tight" dir="ltr">
                <button type="button" className={digit(sheet === "hours")} aria-label={t("الساعة")} onClick={() => setSheet("hours")}>
                  {pad(hour % 12 || 12)}
                </button>
                <span className="px-0.5 text-muted">:</span>
                <button type="button" className={digit(sheet === "minutes")} aria-label={t("الدقيقة")} onClick={() => setSheet("minutes")}>
                  {pad(minute)}
                </button>
              </div>
              <p className="px-2 text-[11px] font-medium text-muted">
                <span className="tabular-nums" dir="ltr">{timeValue(hour, minute)}</span>
                {note ? ` · ${note}` : ""}
              </p>
            </div>
            <div className="grid gap-1 rounded-xl bg-heading/[0.05] p-1 ring-1 ring-inset ring-line">
              <button type="button" className={segment(!pm)} aria-pressed={!pm} onClick={() => pickPeriod(false)}>{t("صباحاً")}</button>
              <button type="button" className={segment(pm)} aria-pressed={pm} onClick={() => pickPeriod(true)}>{t("مساءً")}</button>
            </div>
          </div>
          <div className="p-3.5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{sheet === "hours" ? t("الساعة") : t("الدقيقة")}</p>
            <div className="grid grid-cols-4 gap-1.5" dir="ltr">
              {sheet === "hours"
                ? HOURS_12.map((item) => {
                    const active = parsed !== null && (hour % 12 || 12) === item;
                    return (
                      <button
                        key={item}
                        type="button"
                        className={`${cell} ${active ? "bg-teal font-semibold text-on-teal shadow-glow" : "text-heading hover:bg-brand/10"}`}
                        onClick={() => pickHour(item)}
                      >
                        {pad(item)}
                      </button>
                    );
                  })
                : MINUTE_STEPS.map((item) => {
                    const active = parsed !== null && minute === item;
                    return (
                      <button
                        key={item}
                        type="button"
                        className={`${cell} ${active ? "bg-teal font-semibold text-on-teal shadow-glow" : "text-heading hover:bg-brand/10"}`}
                        onClick={() => pickMinute(item)}
                      >
                        {pad(item)}
                      </button>
                    );
                  })}
            </div>
          </div>
          {presets.length ? (
            <div
              className="grid gap-1.5 border-t border-line px-3.5 py-3"
              style={{ gridTemplateColumns: `repeat(${Math.min(presets.length, 4)}, minmax(0, 1fr))` }}
            >
              {presets.map((preset) => {
                const at = parseTime(preset);
                if (!at) return null;
                const active = value === timeValue(at.hour, at.minute);
                return (
                  <button
                    key={preset}
                    type="button"
                    className={`inline-flex h-8 items-center justify-center truncate rounded-lg px-1.5 text-xs font-semibold tabular-nums ring-1 ring-inset transition-colors ${active ? "bg-brand/12 text-accent ring-brand/40" : "text-body ring-line hover:text-heading hover:ring-teal/40"}`}
                    onClick={() => {
                      setValue(timeValue(at.hour, at.minute));
                      setOpen(false);
                    }}
                  >
                    {timeNote(at.hour, at.minute) ?? timeLabel(at.hour, at.minute)}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

export function FormDialog({
  open,
  title,
  onClose,
  children,
  narrow = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  narrow?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="desk-fade fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`desk-pop flex max-h-[90vh] w-full flex-col rounded-2xl border border-line bg-surface shadow-float ${narrow ? "max-w-md" : "max-w-3xl"}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-heading">{title}</h2>
          <button className={btnIconQuiet} type="button" aria-label={t("إغلاق")} onClick={onClose}>
            <Icon node={X} size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-5"><FormDismissProvider onDone={onClose}>{children}</FormDismissProvider></div>
      </div>
    </div>,
    document.body,
  );
}
