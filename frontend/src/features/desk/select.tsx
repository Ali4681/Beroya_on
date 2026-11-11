"use client";

import { listJoin, t } from "@/features/desk/i18n/t";

import { Check, ChevronDown, Search, X } from "lucide";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { enumOptions, type EnumKind } from "@/features/desk/enums";
import { inputClass } from "@/features/desk/ui";
import { Icon } from "@/shared/ui/icon";

export type Choice = { value: string; label: ReactNode; searchText?: string };

function choiceSearchText(option: Choice) {
  if (option.searchText) return option.searchText;
  return typeof option.label === "string" ? option.label : option.value;
}

type PopBox = { top?: number; bottom?: number; left: number; width: number };

function placeBox(rect: DOMRect): PopBox {
  const width = Math.max(rect.width, 192);
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
  const roomBelow = window.innerHeight - rect.bottom;
  const openUp = roomBelow < 240 && rect.top > roomBelow;
  if (openUp) return { left, width, bottom: window.innerHeight - rect.top + 6 };
  return { left, width, top: rect.bottom + 6 };
}

export function ChoiceSelect({
  name,
  value,
  defaultValue = "",
  onValueChange,
  options,
  placeholder = t("اختر"),
  required = false,
  emptyLabel,
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: Choice[];
  placeholder?: string;
  required?: boolean;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(defaultValue);
  const [box, setBox] = useState<PopBox | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const current = value ?? internal;
  const choices = emptyLabel ? [{ value: "", label: emptyLabel }, ...options] : options;
  const selected = choices.find((option) => option.value === current);

  function syncBox() {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) setBox(placeBox(rect));
  }

  useLayoutEffect(() => {
    if (open) syncBox();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      const node = event.target as Node;
      if (root.current?.contains(node) || list.current?.contains(node)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", syncBox);
    window.addEventListener("scroll", syncBox, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", syncBox);
      window.removeEventListener("scroll", syncBox, true);
    };
  }, [open]);

  function pick(next: string) {
    if (value === undefined) setInternal(next);
    onValueChange?.(next);
    setOpen(false);
  }

  const menu = open && box && typeof document !== "undefined" ? createPortal(
    <ul
      ref={list}
      id={listId}
      role="listbox"
      style={{ top: box.top, bottom: box.bottom, left: box.left, width: box.width }}
      className="desk-pop fixed z-[80] max-h-64 overflow-auto rounded-xl border border-line bg-surface p-1.5 shadow-float"
    >
      {choices.map((option) => {
        const active = option.value === current;
        return (
          <li key={option.value || "empty"} role="option" aria-selected={active}>
            <button
              type="button"
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-start text-sm transition-colors ${active ? "bg-brand/12 font-semibold text-heading" : "text-body hover:bg-heading/5 hover:text-heading"}`}
              onClick={() => pick(option.value)}
            >
              <span>{option.label}</span>
              {active ? <Icon node={Check} size={16} className="shrink-0 text-accent" /> : null}
            </button>
          </li>
        );
      })}
    </ul>,
    document.body,
  ) : null;

  return (
    <div ref={root} className="relative">
      {name ? <input type="hidden" name={name} value={current} required={required && !current} /> : null}
      <button
        ref={trigger}
        type="button"
        className={`${inputClass} flex items-center justify-between gap-3 text-start`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((state) => !state)}
      >
        <span className={selected && selected.value ? "truncate font-medium text-heading" : "truncate text-muted"}>
          {selected?.label ?? placeholder}
        </span>
        <Icon node={ChevronDown} size={16} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {menu}
    </div>
  );
}

/** Searchable single-select — used for long lists such as world languages. */
export function SearchSelect({
  name,
  options,
  value,
  defaultValue = "",
  onValueChange,
  placeholder = t("اختر"),
  searchPlaceholder = t("ابحث"),
  required = false,
  emptyLabel,
  filterLocally = true,
  onQueryChange,
  loading = false,
}: {
  name?: string;
  options: Choice[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  required?: boolean;
  emptyLabel?: string;
  /** When false, show all `options` and rely on the parent to filter (e.g. server `q`). */
  filterLocally?: boolean;
  onQueryChange?: (query: string) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [box, setBox] = useState<PopBox | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();
  const current = value ?? internal;
  const choices = emptyLabel ? [{ value: "", label: emptyLabel }, ...options] : options;
  const selected = choices.find((option) => option.value === current) ?? options.find((option) => option.value === current);
  const needle = query.trim().toLowerCase();
  const visible = filterLocally
    ? choices.filter((option) => !needle || choiceSearchText(option).toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle))
    : choices;

  function syncBox() {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) setBox(placeBox(rect));
  }

  useLayoutEffect(() => {
    if (open) syncBox();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    function onDoc(event: MouseEvent) {
      const node = event.target as Node;
      if (root.current?.contains(node) || panel.current?.contains(node)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", syncBox);
    window.addEventListener("scroll", syncBox, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", syncBox);
      window.removeEventListener("scroll", syncBox, true);
    };
  }, [open]);

  function pick(next: string) {
    if (value === undefined) setInternal(next);
    onValueChange?.(next);
    setQuery("");
    setOpen(false);
  }

  const menu = open && box && typeof document !== "undefined" ? createPortal(
    <div
      ref={panel}
      id={listId}
      style={{ top: box.top, bottom: box.bottom, left: box.left, width: box.width }}
      className="desk-pop fixed z-[80] overflow-hidden rounded-xl border border-line bg-surface shadow-float"
    >
      <label className="relative block border-b border-line p-2">
        <span className="sr-only">{searchPlaceholder}</span>
        <Icon node={Search} size={16} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-muted" />
        <input
          ref={search}
          className={`${inputClass} ps-9`}
          value={query}
          placeholder={searchPlaceholder}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            onQueryChange?.(next);
          }}
        />
      </label>
      <ul role="listbox" className="max-h-56 overflow-auto p-1.5">
        {loading ? <li className="px-2.5 py-2 text-sm text-muted">{t("جارٍ التحميل…")}</li> : null}
        {!loading && visible.length === 0 ? <li className="px-2.5 py-2 text-sm text-muted">{t("لا توجد نتائج")}</li> : null}
        {!loading
          ? visible.map((option) => {
              const active = option.value === current;
              return (
                <li key={option.value || "empty"} role="option" aria-selected={active}>
                  <button
                    type="button"
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-start text-sm transition-colors ${active ? "bg-brand/12 font-semibold text-heading" : "text-body hover:bg-heading/5 hover:text-heading"}`}
                    onClick={() => pick(option.value)}
                  >
                    <span className="truncate">{option.label}</span>
                    {active ? <Icon node={Check} size={16} className="shrink-0 text-accent" /> : null}
                  </button>
                </li>
              );
            })
          : null}
      </ul>
    </div>,
    document.body,
  ) : null;

  return (
    <div ref={root} className="relative">
      {name ? <input type="hidden" name={name} value={current} required={required && !current} /> : null}
      <button
        ref={trigger}
        type="button"
        className={`${inputClass} flex items-center justify-between gap-3 text-start`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((state) => !state)}
      >
        <span className={selected && (selected.value || emptyLabel) ? "truncate font-medium text-heading" : "truncate text-muted"}>
          {selected?.label ?? placeholder}
        </span>
        <Icon node={ChevronDown} size={16} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {menu}
    </div>
  );
}

export function SearchMultiSelect({
  name,
  options,
  value,
  onValueChange,
  placeholder = t("اختر"),
  searchPlaceholder = t("ابحث"),
}: {
  name: string;
  options: Choice[];
  value: string[];
  onValueChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [box, setBox] = useState<PopBox | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();
  const chosen = new Set(value);
  const needle = query.trim().toLowerCase();
  const visible = options.filter((option) => !needle || choiceSearchText(option).toLowerCase().includes(needle));
  const picked = options.filter((option) => chosen.has(option.value));

  function syncBox() {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) setBox(placeBox(rect));
  }

  useLayoutEffect(() => {
    if (open) syncBox();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    function onDoc(event: MouseEvent) {
      const node = event.target as Node;
      if (root.current?.contains(node) || panel.current?.contains(node)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", syncBox);
    window.addEventListener("scroll", syncBox, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", syncBox);
      window.removeEventListener("scroll", syncBox, true);
    };
  }, [open]);

  function toggle(next: string) {
    onValueChange(chosen.has(next) ? value.filter((item) => item !== next) : [...value, next]);
  }

  const menu = open && box && typeof document !== "undefined" ? createPortal(
    <div
      ref={panel}
      id={listId}
      style={{ top: box.top, bottom: box.bottom, left: box.left, width: box.width }}
      className="desk-pop fixed z-[80] overflow-hidden rounded-xl border border-line bg-surface shadow-float"
    >
      <label className="relative block border-b border-line p-2">
        <span className="sr-only">{searchPlaceholder}</span>
        <Icon node={Search} size={16} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-muted" />
        <input
          ref={search}
          className={`${inputClass} ps-9`}
          value={query}
          placeholder={searchPlaceholder}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <ul role="listbox" aria-multiselectable="true" className="max-h-56 overflow-auto p-1.5">
        {visible.length === 0 ? <li className="px-2.5 py-2 text-sm text-muted">{t("لا توجد نتائج")}</li> : null}
        {visible.map((option) => {
          const active = chosen.has(option.value);
          return (
            <li key={option.value} role="option" aria-selected={active}>
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-start text-sm transition-colors ${active ? "bg-brand/12 font-semibold text-heading" : "text-body hover:bg-heading/5 hover:text-heading"}`}
                onClick={() => toggle(option.value)}
              >
                <span className="truncate">{option.label}</span>
                {active ? <Icon node={Check} size={16} className="shrink-0 text-accent" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>,
    document.body,
  ) : null;

  return (
    <div ref={root} className="grid gap-2">
      {value.map((item) => <input key={item} type="hidden" name={name} value={item} />)}
      <button
        ref={trigger}
        type="button"
        className={`${inputClass} flex items-center justify-between gap-3 text-start`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((state) => !state)}
      >
        <span className={picked.length ? "truncate font-medium text-heading" : "truncate text-muted"}>
          {picked.length ? listJoin(picked.map((option) => choiceSearchText(option))) : placeholder}
        </span>
        <Icon node={ChevronDown} size={16} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {picked.length ? (
        <div className="flex flex-wrap gap-1.5">
          {picked.map((option) => (
            <button
              key={option.value}
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded-lg bg-brand/12 px-2 text-xs font-semibold text-heading"
              onClick={() => toggle(option.value)}
            >
              {option.label}
              <Icon node={X} size={12} className="text-muted" />
            </button>
          ))}
        </div>
      ) : null}
      {menu}
    </div>
  );
}

export function EnumSelect({
  kind,
  allowEmpty = false,
  emptyLabel,
  ...props
}: {
  kind: EnumKind;
  allowEmpty?: boolean;
} & Omit<Parameters<typeof ChoiceSelect>[0], "options">) {
  return <ChoiceSelect options={enumOptions(kind)} emptyLabel={allowEmpty || emptyLabel ? emptyLabel ?? t("الكل") : undefined} {...props} />;
}
