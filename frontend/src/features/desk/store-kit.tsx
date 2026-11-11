"use client";

import { ChevronLeft, ChevronRight, X } from "lucide";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { localeTag, t } from "@/features/desk/i18n/t";
import { btnGhostSm, btnIconQuiet } from "@/features/desk/ui";
import { Icon } from "@/shared/ui/icon";

export type Paged<T> = { data: T[]; total: number; page: number; limit: number };

export function Kpi({ label, value, hint, stripe = "bg-brand", children }: { label: string; value: ReactNode; hint?: string; stripe?: string; children?: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface p-4 shadow-card">
      <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${stripe}`} />
      <p className="text-xs font-medium text-muted" title={hint}>{label}</p>
      <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight text-heading">{value}</p>
      {children ? <div className="mt-1 text-xs text-muted">{children}</div> : null}
    </div>
  );
}

export function Pager({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-muted">
      <span className="tabular-nums">
        {from}–{to} {t("من")} {total}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={btnGhostSm} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <Icon node={ChevronRight} size={14} className="ltr:rotate-180" />
          {t("السابق")}
        </button>
        <span className="tabular-nums">
          {page} / {pages}
        </span>
        <button type="button" className={btnGhostSm} disabled={page >= pages} onClick={() => onPage(page + 1)}>
          {t("التالي")}
          <Icon node={ChevronLeft} size={14} className="ltr:rotate-180" />
        </button>
      </div>
    </div>
  );
}

export function Dialog({
  title,
  onClose,
  children,
  wide = false,
  locked = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean | "xl";
  locked?: boolean;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !locked) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [locked, onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="desk-fade fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-ink/45 p-4 backdrop-blur-[2px]" onMouseDown={() => (locked ? undefined : onClose())}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`desk-pop w-full ${wide === "xl" ? "max-w-5xl" : wide ? "max-w-2xl" : "max-w-md"} rounded-2xl border border-line bg-surface shadow-float`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-heading">{title}</h2>
          <button type="button" className={btnIconQuiet} aria-label={t("إغلاق")} disabled={locked} onClick={onClose}>
            <Icon node={X} size={18} />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export const thClass = "h-10 whitespace-nowrap px-4 text-start text-xs font-semibold text-muted";
export const tdClass = "px-4 py-3 align-middle text-start";

export function TableShell({
  minWidth = "48rem",
  head,
  children,
  cols,
}: {
  minWidth?: string;
  head: ReactNode;
  children: ReactNode;
  /** Optional <col> widths (e.g. "14%" or "9rem") so header and rows stay aligned. */
  cols?: string[];
}) {
  return (
    <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
      <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth }}>
        {cols?.length ? (
          <colgroup>
            {cols.map((width, index) => (
              <col key={index} style={{ width }} />
            ))}
          </colgroup>
        ) : null}
        <thead>
          <tr className="border-b border-line bg-heading/[0.025]">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function whenText(value: unknown) {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeTag(), { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** A row in the preview of a money movement: label · value, with an optional emphasis. */
export function PreviewRow({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className={`tabular-nums ${strong ? "text-base font-semibold text-heading" : "font-medium text-heading"}`}>{value}</span>
    </div>
  );
}
