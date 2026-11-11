"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Clock3, Download, RadioTower, Target, TrendingUp, Users } from "lucide";
import Link from "next/link";
import { useId, useMemo, useState, type ReactNode } from "react";

import { useDesk } from "@/features/desk/desk-context";
import { go } from "@/features/desk/go-api";
import { useGoList } from "@/features/desk/hooks";
import { getDeskLocale, localeTag, t } from "@/features/desk/i18n/t";
import { enumLabel, headline } from "@/features/desk/present";
import { DateField } from "@/features/desk/controls";
import { ReportWindowBar } from "@/features/desk/report-window";
import { ChoiceSelect } from "@/features/desk/select";
import { readSession } from "@/features/desk/session";
import {
  btnGhostSm,
  chipActive,
  chipClass,
  chipGroup,
  Notice,
  PageTitle,
  Panel,
  PanelHeader,
  StateView,
} from "@/features/desk/ui";
import { Icon } from "@/shared/ui/icon";

type Period = "7d" | "30d" | "90d" | "custom";

type SeriesPoint = { bucket: string; requests: number; completed: number; cancelled: number };

type Overview = {
  window: { from: string; to: string };
  timezone?: string;
  period: {
    requests: number;
    completed: number;
    cancelled: number;
    cancelled_by_customer: number;
    cancelled_by_driver: number;
    cancelled_by_staff: number;
    cancellation_rate_pct: number | null;
    completion_rate_pct: number | null;
    avg_assignment_sec: number | null;
    p50_assignment_sec: number | null;
    p90_assignment_sec: number | null;
    assignment_samples: number;
    unserved: number;
    finished: number;
  };
  acceptance: { accepted: number; declined: number; expired: number; rate_pct: number | null };
  series: { unit: string; points: SeriesPoint[] };
};

type Coverage = {
  coverage_alert_count: number;
  coverage_alerts_open_now: number;
  driver_online_hours: number | null;
  online_sessions: number;
  alerts_in_window: { type: string; severity: string; count: number }[];
};

type DriversReport = {
  items: {
    driver_id: string;
    full_name: string | null;
    phone: string | null;
    completed: number;
    cancelled_by_driver: number;
    accepted: number;
    declined: number;
    expired: number;
    accept_rate_pct: number | null;
    avg_stars: number | null;
    rating_count: number;
  }[];
};

type Slice = { key: string; label: string; value: number; color: string };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toDateInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfDay(isoDate: string) {
  return new Date(`${isoDate}T00:00:00`);
}

function endOfDay(isoDate: string) {
  return new Date(`${isoDate}T23:59:59.999`);
}

function windowFor(period: Period, fromDate: string, toDate: string) {
  const now = new Date();
  if (period === "custom") {
    return { from: startOfDay(fromDate).toISOString(), to: endOfDay(toDate).toISOString() };
  }
  const days = period === "90d" ? 90 : period === "30d" ? 30 : 7;
  return { from: new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString(), to: now.toISOString() };
}

function fmtNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(localeTag(), { maximumFractionDigits: 1 }).format(value);
}

function fmtSec(value: number | null | undefined) {
  if (value == null) return "—";
  if (value < 60) return `${fmtNumber(value)} ${t("ث")}`;
  return `${fmtNumber(Math.round(value / 60))} ${t("د")}`;
}

function fmtPct(value: number | null | undefined) {
  if (value == null) return "—";
  return `${fmtNumber(value)}%`;
}

function bucketLabel(bucket: string, unit: string) {
  const date = new Date(bucket.includes("T") ? `${bucket}:00Z` : `${bucket}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return bucket.replace("T", " ").slice(5, 16);
  if (unit === "hour") {
    return new Intl.DateTimeFormat(localeTag(), { month: "short", day: "numeric", hour: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat(localeTag(), { month: "short", day: "numeric" }).format(date);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Smooth cubic path through points (catmull-rom → bezier). */
function smoothPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function areaPath(points: { x: number; y: number }[], baseline: number) {
  if (points.length === 0) return "";
  const line = smoothPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
}

function TrendChart({ points, unit }: { points: SeriesPoint[]; unit: string }) {
  const uid = useId().replace(/:/g, "");
  const data = points.length > 48 ? points.filter((_, i) => i % Math.ceil(points.length / 48) === 0 || i === points.length - 1) : points;
  const width = 720;
  const height = 260;
  const padL = 36;
  const padR = 16;
  const padT = 18;
  const padB = 36;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const maxY = Math.max(1, ...data.map((p) => Math.max(p.requests, p.completed, p.cancelled)));
  const coords = (key: keyof Pick<SeriesPoint, "requests" | "completed" | "cancelled">) =>
    data.map((p, i) => ({
      x: padL + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW),
      y: padT + innerH - (p[key] / maxY) * innerH,
    }));
  const req = coords("requests");
  const done = coords("completed");
  const cancel = coords("cancelled");
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: padT + innerH * (1 - f),
    label: Math.round(maxY * f),
  }));
  const xTicks = data.length <= 8
    ? data.map((p, i) => ({ i, label: bucketLabel(p.bucket, unit) }))
    : [0, Math.floor((data.length - 1) / 2), data.length - 1].map((i) => ({
        i,
        label: bucketLabel(data[i].bucket, unit),
      }));

  if (data.length === 0) {
    return <p className="grid h-64 place-items-center text-sm text-muted">{t("لا بيانات في هذه الفترة.")}</p>;
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <LegendDot color="var(--brand)" label={t("طلبات")} />
        <LegendDot color="var(--success)" label={t("مكتملة")} />
        <LegendDot color="var(--danger)" label={t("ملغاة")} />
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full overflow-visible" role="img" aria-label={t("السلسلة الزمنية")}>
        <defs>
          <linearGradient id={`req-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`done-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--success)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--success)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {grid.map((g) => (
          <g key={g.y}>
            <line x1={padL} x2={width - padR} y1={g.y} y2={g.y} stroke="var(--line)" strokeWidth="1" strokeDasharray="4 6" />
            <text x={padL - 8} y={g.y + 3} textAnchor="end" className="fill-[color:var(--muted)] text-[10px] tabular-nums">
              {g.label}
            </text>
          </g>
        ))}
        <path d={areaPath(req, padT + innerH)} fill={`url(#req-${uid})`} />
        <path d={areaPath(done, padT + innerH)} fill={`url(#done-${uid})`} />
        <path d={smoothPath(req)} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={smoothPath(done)} fill="none" stroke="var(--success)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
        <path d={smoothPath(cancel)} fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 4" />
        {xTicks.map((tick) => {
          const x = padL + (data.length <= 1 ? innerW / 2 : (tick.i / (data.length - 1)) * innerW);
          return (
            <text key={tick.i} x={x} y={height - 10} textAnchor="middle" className="fill-[color:var(--muted)] text-[10px]">
              {tick.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-muted">
      <span className="size-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 0 3px color-mix(in oklab, ${color} 25%, transparent)` }} />
      <span className="font-medium text-heading">{label}</span>
    </span>
  );
}

function DonutChart({ slices, centerLabel, centerValue }: { slices: Slice[]; centerLabel: string; centerValue: string }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const size = 196;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  if (total <= 0) {
    return <p className="grid h-48 place-items-center text-sm text-muted">{t("لا بيانات في هذه الفترة.")}</p>;
  }

  return (
    <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
      <div className="relative mx-auto grid size-48 place-items-center">
        <svg viewBox={`0 0 ${size} ${size}`} className="size-full -rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
          {slices.map((slice) => {
            const len = (slice.value / total) * c;
            const el = (
              <circle
                key={slice.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={slice.color}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                className="transition-all duration-500"
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-2xl font-semibold tabular-nums text-heading">{centerValue}</p>
            <p className="mt-0.5 text-[11px] font-medium text-muted">{centerLabel}</p>
          </div>
        </div>
      </div>
      <ul className="grid gap-2.5">
        {slices.map((slice) => {
          const pct = total > 0 ? Math.round((slice.value / total) * 1000) / 10 : 0;
          return (
            <li key={slice.key} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-sm">
              <span className="size-2.5 rounded-full" style={{ background: slice.color }} />
              <span className="min-w-0 truncate text-muted">{slice.label}</span>
              <span className="tabular-nums font-semibold text-heading">
                {fmtNumber(slice.value)}
                <span className="ms-1.5 text-xs font-medium text-muted">{fmtPct(pct)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function HBarChart({
  rows,
}: {
  rows: { key: string; label: string; value: number; display?: string; color?: string; href?: string }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="grid h-40 place-items-center text-sm text-muted">{t("لا بيانات في هذه الفترة.")}</p>;
  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <div key={row.key} className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            {row.href ? (
              <Link href={row.href} className="truncate font-medium text-accent hover:underline">
                {row.label}
              </Link>
            ) : (
              <span className="truncate font-medium text-heading">{row.label}</span>
            )}
            <span className="shrink-0 tabular-nums text-muted">{row.display ?? fmtNumber(row.value)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-heading/[0.06] ring-1 ring-inset ring-line">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${clamp((row.value / max) * 100, row.value > 0 ? 2 : 0, 100)}%`,
                background: row.color ?? "linear-gradient(90deg, var(--teal), var(--brand))",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricBars({
  items,
}: {
  items: { label: string; value: number | null; display: string; tone: string }[];
}) {
  const max = Math.max(1, ...items.map((i) => i.value ?? 0));
  return (
    <div className="grid gap-4">
      {items.map((item) => (
        <div key={item.label} className="grid gap-2">
          <div className="flex items-end justify-between gap-3">
            <span className="text-sm text-muted">{item.label}</span>
            <span className="text-lg font-semibold tabular-nums text-heading">{item.display}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-heading/[0.06] ring-1 ring-inset ring-line">
            <div
              className={`h-full rounded-full ${item.tone}`}
              style={{ width: `${clamp(((item.value ?? 0) / max) * 100, item.value ? 4 : 0, 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Sparkline({ values, color = "var(--brand)" }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const w = 88;
  const h = 28;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * w,
    y: h - (v / max) * (h - 4) - 2,
  }));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-[5.5rem] overflow-visible" aria-hidden>
      <path d={smoothPath(pts)} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon,
  spark,
  sparkColor,
  tone = "teal",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  spark?: number[];
  sparkColor?: string;
  tone?: "teal" | "success" | "warning" | "danger" | "brand";
}) {
  const skin =
    tone === "success"
      ? { wash: "bg-success/[0.06]", chip: "bg-success/15 text-success ring-success/25", ink: "text-success" }
      : tone === "warning"
        ? { wash: "bg-warning/[0.07]", chip: "bg-warning/15 text-warning-ink ring-warning/30", ink: "text-warning-ink" }
        : tone === "danger"
          ? { wash: "bg-danger/[0.06]", chip: "bg-danger/15 text-danger ring-danger/25", ink: "text-danger" }
          : tone === "brand"
            ? { wash: "bg-brand/[0.07]", chip: "bg-brand/15 text-accent ring-brand/30", ink: "text-accent" }
            : { wash: "bg-teal/[0.06]", chip: "bg-teal/15 text-teal ring-teal/25", ink: "text-teal" };

  return (
    <article className={`flex flex-col rounded-2xl border border-line ${skin.wash} p-4 shadow-card`}>
      <div className="flex items-center gap-2.5">
        <span className={`grid size-9 shrink-0 place-items-center rounded-full ring-1 ring-inset ${skin.chip}`}>{icon}</span>
        <p className="min-w-0 flex-1 text-[12px] font-medium leading-5 text-muted">{label}</p>
        {spark ? <span className="shrink-0">{<Sparkline values={spark} color={sparkColor} />}</span> : null}
      </div>

      <div className="mt-4 rounded-xl bg-surface/80 px-3 py-2.5 ring-1 ring-inset ring-line/70">
        <p className={`text-[1.375rem] font-semibold leading-[1.5] tabular-nums ${skin.ink}`}>{value}</p>
      </div>

      {hint ? <p className="mt-3 text-[11px] leading-5 text-muted">{hint}</p> : null}
    </article>
  );
}

function filenameFromDisposition(header: string | null) {
  if (!header) return "beroya-report.csv";
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      /* fall through */
    }
  }
  const plain = /filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i.exec(header);
  return (plain?.[1] ?? plain?.[2] ?? "beroya-report.csv").trim();
}

async function downloadCsv(query: Record<string, string>) {
  const session = readSession();
  const params = new URLSearchParams({ ...query, lang: getDeskLocale() });
  const response = await fetch(`/api/proxy/api/v1/go/erp/reports/export?${params}`, {
    headers: {
      Accept: "text/csv; charset=utf-8",
      ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(t("تعذّر تصدير الملف."));
  const blob = await response.blob();
  const filename = filenameFromDisposition(response.headers.get("Content-Disposition"));
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ReportsScreen() {
  const { branchId, setBranchId } = useDesk();
  const branches = useGoList("/erp/branches", { limit: 100 }, false);
  const [period, setPeriod] = useState<Period>("7d");
  const today = toDateInput(new Date());
  const weekAgo = toDateInput(new Date(Date.now() - 7 * 24 * 3600 * 1000));
  const [fromDate, setFromDate] = useState(weekAgo);
  const [toDate, setToDate] = useState(today);
  const [exporting, setExporting] = useState<"overview" | "drivers" | null>(null);
  const [exportFault, setExportFault] = useState<string | null>(null);

  const query = useMemo(() => {
    const window = windowFor(period, fromDate, toDate);
    return {
      from: window.from,
      to: window.to,
      ...(branchId ? { branch_id: branchId } : {}),
    };
  }, [period, fromDate, toDate, branchId]);

  const overview = useQuery({
    queryKey: ["go", "/erp/reports/overview", query],
    queryFn: () => go<Overview>("/erp/reports/overview", { query }),
  });
  const coverage = useQuery({
    queryKey: ["go", "/erp/reports/coverage", query],
    queryFn: () => go<Coverage>("/erp/reports/coverage", { query }),
  });
  const drivers = useQuery({
    queryKey: ["go", "/erp/reports/drivers", query],
    queryFn: () => go<DriversReport>("/erp/reports/drivers", { query: { ...query, limit: 50 } }),
  });

  async function onExport(kind: "overview" | "drivers") {
    setExportFault(null);
    setExporting(kind);
    try {
      await downloadCsv({ ...query, kind });
    } catch (error) {
      setExportFault(error instanceof Error ? error.message : t("تعذّر تصدير الملف."));
    } finally {
      setExporting(null);
    }
  }

  const periodChips: { value: Period; label: string }[] = [
    { value: "7d", label: t("٧ أيام") },
    { value: "30d", label: t("٣٠ يوماً") },
    { value: "90d", label: t("٩٠ يوماً") },
    { value: "custom", label: t("مخصص") },
  ];

  const data = overview.data;
  const series = data?.series.points ?? [];
  const cancelSlices: Slice[] = data
    ? [
        { key: "customer", label: t("عميل"), value: data.period.cancelled_by_customer, color: "var(--warning)" },
        { key: "driver", label: t("سائق"), value: data.period.cancelled_by_driver, color: "var(--danger)" },
        { key: "staff", label: t("موظف"), value: data.period.cancelled_by_staff, color: "var(--teal)" },
        { key: "unserved", label: t("بدون سائق"), value: data.period.unserved, color: "var(--muted)" },
      ].filter((s) => s.value > 0)
    : [];
  const offerSlices: Slice[] = data
    ? [
        { key: "accepted", label: t("مقبولة"), value: data.acceptance.accepted, color: "var(--success)" },
        { key: "declined", label: t("مرفوضة"), value: data.acceptance.declined, color: "var(--danger)" },
        { key: "expired", label: t("منتهية"), value: data.acceptance.expired, color: "var(--warning)" },
      ].filter((s) => s.value > 0)
    : [];

  const driverRows = drivers.data?.items ?? [];
  const maxCompleted = Math.max(1, ...driverRows.map((row) => row.completed));

  return (
    <div className="grid gap-5">
      <PageTitle
        title={t("التقارير التشغيلية")}
        hint={t("لوحة تحليلات حية للإلغاءات ووقت التعيين والتغطية وأداء السائقين.")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btnGhostSm} disabled={!!exporting} onClick={() => void onExport("overview")}>
              <Icon node={Download} size={14} />
              {exporting === "overview" ? t("جارٍ التصدير…") : t("تصدير نظرة عامة")}
            </button>
            <button type="button" className={btnGhostSm} disabled={!!exporting} onClick={() => void onExport("drivers")}>
              <Icon node={Download} size={14} />
              {exporting === "drivers" ? t("جارٍ التصدير…") : t("تصدير السائقين")}
            </button>
          </div>
        }
      />

      <Panel className="grid gap-4 !rounded-2xl bg-gradient-to-br from-surface via-surface to-brand/[0.04]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className={chipGroup}>
            {periodChips.map((chip) => (
              <button
                key={chip.value}
                type="button"
                className={`${chipClass} ${period === chip.value ? chipActive : ""}`}
                onClick={() => setPeriod(chip.value)}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <div className="min-w-56 flex-1 sm:max-w-xs">
            <ChoiceSelect
              value={branchId ?? ""}
              onValueChange={(value) => setBranchId(value || null)}
              emptyLabel={t("كل الفروع")}
              placeholder={t("الفرع")}
              options={(branches.data ?? []).map((row) => ({ value: String(row.id), label: headline(row) }))}
            />
          </div>
        </div>
        {period === "custom" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField
              label={t("من")}
              value={fromDate}
              onValueChange={(next) => {
                const day = next.slice(0, 10);
                setFromDate(day && day > toDate ? toDate : day);
              }}
            />
            <DateField
              label={t("إلى")}
              value={toDate}
              onValueChange={(next) => {
                const day = next.slice(0, 10);
                if (!day) return;
                setToDate(day < fromDate ? fromDate : day > today ? today : day);
              }}
            />
          </div>
        ) : null}
        {data ? <ReportWindowBar from={data.window.from} to={data.window.to} timezone={data.timezone} /> : null}
        {exportFault ? <Notice>{exportFault}</Notice> : null}
      </Panel>

      <StateView loading={overview.isLoading} error={overview.error} bare>
        {data ? (
          <div className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label={t("الطلبات")}
                value={fmtNumber(data.period.requests)}
                hint={`${t("مكتملة")}: ${fmtNumber(data.period.completed)} · ${fmtPct(data.period.completion_rate_pct)}`}
                icon={<Icon node={Activity} size={18} />}
                spark={series.map((p) => p.requests)}
                sparkColor="var(--brand)"
                tone="brand"
              />
              <KpiCard
                label={t("نسبة الإلغاء")}
                value={fmtPct(data.period.cancellation_rate_pct)}
                hint={`${t("ملغاة")}: ${fmtNumber(data.period.cancelled)} / ${fmtNumber(data.period.finished)}`}
                icon={<Icon node={TrendingUp} size={18} />}
                spark={series.map((p) => p.cancelled)}
                sparkColor="var(--danger)"
                tone="danger"
              />
              <KpiCard
                label={t("متوسط التعيين")}
                value={fmtSec(data.period.avg_assignment_sec)}
                hint={`p50 ${fmtSec(data.period.p50_assignment_sec)} · p90 ${fmtSec(data.period.p90_assignment_sec)}`}
                icon={<Icon node={Clock3} size={18} />}
                tone="teal"
              />
              <KpiCard
                label={t("قبول العروض")}
                value={fmtPct(data.acceptance.rate_pct)}
                hint={`${fmtNumber(data.acceptance.accepted)} ${t("مقبولة")} · ${fmtNumber(data.acceptance.declined)} ${t("مرفوضة")}`}
                icon={<Icon node={Target} size={18} />}
                tone="success"
              />
            </div>

            <Panel flush className="!rounded-2xl overflow-hidden">
              <PanelHeader
                title={t("حركة الطلبات")}
                hint={data.series.unit === "hour" ? t("تجميع بالساعة") : t("تجميع باليوم")}
              />
              <div className="p-5 pt-3">
                <TrendChart points={series} unit={data.series.unit} />
              </div>
            </Panel>

            <div className="grid gap-5 xl:grid-cols-2">
              <Panel flush className="!rounded-2xl overflow-hidden">
                <PanelHeader title={t("توزيع الإلغاءات")} hint={t("حسب الطرف + بدون سائق")} />
                <div className="p-5">
                  <DonutChart
                    slices={cancelSlices}
                    centerLabel={t("إجمالي")}
                    centerValue={fmtNumber(data.period.cancelled + data.period.unserved)}
                  />
                </div>
              </Panel>

              <Panel flush className="!rounded-2xl overflow-hidden">
                <PanelHeader title={t("نتائج العروض")} hint={t("قبول · رفض · انتهاء")} />
                <div className="p-5">
                  <DonutChart
                    slices={offerSlices}
                    centerLabel={t("نسبة القبول")}
                    centerValue={fmtPct(data.acceptance.rate_pct)}
                  />
                </div>
              </Panel>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <Panel flush className="!rounded-2xl overflow-hidden">
                <PanelHeader title={t("وقت التعيين")} hint={t("ثوانٍ للرحلات الفورية")} />
                <div className="p-5">
                  <MetricBars
                    items={[
                      {
                        label: t("المتوسط"),
                        value: data.period.avg_assignment_sec,
                        display: fmtSec(data.period.avg_assignment_sec),
                        tone: "bg-gradient-to-l from-brand to-teal",
                      },
                      {
                        label: "p50",
                        value: data.period.p50_assignment_sec,
                        display: fmtSec(data.period.p50_assignment_sec),
                        tone: "bg-teal",
                      },
                      {
                        label: "p90",
                        value: data.period.p90_assignment_sec,
                        display: fmtSec(data.period.p90_assignment_sec),
                        tone: "bg-warning",
                      },
                    ]}
                  />
                  <p className="mt-4 text-xs text-muted">
                    {t("عينات التعيين")}: <span className="font-semibold text-heading">{fmtNumber(data.period.assignment_samples)}</span>
                  </p>
                </div>
              </Panel>

              <Panel flush className="!rounded-2xl overflow-hidden">
                <PanelHeader title={t("التغطية والجاهزية")} hint={t("تنبيهات وساعات الاتصال")} />
                <div className="p-5">
                  <StateView loading={coverage.isLoading} error={coverage.error} bare>
                    {coverage.data ? (
                      <div className="grid gap-4">
                        <div className="grid grid-cols-2 gap-3">
                          <MiniStat
                            icon={<Icon node={RadioTower} size={16} />}
                            label={t("تنبيهات نقص التغطية")}
                            value={fmtNumber(coverage.data.coverage_alert_count)}
                          />
                          <MiniStat
                            icon={<Icon node={Activity} size={16} />}
                            label={t("مفتوحة الآن")}
                            value={fmtNumber(coverage.data.coverage_alerts_open_now)}
                            warn={coverage.data.coverage_alerts_open_now > 0}
                          />
                          <MiniStat
                            icon={<Icon node={Clock3} size={16} />}
                            label={t("ساعات أونلاين")}
                            value={fmtNumber(coverage.data.driver_online_hours)}
                          />
                          <MiniStat
                            icon={<Icon node={Users} size={16} />}
                            label={t("جلسات الاتصال")}
                            value={fmtNumber(coverage.data.online_sessions)}
                          />
                        </div>
                        {coverage.data.alerts_in_window.length > 0 ? (
                          <HBarChart
                            rows={coverage.data.alerts_in_window
                              .slice()
                              .sort((a, b) => b.count - a.count)
                              .slice(0, 5)
                              .map((a) => ({
                                key: `${a.type}-${a.severity}`,
                                label: `${enumLabel(a.type)} · ${enumLabel(a.severity)}`,
                                value: a.count,
                                color:
                                  a.severity === "CRITICAL"
                                    ? "var(--danger)"
                                    : a.severity === "WARNING"
                                      ? "var(--warning)"
                                      : "var(--teal)",
                              }))}
                          />
                        ) : (
                          <p className="text-sm text-muted">{t("لا تنبيهات تشغيلية في هذه النافذة.")}</p>
                        )}
                      </div>
                    ) : null}
                  </StateView>
                </div>
              </Panel>
            </div>

            <Panel flush className="!rounded-2xl overflow-hidden">
              <PanelHeader title={t("أداء السائقين")} hint={t("مرتّبون حسب الرحلات المكتملة في النافذة")} />
              <StateView
                loading={drivers.isLoading}
                error={drivers.error}
                empty={!drivers.isLoading && driverRows.length === 0}
                bare
              >
                <DriversLeaderboard rows={driverRows} maxCompleted={maxCompleted} />
              </StateView>
            </Panel>
          </div>
        ) : null}
      </StateView>
    </div>
  );
}

function rankTone(rank: number) {
  if (rank === 1) return "bg-warning/20 text-warning-ink ring-warning/35";
  if (rank === 2) return "bg-heading/[0.08] text-heading ring-line";
  if (rank === 3) return "bg-brand/15 text-accent ring-brand/30";
  return "bg-heading/[0.04] text-muted ring-line/80";
}

function driverInitial(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.slice(0, 1).toLocaleUpperCase(localeTag());
}

function DriversLeaderboard({
  rows,
  maxCompleted,
}: {
  rows: DriversReport["items"];
  maxCompleted: number;
}) {
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <div className="grid gap-0">
      {podium.length > 0 ? (
        <div className="grid gap-3 border-b border-line bg-gradient-to-b from-brand/[0.05] to-transparent p-5 sm:grid-cols-3">
          {podium.map((row, index) => {
            const rank = index + 1;
            const name = row.full_name?.trim() || row.phone || row.driver_id;
            const offers = row.accepted + row.declined + row.expired;
            return (
              <Link
                key={row.driver_id}
                href={`/admin/drivers/${row.driver_id}`}
                className="group relative overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:border-brand/40 hover:bg-brand/[0.03]"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={`grid size-8 place-items-center rounded-full text-sm font-semibold tabular-nums ring-1 ring-inset ${rankTone(rank)}`}>
                    {rank}
                  </span>
                  <span className="grid size-10 place-items-center rounded-xl bg-heading/[0.05] text-sm font-semibold text-heading ring-1 ring-inset ring-line">
                    {driverInitial(name)}
                  </span>
                </div>
                <p className="mt-3 truncate text-sm font-semibold text-heading group-hover:text-accent">{name}</p>
                {row.phone ? <p className="phone-ltr mt-0.5 truncate text-xs tabular-nums text-muted" dir="ltr" data-phone="">{row.phone}</p> : null}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[10px] font-medium text-muted">{t("مكتملة")}</p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums text-heading">{fmtNumber(row.completed)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-muted">{t("قبول")}</p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums text-heading">{fmtPct(row.accept_rate_pct)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-muted">{t("تقييم")}</p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums text-heading">
                      {row.avg_stars == null ? "—" : fmtNumber(row.avg_stars)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-heading/[0.06] ring-1 ring-inset ring-line">
                  <div
                    className="h-full rounded-full bg-gradient-to-l from-brand to-teal transition-all duration-500"
                    style={{ width: `${clamp((row.completed / maxCompleted) * 100, row.completed > 0 ? 6 : 0, 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  {fmtNumber(row.cancelled_by_driver)} {t("إلغاء")} · {fmtNumber(offers)} {t("عرض")}
                </p>
              </Link>
            );
          })}
        </div>
      ) : null}

      {rest.length > 0 || podium.length === 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-line bg-heading/[0.03] text-xs text-muted">
                <th className="w-12 px-4 py-3 text-start font-medium">#</th>
                <th className="px-3 py-3 text-start font-medium">{t("السائق")}</th>
                <th className="px-3 py-3 text-start font-medium">{t("مكتملة")}</th>
                <th className="px-3 py-3 text-start font-medium">{t("إلغاء سائق")}</th>
                <th className="px-3 py-3 text-start font-medium">{t("قبول العروض")}</th>
                <th className="px-3 py-3 text-start font-medium">{t("التقييم")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(podium.length === 0 ? rows : rest).map((row, index) => {
                const rank = podium.length === 0 ? index + 1 : index + 4;
                const name = row.full_name?.trim() || row.phone || row.driver_id;
                const offers = row.accepted + row.declined + row.expired;
                return (
                  <tr key={row.driver_id} className="transition hover:bg-heading/[0.025]">
                    <td className="px-4 py-3">
                      <span className={`grid size-7 place-items-center rounded-full text-xs font-semibold tabular-nums ring-1 ring-inset ${rankTone(rank)}`}>
                        {rank}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-heading/[0.05] text-xs font-semibold text-heading ring-1 ring-inset ring-line">
                          {driverInitial(name)}
                        </span>
                        <div className="min-w-0">
                          <Link href={`/admin/drivers/${row.driver_id}`} className="block truncate font-medium text-heading hover:text-accent">
                            {name}
                          </Link>
                          {row.phone ? <p className="phone-ltr truncate text-xs tabular-nums text-muted" dir="ltr" data-phone="">{row.phone}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="grid min-w-[7rem] gap-1.5">
                        <span className="font-semibold tabular-nums text-heading">{fmtNumber(row.completed)}</span>
                        <div className="h-1 overflow-hidden rounded-full bg-heading/[0.06]">
                          <div
                            className="h-full rounded-full bg-teal/80"
                            style={{ width: `${clamp((row.completed / maxCompleted) * 100, row.completed > 0 ? 4 : 0, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-body">{fmtNumber(row.cancelled_by_driver)}</td>
                    <td className="px-3 py-3">
                      <div className="grid min-w-[6.5rem] gap-1">
                        <span className="font-medium tabular-nums text-heading">{fmtPct(row.accept_rate_pct)}</span>
                        <span className="text-[11px] tabular-nums text-muted">
                          {fmtNumber(row.accepted)}/{fmtNumber(offers)}
                        </span>
                        <div className="h-1 overflow-hidden rounded-full bg-heading/[0.06]">
                          <div
                            className="h-full rounded-full bg-success/80"
                            style={{
                              width: `${clamp(row.accept_rate_pct ?? 0, row.accept_rate_pct ? 4 : 0, 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-medium tabular-nums text-heading">
                        {row.avg_stars == null ? "—" : fmtNumber(row.avg_stars)}
                      </span>
                      <span className="ms-1.5 text-xs tabular-nums text-muted">({fmtNumber(row.rating_count)})</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  warn = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className={`rounded-xl border px-3 py-3 ${warn ? "border-warning/40 bg-warning/[0.08]" : "border-line bg-heading/[0.03]"}`}>
      <div className="flex items-center gap-2 text-muted">
        <span className={warn ? "text-warning-ink" : "text-accent"}>{icon}</span>
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums text-heading">{value}</p>
    </div>
  );
}
