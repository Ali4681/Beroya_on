"use client";

import { ArrowLeftRight, CalendarRange, Globe2 } from "lucide";

import { localeTag, t } from "@/features/desk/i18n/t";
import { Icon } from "@/shared/ui/icon";

function partsOf(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { day: iso, time: "" };
  }
  return {
    day: new Intl.DateTimeFormat(localeTag(), { dateStyle: "medium" }).format(date),
    time: new Intl.DateTimeFormat(localeTag(), { timeStyle: "short" }).format(date),
  };
}

function durationLabel(from: string, to: string) {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  const hours = Math.round((end - start) / 3_600_000);
  if (hours < 48) {
    return hours <= 1 ? t("ساعة واحدة") : `${hours} ${t("ساعة")}`;
  }
  const days = Math.round(hours / 24);
  if (days === 1) return t("يوم واحد");
  if (days === 2) return t("يومان");
  return `${days} ${t("أيام")}`;
}

export function ReportWindowBar({
  from,
  to,
  timezone,
}: {
  from: string;
  to: string;
  timezone?: string | null;
}) {
  const start = partsOf(from);
  const end = partsOf(to);
  const span = durationLabel(from, to);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-heading/[0.025] ring-1 ring-inset ring-line/70">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/80 px-4 py-2.5">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-heading">
          <span className="grid size-7 place-items-center rounded-lg bg-brand/10 text-accent ring-1 ring-inset ring-brand/25">
            <Icon node={CalendarRange} size={14} />
          </span>
          {t("نافذة التقرير")}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {span ? (
            <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted">
              {span}
            </span>
          ) : null}
          {timezone ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-muted" dir="ltr">
              <Icon node={Globe2} size={12} className="text-accent" />
              {timezone}
            </span>
          ) : null}
        </div>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="rounded-xl border border-line bg-surface px-3.5 py-3 shadow-card">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{t("من")}</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-heading">{start.day}</p>
          {start.time ? <p className="mt-0.5 text-xs tabular-nums text-muted" dir="ltr">{start.time}</p> : null}
        </div>
        <div className="hidden place-items-center sm:grid">
          <span className="grid size-9 place-items-center rounded-full border border-line bg-heading/[0.04] text-accent">
            <Icon node={ArrowLeftRight} size={15} />
          </span>
        </div>
        <div className="rounded-xl border border-line bg-surface px-3.5 py-3 shadow-card">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{t("إلى")}</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-heading">{end.day}</p>
          {end.time ? <p className="mt-0.5 text-xs tabular-nums text-muted" dir="ltr">{end.time}</p> : null}
        </div>
      </div>
    </div>
  );
}
