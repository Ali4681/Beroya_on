"use client";

import { useQuery } from "@tanstack/react-query";
import { Banknote, Download, Gift, HandCoins, Percent, Scale, TrendingUp, Wallet } from "lucide";
import Link from "next/link";
import { useId, useMemo, useState, type ReactNode } from "react";

import { DateField } from "@/features/desk/controls";
import { useDesk } from "@/features/desk/desk-context";
import { go } from "@/features/desk/go-api";
import { useGoList } from "@/features/desk/hooks";
import { getDeskLocale, localeTag, t } from "@/features/desk/i18n/t";
import { formatMoney, formatNumber, headline } from "@/features/desk/present";
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

type Period = "7d" | "30d" | "custom";

type FinancePoint = {
  bucket: string;
  gross_fares: number;
  rides: number;
  commission: number;
  penalties: number;
  incentives: number;
};

type FinanceData = {
  generated_at: string;
  timezone: string;
  branch_id: string | null;
  window: { from: string; to: string };
  ride_fares: {
    completed_rides: number;
    gross_fares: number;
    discounts: number;
    compensations_on_fares: number;
    customer_payable: number;
  };
  company_revenue: {
    commission_collected: number;
    commission_reversed: number;
    net_commission: number;
    commission_transactions: number;
    driver_cancel_penalties: number;
    total: number;
  };
  company_costs: {
    incentives_paid: number;
    incentive_transactions: number;
    compensation_borne_by_beroya: number;
    total: number;
  };
  result: { contribution: number; take_rate_pct: number | null };
  compensations: {
    total_applied: number;
    count: number;
    unallocated: number;
    driver_borne: number;
  };
  driver_wallet_movements: { top_ups: number; pos_recharges: number; adjustments: number };
  customer_wallet_movements: { ride_payments: number; ride_refunds: number; top_ups: number } | null;
  balances_now: {
    driver_prepaid_balance: number;
    driver_wallets: number;
    driver_outstanding_due: number;
    customer_wallet_balance: number | null;
  };
  series: { unit: string; timezone: string; points: FinancePoint[] };
  top_commission_drivers: {
    driver_id: string;
    full_name: string | null;
    phone: string | null;
    commission: number;
    tx_count: number;
  }[];
};

type Slice = { key: string; label: string; value: number; color: string };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toDateInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function windowFor(period: Period, fromDate: string, toDate: string) {
  const now = new Date();
  if (period === "custom") {
    return {
      from: new Date(`${fromDate}T00:00:00`).toISOString(),
      to: new Date(`${toDate}T23:59:59.999`).toISOString(),
    };
  }
  const days = period === "30d" ? 30 : 7;
  return { from: new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString(), to: now.toISOString() };
}

function fmtPct(value: number | null | undefined) {
  if (value == null) return "—";
  return `${new Intl.NumberFormat(localeTag(), { maximumFractionDigits: 1 }).format(value)}%`;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function smoothPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function bucketLabel(bucket: string, unit: string) {
  const date = new Date(bucket.includes("T") ? `${bucket}:00Z` : `${bucket}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return bucket.slice(5, 16);
  if (unit === "hour") {
    return new Intl.DateTimeFormat(localeTag(), { month: "short", day: "numeric", hour: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat(localeTag(), { month: "short", day: "numeric" }).format(date);
}

function filenameFromDisposition(header: string | null) {
  if (!header) return "beroya-finance.csv";
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      /* fall through */
    }
  }
  const plain = /filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i.exec(header);
  return (plain?.[1] ?? plain?.[2] ?? "beroya-finance.csv").trim();
}

async function downloadCsv(query: Record<string, string>) {
  const session = readSession();
  const params = new URLSearchParams({ ...query, lang: getDeskLocale() });
  const response = await fetch(`/api/proxy/api/v1/go/erp/finance/performance/export?${params}`, {
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

function KpiCard({
  label,
  value,
  unit,
  hint,
  explain,
  icon,
  tone = "teal",
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  explain?: string;
  icon: ReactNode;
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
      </div>

      <div className="mt-4 rounded-xl bg-surface/80 px-3 py-2.5 ring-1 ring-inset ring-line/70">
        <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className={`text-[1.375rem] font-semibold leading-[1.5] tabular-nums ${skin.ink}`}>{value}</span>
          {unit ? <span className="text-sm font-semibold text-muted">{unit}</span> : null}
        </p>
      </div>

      {hint || explain ? (
        <div className="mt-3 space-y-1">
          {hint ? <p className="text-[11px] leading-5 text-muted">{hint}</p> : null}
          {explain ? <p className="text-[11px] leading-5 text-body">{explain}</p> : null}
        </div>
      ) : null}
    </article>
  );
}

function DonutChart({ slices, centerLabel, centerValue }: { slices: Slice[]; centerLabel: string; centerValue: string }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const size = 196;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  if (total <= 0) return <p className="grid h-48 place-items-center text-sm text-muted">{t("لا بيانات في هذه الفترة.")}</p>;
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
                className="transition-all duration-500"
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-xl font-semibold tabular-nums text-heading">{centerValue}</p>
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
                {formatMoney(slice.value)}
                <span className="ms-1.5 text-xs font-medium text-muted">{fmtPct(pct)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CashflowChart({ points, unit }: { points: FinancePoint[]; unit: string }) {
  const uid = useId().replace(/:/g, "");
  const data =
    points.length > 48
      ? points.filter((_, i) => i % Math.ceil(points.length / 48) === 0 || i === points.length - 1)
      : points;
  const hasMoney = data.some((p) => p.commission > 0 || p.penalties > 0 || p.incentives > 0);
  if (data.length === 0 || !hasMoney) {
    return <p className="grid h-64 place-items-center text-sm text-muted">{t("لا بيانات في هذه الفترة.")}</p>;
  }

  const width = 720;
  const height = 260;
  const padL = 44;
  const padR = 16;
  const padT = 18;
  const padB = 36;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const maxY = Math.max(1, ...data.map((p) => Math.max(p.commission + p.penalties, p.incentives)));
  const coords = (pick: (p: FinancePoint) => number) =>
    data.map((p, i) => ({
      x: padL + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW),
      y: padT + innerH - (pick(p) / maxY) * innerH,
    }));
  const revenue = coords((p) => p.commission + p.penalties);
  const costs = coords((p) => p.incentives);
  const grid = [0, 0.5, 1].map((f) => ({
    y: padT + innerH * (1 - f),
    label: Math.round(maxY * f),
  }));
  const xTicks =
    data.length <= 8
      ? data.map((p, i) => ({ i, label: bucketLabel(p.bucket, unit) }))
      : [0, Math.floor((data.length - 1) / 2), data.length - 1].map((i) => ({
          i,
          label: bucketLabel(data[i].bucket, unit),
        }));

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <span className="inline-flex items-center gap-2 text-muted">
          <span className="size-2.5 rounded-full bg-success" />
          <span className="font-medium text-heading">{t("إيراد الشركة")}</span>
        </span>
        <span className="inline-flex items-center gap-2 text-muted">
          <span className="size-2.5 rounded-full bg-danger" />
          <span className="font-medium text-heading">{t("تكاليف الشركة")}</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full overflow-visible" role="img" aria-label={t("التدفق النقدي")}>
        <defs>
          <linearGradient id={`rev-${uid}`} x1="0" y1="0" x2="0" y2="1">
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
        <path
          d={`${smoothPath(revenue)} L ${revenue[revenue.length - 1]?.x ?? padL} ${padT + innerH} L ${revenue[0]?.x ?? padL} ${padT + innerH} Z`}
          fill={`url(#rev-${uid})`}
        />
        <path d={smoothPath(revenue)} fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" />
        <path d={smoothPath(costs)} fill="none" stroke="var(--danger)" strokeWidth="2.25" strokeLinecap="round" strokeDasharray="5 4" />
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

function StackedBars({ points, unit }: { points: FinancePoint[]; unit: string }) {
  const data = points.length > 14 ? points.slice(-14) : points;
  const hasMoney = data.some((p) => p.commission > 0 || p.penalties > 0 || p.incentives > 0);
  if (data.length === 0 || !hasMoney) {
    return <p className="grid h-40 place-items-center text-sm text-muted">{t("لا بيانات في هذه الفترة.")}</p>;
  }
  const width = 720;
  const height = 220;
  const padL = 44;
  const padB = 32;
  const padT = 12;
  const innerW = width - padL - 12;
  const innerH = height - padT - padB;
  const maxY = Math.max(1, ...data.map((p) => p.commission + p.penalties + p.incentives));
  const gap = 8;
  const barW = Math.max(8, (innerW - gap * (data.length - 1)) / data.length);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-4 text-xs">
        <Legend color="var(--success)" label={t("صافي العمولة")} />
        <Legend color="var(--teal)" label={t("غرامات إلغاء السائقين")} />
        <Legend color="var(--danger)" label={t("حوافز مدفوعة")} />
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={t("تفصيل يومي")}>
        {data.map((point, index) => {
          const x = padL + index * (barW + gap);
          const parts = [
            { v: point.commission, c: "var(--success)" },
            { v: point.penalties, c: "var(--teal)" },
            { v: point.incentives, c: "var(--danger)" },
          ];
          let y = padT + innerH;
          return (
            <g key={point.bucket}>
              {parts.map((part) => {
                const h = (part.v / maxY) * innerH;
                y -= h;
                return <rect key={part.c} x={x} y={y} width={barW} height={Math.max(h, part.v > 0 ? 1.5 : 0)} rx="3" fill={part.c} />;
              })}
              <text x={x + barW / 2} y={height - 10} textAnchor="middle" className="fill-[color:var(--muted)] text-[9px]">
                {bucketLabel(point.bucket, unit)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-muted">
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      <span className="font-medium text-heading">{label}</span>
    </span>
  );
}

function Waterfall({ steps }: { steps: { label: string; value: number; kind: "plus" | "minus" | "total"; explain: string }[] }) {
  const max = Math.max(1, ...steps.map((s) => Math.abs(s.value)));
  return (
    <div className="grid gap-3">
      {steps.map((step) => {
        const tone = step.kind === "minus" ? "bg-danger" : step.kind === "total" ? "bg-brand" : "bg-success";
        return (
          <div key={step.label} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-heading">{step.label}</span>
              <span className="tabular-nums font-semibold text-heading">{formatMoney(step.value)}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-heading/[0.06] ring-1 ring-inset ring-line">
              <div className={`h-full rounded-full ${tone}`} style={{ width: `${clamp((Math.abs(step.value) / max) * 100, step.value !== 0 ? 4 : 0, 100)}%` }} />
            </div>
            <p className="text-[11px] leading-5 text-muted">{step.explain}</p>
          </div>
        );
      })}
    </div>
  );
}

function CompareBars({ rows }: { rows: { label: string; value: number; color: string; explain: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="grid gap-4">
      {rows.map((row) => (
        <div key={row.label} className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium text-heading">{row.label}</span>
            <span className="tabular-nums font-semibold text-heading">{formatMoney(row.value)}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-heading/[0.06] ring-1 ring-inset ring-line">
            <div className="h-full rounded-full" style={{ width: `${clamp((row.value / max) * 100, row.value > 0 ? 4 : 0, 100)}%`, background: row.color }} />
          </div>
          <p className="text-[11px] leading-5 text-muted">{row.explain}</p>
        </div>
      ))}
    </div>
  );
}

function Fact({ label, value, explain }: { label: string; value: string; explain?: string }) {
  return (
    <div className="rounded-xl border border-line bg-heading/[0.03] px-3 py-3">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-heading">{value}</p>
      {explain ? <p className="mt-1 text-[11px] leading-5 text-muted">{explain}</p> : null}
    </div>
  );
}

export function FinancePerformanceScreen() {
  const { branchId, setBranchId } = useDesk();
  const branches = useGoList("/erp/branches", { limit: 100 }, false);
  const [period, setPeriod] = useState<Period>("7d");
  const today = toDateInput(new Date());
  const weekAgo = toDateInput(new Date(Date.now() - 7 * 24 * 3600 * 1000));
  const [fromDate, setFromDate] = useState(weekAgo);
  const [toDate, setToDate] = useState(today);
  const [exporting, setExporting] = useState(false);
  const [exportFault, setExportFault] = useState<string | null>(null);

  const query = useMemo(() => {
    const window = windowFor(period, fromDate, toDate);
    return {
      from: window.from,
      to: window.to,
      ...(branchId ? { branch_id: branchId } : {}),
    };
  }, [period, fromDate, toDate, branchId]);

  const finance = useQuery({
    queryKey: ["go", "/erp/finance/performance", query],
    queryFn: () => go<FinanceData>("/erp/finance/performance", { query }),
  });

  async function onExport() {
    setExportFault(null);
    setExporting(true);
    try {
      await downloadCsv(query);
    } catch (error) {
      setExportFault(error instanceof Error ? error.message : t("تعذّر تصدير الملف."));
    } finally {
      setExporting(false);
    }
  }

  const data = finance.data;
  const mixSlices: Slice[] = data
    ? [
        { key: "commission", label: t("صافي العمولة"), value: Math.max(0, data.company_revenue.net_commission), color: "var(--success)" },
        { key: "penalties", label: t("غرامات إلغاء السائقين"), value: Math.max(0, data.company_revenue.driver_cancel_penalties), color: "var(--teal)" },
        { key: "incentives", label: t("حوافز مدفوعة"), value: Math.max(0, data.company_costs.incentives_paid), color: "var(--danger)" },
        {
          key: "comp",
          label: t("تعويضات تتحملها الشركة"),
          value: Math.max(0, data.company_costs.compensation_borne_by_beroya),
          color: "var(--warning)",
        },
      ].filter((s) => s.value > 0)
    : [];

  const maxCommission = Math.max(1, ...(data?.top_commission_drivers.map((d) => d.commission) ?? [1]));

  return (
    <div className="grid gap-5">
      <PageTitle
        title={t("الأداء المالي")}
        hint={t("إيراد الشركة من العمولة والغرامات، مطروحاً منه الحوافز والتعويضات. إجمالي أجور الرحلات ليس ربحاً للشركة.")}
        action={
          <button type="button" className={btnGhostSm} disabled={exporting} onClick={() => void onExport()}>
            <Icon node={Download} size={14} />
            {exporting ? t("جارٍ التصدير…") : t("تصدير الأداء المالي")}
          </button>
        }
      />

      <Panel className="grid gap-4 !rounded-2xl bg-gradient-to-br from-surface via-surface to-brand/[0.04]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className={chipGroup}>
            {(
              [
                { value: "7d" as const, label: t("٧ أيام") },
                { value: "30d" as const, label: t("٣٠ يوماً") },
                { value: "custom" as const, label: t("مخصص") },
              ] as const
            ).map((chip) => (
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

      <StateView loading={finance.isLoading} error={finance.error} bare>
        {data ? (
          <div className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <KpiCard
                label={t("صافي المساهمة")}
                value={formatNumber(data.result.contribution)}
                unit={t("ل.س")}
                hint={`${t("إيراد")} ${formatMoney(data.company_revenue.total)} − ${t("تكاليف")} ${formatMoney(data.company_costs.total)}`}
                explain={t("ما يبقى للشركة بعد العمولة والغرامات مطروحاً منها الحوافز والتعويضات التي تتحملها.")}
                icon={<Icon node={Scale} size={18} />}
                tone={data.result.contribution >= 0 ? "success" : "danger"}
              />
              <KpiCard
                label={t("صافي العمولة")}
                value={formatNumber(data.company_revenue.net_commission)}
                unit={t("ل.س")}
                hint={`${t("محصّلة")} ${formatMoney(data.company_revenue.commission_collected)} · ${t("مُعادة")} ${formatMoney(data.company_revenue.commission_reversed)}`}
                explain={t("نسبة تُخصم من محفظة السائق عند إكمال الرحلة. الإعادة تعني عكس خصم سابق.")}
                icon={<Icon node={Banknote} size={18} />}
                tone="success"
              />
              <KpiCard
                label={t("غرامات إلغاء السائقين")}
                value={formatNumber(data.company_revenue.driver_cancel_penalties)}
                unit={t("ل.س")}
                explain={t("مبلغ ثابت يُخصم من محفظة السائق إذا ألغى رحلة بعد إسنادها. يُحسب إيراداً للشركة.")}
                icon={<Icon node={HandCoins} size={18} />}
                tone="teal"
              />
              <KpiCard
                label={t("حوافز مدفوعة")}
                value={formatNumber(data.company_costs.incentives_paid)}
                unit={t("ل.س")}
                hint={`${data.company_costs.incentive_transactions} ${t("دفعة")}`}
                explain={t("مكافآت تدفعها الشركة للسائق (سلسلة، حملة، طلب مرفوض). تكلفة وليست خصماً من الزبون.")}
                icon={<Icon node={Gift} size={18} />}
                tone="danger"
              />
              <KpiCard
                label={t("تعويضات تتحملها الشركة")}
                value={formatNumber(data.company_costs.compensation_borne_by_beroya)}
                unit={t("ل.س")}
                explain={t("جزء التعويض الذي تحمّلته بيرويا للزبون، وليس ما حُمّل على السائق.")}
                icon={<Icon node={Wallet} size={18} />}
                tone="warning"
              />
              <KpiCard
                label={t("نسبة العمولة من الأجور")}
                value={fmtPct(data.result.take_rate_pct)}
                hint={`${t("رحلات مكتملة")}: ${data.ride_fares.completed_rides}`}
                explain={t("صافي العمولة ÷ إجمالي أجور الرحلات المكتملة. الأجور نفسها تبقى للسائق بعد العمولة.")}
                icon={<Icon node={Percent} size={18} />}
                tone="brand"
              />
            </div>

            <Panel flush className="!rounded-2xl overflow-hidden">
              <PanelHeader title={t("كيف يُحسب الرقم")} hint={t("كل سطر يشرح أثره على صافي المساهمة")} />
              <div className="p-5">
                <Waterfall
                  steps={[
                    {
                      label: t("صافي العمولة"),
                      value: data.company_revenue.net_commission,
                      kind: "plus",
                      explain: t("يُضاف: ما خُصم من السائقين ناقص ما أُعيد إليهم."),
                    },
                    {
                      label: t("غرامات إلغاء السائقين"),
                      value: data.company_revenue.driver_cancel_penalties,
                      kind: "plus",
                      explain: t("يُضاف: غرامات الإلغاء المحصّلة في النافذة."),
                    },
                    {
                      label: t("حوافز مدفوعة"),
                      value: -data.company_costs.incentives_paid,
                      kind: "minus",
                      explain: t("يُطرح: مكافآت خرجت من الشركة إلى محافظ السائقين."),
                    },
                    {
                      label: t("تعويضات تتحملها الشركة"),
                      value: -data.company_costs.compensation_borne_by_beroya,
                      kind: "minus",
                      explain: t("يُطرح: تعويضات سجّلتها المالية على حساب بيرويا."),
                    },
                    {
                      label: t("صافي المساهمة"),
                      value: data.result.contribution,
                      kind: "total",
                      explain: t("الناتج النهائي داخل النظام. لا يشمل رواتب أو إيجار أو مصاريف خارج التطبيق."),
                    },
                  ]}
                />
              </div>
            </Panel>

            <div className="grid gap-5 xl:grid-cols-2">
              <Panel flush className="!rounded-2xl overflow-hidden">
                <PanelHeader
                  title={t("التدفق النقدي")}
                  hint={data.series.unit === "hour" ? t("الخط الأخضر إيراد الشركة والخط الأحمر الحوافز، مجمّع بالساعة.") : t("الخط الأخضر إيراد الشركة والخط الأحمر الحوافز، مجمّع باليوم.")}
                />
                <div className="p-5 pt-3">
                  <CashflowChart points={data.series.points} unit={data.series.unit} />
                </div>
              </Panel>
              <Panel flush className="!rounded-2xl overflow-hidden">
                <PanelHeader title={t("تفصيل يومي")} hint={t("كل عمود يقسم المبلغ إلى عمولة وغرامات وحوافز.")} />
                <div className="p-5 pt-3">
                  <StackedBars points={data.series.points} unit={data.series.unit} />
                </div>
              </Panel>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <Panel flush className="!rounded-2xl overflow-hidden">
                <PanelHeader title={t("مزيج الإيراد والتكاليف")} hint={t("حجم كل بند مقارنةً ببقية البنود في النافذة.")} />
                <div className="p-5">
                  <DonutChart
                    slices={mixSlices}
                    centerLabel={t("صافي المساهمة")}
                    centerValue={formatMoney(data.result.contribution)}
                  />
                </div>
              </Panel>
              <Panel flush className="!rounded-2xl overflow-hidden">
                <PanelHeader title={t("من الأجرة إلى ما يدفعه الزبون")} hint={t("هذه أرقام السوق، وليست ربح الشركة.")} />
                <div className="p-5">
                  <CompareBars
                    rows={[
                      {
                        label: t("إجمالي الأجور (ليس ربحاً)"),
                        value: data.ride_fares.gross_fares,
                        color: "var(--brand)",
                        explain: t("مجموع أجرة الرحلات المكتملة قبل الخصم. يذهب أغلبه للسائق بعد العمولة."),
                      },
                      {
                        label: t("خصومات"),
                        value: data.ride_fares.discounts,
                        color: "var(--warning)",
                        explain: t("تخفيضات أكواد وجواز العميل. تُنقص ما يدفعه الزبون ولا تُحسب إيراداً."),
                      },
                      {
                        label: t("ما دفعه الزبائن"),
                        value: data.ride_fares.customer_payable,
                        color: "var(--teal)",
                        explain: t("المبلغ المستحق على الزبون بعد الخصم والتعويض على الأجرة."),
                      },
                    ]}
                  />
                </div>
              </Panel>
            </div>

            <Panel flush className="!rounded-2xl overflow-hidden">
              <PanelHeader title={t("حجم السوق والأرصدة")} hint={t("أرقام مساندة لفهم الحركة، وليست كلها ربحاً.")} />
              <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
                <Fact label={t("رحلات مكتملة")} value={String(data.ride_fares.completed_rides)} explain={t("عدد الرحلات التي انتهت واكتملت داخل النافذة.")} />
                <Fact label={t("تعويضات مطبّقة")} value={`${formatMoney(data.compensations.total_applied)} (${data.compensations.count})`} explain={t("كل التعويضات المسجّلة، بغض النظر عمّن يتحمّلها.")} />
                <Fact label={t("تعويضات بلا تحميل بعد")} value={formatMoney(data.compensations.unallocated)} explain={t("تعويض أُنشئ ولم تُحدَّد بعد جهة تحمّله.")} />
                <Fact label={t("تعويضات على السائقين")} value={formatMoney(data.compensations.driver_borne)} explain={t("الجزء الذي يُحمَّل على السائق وليس على الشركة.")} />
                <Fact label={t("شحن محافظ السائقين")} value={formatMoney(data.driver_wallet_movements.top_ups)} explain={t("إيداعات أضافها الموظفون. ليست إيراداً؛ هي رصيد مسبق للسائق.")} />
                <Fact label={t("شحن نقاط البيع")} value={formatMoney(data.driver_wallet_movements.pos_recharges)} explain={t("شحن نقدي من المتاجر المعتمدة إلى محفظة السائق.")} />
                <Fact label={t("أرصدة السائقين الآن")} value={formatMoney(data.balances_now.driver_prepaid_balance)} explain={t("رصيد محافظ السائقين الحالي، وليس حركة النافذة فقط.")} />
                <Fact label={t("مستحقات على السائقين")} value={formatMoney(data.balances_now.driver_outstanding_due)} explain={t("عمولة أو غرامة لم يغطِّها الرصيد بعد وتُسوّى عند الشحن التالي.")} />
                <Fact
                  label={t("أرصدة محافظ الزبائن")}
                  value={
                    data.balances_now.customer_wallet_balance == null
                      ? t("غير متاح لفرع واحد")
                      : formatMoney(data.balances_now.customer_wallet_balance)
                  }
                  explain={t("محافظ الزبائن غير مربوطة بفرع، لذلك تظهر فقط عند اختيار كل الفروع.")}
                />
                {data.customer_wallet_movements ? (
                  <Fact label={t("دفعات الزبائن من المحفظة")} value={formatMoney(data.customer_wallet_movements.ride_payments)} explain={t("ما دُفع من محفظة الزبون للرحلات. النقد خارج المحفظة لا يظهر هنا.")} />
                ) : null}
              </div>
            </Panel>

            <Panel flush className="!rounded-2xl overflow-hidden">
              <PanelHeader title={t("أعلى مساهمة بالعمولة")} hint={t("سائقون حققوا أكبر عمولة في النافذة")} />
              <StateView
                bare
                empty={data.top_commission_drivers.length === 0}
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-sm">
                    <thead>
                      <tr className="border-b border-line bg-heading/[0.03] text-xs text-muted">
                        <th className="w-12 px-4 py-3 text-start font-medium">#</th>
                        <th className="px-3 py-3 text-start font-medium">{t("السائق")}</th>
                        <th className="px-3 py-3 text-start font-medium">{t("العمولة")}</th>
                        <th className="px-3 py-3 text-start font-medium">{t("عمليات")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.top_commission_drivers.map((row, index) => {
                        const name = row.full_name?.trim() || row.phone || row.driver_id;
                        return (
                          <tr key={row.driver_id} className="transition hover:bg-heading/[0.025]">
                            <td className="px-4 py-3 tabular-nums text-muted">{index + 1}</td>
                            <td className="px-3 py-3">
                              <Link href={`/admin/drivers/${row.driver_id}`} className="font-medium text-heading hover:text-accent">
                                {name}
                              </Link>
                              {row.phone ? <p className="phone-ltr text-xs tabular-nums text-muted" dir="ltr" data-phone="">{row.phone}</p> : null}
                            </td>
                            <td className="px-3 py-3">
                              <div className="grid min-w-[9rem] gap-1.5">
                                <span className="font-semibold tabular-nums text-heading">{formatMoney(row.commission)}</span>
                                <div className="h-1 overflow-hidden rounded-full bg-heading/[0.06]">
                                  <div
                                    className="h-full rounded-full bg-success/80"
                                    style={{
                                      width: `${clamp((row.commission / maxCommission) * 100, row.commission > 0 ? 4 : 0, 100)}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 tabular-nums text-body">{row.tx_count}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </StateView>
            </Panel>

            <p className="flex items-start gap-2 text-xs text-muted">
              <Icon node={TrendingUp} size={14} className="mt-0.5 shrink-0 text-accent" />
              {t("صافي المساهمة = (صافي العمولة + غرامات الإلغاء) − (الحوافز + تعويضات الشركة). لا يشمل مصاريف تشغيل خارج النظام.")}
            </p>
          </div>
        ) : null}
      </StateView>
    </div>
  );
}
