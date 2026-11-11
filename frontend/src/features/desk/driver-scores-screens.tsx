"use client";

import { t } from "@/features/desk/i18n/t";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { useDesk } from "@/features/desk/desk-context";
import { go } from "@/features/desk/go-api";
import { useGo } from "@/features/desk/hooks";
import { enumLabel, formatMoney } from "@/features/desk/present";
import { btnGhost, chipActive, chipClass, chipGroup, ChipCount, FormCard, inputClass, PageTitle, Panel, StateView, StatusBadge } from "@/features/desk/ui";

type Row = Record<string, unknown>;
type Band = "KEEP" | "WATCH" | "REPLACEABLE";
type Sort = "score" | "rating" | "acceptance_pct" | "online_hours" | "earnings" | "completed" | "cancel_pct";

type ScoresPage = {
  day: string | null;
  days: string[];
  bands: Record<Band, number>;
  items: Row[];
};

type MetricPoints = { value: number | null; points: number | null; weight: number };
type ScoreDetail = {
  window_days: number;
  weights: { bandKeep: number; bandWatch: number };
  live: {
    score: number;
    band: Band;
    breakdown: Record<"rating" | "acceptance" | "hours" | "earnings", MetricPoints> & { cancel: { value: number | null; penalty: number; weight: number } };
    metrics: { ratingsCount: number; offersCount: number; completed: number };
  } | null;
  history: { day: string; score: string | number; band: Band }[];
};

const BANDS: Band[] = ["KEEP", "WATCH", "REPLACEABLE"];

const BAR_TONE: Record<Band, string> = {
  KEEP: "bg-success",
  WATCH: "bg-warning",
  REPLACEABLE: "bg-danger",
};

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function fixed(value: unknown, digits = 1, suffix = "") {
  const n = num(value);
  return n == null ? "—" : `${n.toFixed(digits)}${suffix}`;
}

function driverName(row: Row) {
  const driver = (row.driver ?? {}) as Row;
  const user = (driver.user ?? {}) as Row;
  if (typeof user.full_name === "string" && user.full_name) return user.full_name;
  if (typeof user.phone === "string" && user.phone) {
    return (
      <bdi className="phone-ltr tabular-nums" dir="ltr" data-phone="">
        {user.phone}
      </bdi>
    );
  }
  return "—";
}

function branchName(row: Row) {
  const branch = ((row.driver ?? {}) as Row).branch as Row | null | undefined;
  return branch ? String(branch.name_ar ?? branch.code ?? "") : t("بدون فرع");
}

function ScoreBar({ score, band }: { score: number; band: Band }) {
  return (
    <div className="flex min-w-36 items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-heading/[0.07]">
        <div className={`h-full rounded-full ${BAR_TONE[band]}`} style={{ width: `${Math.min(Math.max(score, 0), 100)}%` }} />
      </div>
      <span className="w-12 text-end text-sm font-semibold tabular-nums text-heading">{score.toFixed(1)}</span>
    </div>
  );
}

const COLUMNS: { key: Sort | null; label: string }[] = [
  { key: null, label: "السائق" },
  { key: null, label: "الفرع" },
  { key: "score", label: "النتيجة" },
  { key: null, label: "التصنيف" },
  { key: "rating", label: "التقييم" },
  { key: "acceptance_pct", label: "القبول" },
  { key: "online_hours", label: "ساعات الاتصال" },
  { key: "earnings", label: "الدخل" },
  { key: "completed", label: "الرحلات" },
  { key: "cancel_pct", label: "الإلغاء" },
];

export function DriverScoresScreen() {
  const call = useGo();
  const { branchId, session } = useDesk();
  const [band, setBand] = useState<Band | "">("");
  const [day, setDay] = useState("");
  const [sort, setSort] = useState<{ key: Sort; order: "asc" | "desc" }>({ key: "score", order: "desc" });
  const query = { branch_id: branchId ?? undefined, band: band || undefined, day: day || undefined, sort: sort.key, order: sort.order };
  const scores = useQuery({
    queryKey: ["go", "/admin/driver-scores", query],
    queryFn: () => go<ScoresPage>("/admin/driver-scores", { query }),
  });
  const data = scores.data;
  const isAdmin = session?.user.role === "ADMIN" || session?.user.role === "SUPER_ADMIN";
  const total = data ? BANDS.reduce((sum, b) => sum + (data.bands[b] ?? 0), 0) : 0;

  function toggle(key: Sort) {
    setSort((current) => (current.key === key ? { key, order: current.order === "desc" ? "asc" : "desc" } : { key, order: key === "cancel_pct" ? "asc" : "desc" }));
  }

  return (
    <div className="grid gap-5">
      <PageTitle
        title={t("تقييم السائقين")}
        hint={t("نتيجة من 100 لكل سائق على آخر أيام نافذة التقييم: تقييم الزبائن، نسبة قبول الطلبات، ساعات الاتصال والدخل مقارنةً بسائقي نفس الفرع. تُحدَّث كل ليلة.")}
        action={
          isAdmin ? (
            <button className={btnGhost} type="button" onClick={() => void call("/admin/driver-scores/recompute", { method: "POST", body: data?.day ? { day: data.day } : {} })}>
              {t("إعادة الحساب بالأوزان الحالية")}
            </button>
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={chipGroup}>
          <button type="button" className={band === "" ? chipActive : chipClass} onClick={() => setBand("")}>
            {t("الكل")} <ChipCount value={total} active={band === ""} />
          </button>
          {BANDS.map((b) => (
            <button key={b} type="button" className={band === b ? chipActive : chipClass} onClick={() => setBand(b)}>
              {enumLabel(b)} <ChipCount value={data?.bands[b] ?? 0} active={band === b} />
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 whitespace-nowrap text-sm text-muted">
          {t("يوم التقييم")}
          <select className={`${inputClass} w-40`} value={day || data?.day || ""} onChange={(event) => setDay(event.target.value)}>
            {(data?.days ?? []).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
      </div>
      <StateView loading={scores.isLoading} error={scores.error} empty={!scores.isLoading && (data?.items ?? []).length === 0}>
        <Panel flush className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-heading/[0.03] text-xs text-muted">
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column.label} className="whitespace-nowrap px-3 py-2.5 text-start font-medium">
                    {column.key ? (
                      <button type="button" className="inline-flex items-center gap-1 hover:text-heading" onClick={() => toggle(column.key!)}>
                        {t(column.label)}
                        {sort.key === column.key ? <span aria-hidden>{sort.order === "desc" ? "↓" : "↑"}</span> : null}
                      </button>
                    ) : (
                      t(column.label)
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(data?.items ?? []).map((row) => {
                const rowBand = String(row.band) as Band;
                return (
                  <tr key={String(row.id)} className="hover:bg-heading/[0.02]">
                    <td className="px-3 py-2.5">
                      <Link className="font-medium text-heading hover:text-accent" href={`/admin/drivers/${String(row.driver_id)}`}>{driverName(row)}</Link>
                    </td>
                    <td className="px-3 py-2.5 text-body">{branchName(row)}</td>
                    <td className="px-3 py-2.5"><ScoreBar score={num(row.score) ?? 0} band={rowBand} /></td>
                    <td className="px-3 py-2.5"><StatusBadge value={rowBand} label={enumLabel(rowBand)} /></td>
                    <td className="px-3 py-2.5 tabular-nums">{row.rating == null ? "—" : `${fixed(row.rating, 2)} ★ (${String(row.ratings_count)})`}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.acceptance_pct == null ? "—" : `${fixed(row.acceptance_pct, 0, "%")} (${String(row.offers_count)})`}</td>
                    <td className="px-3 py-2.5 tabular-nums">{fixed(row.online_hours, 1)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatMoney(num(row.earnings) ?? 0)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{String(row.completed ?? 0)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{fixed(row.cancel_pct, 0, "%")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </StateView>
    </div>
  );
}

const METRICS: { key: "rating" | "acceptance" | "hours" | "earnings"; label: string; value: (v: number) => string }[] = [
  { key: "rating", label: "تقييم الزبائن", value: (v) => `${v.toFixed(2)} ★` },
  { key: "acceptance", label: "قبول الطلبات", value: (v) => `${v.toFixed(0)}%` },
  { key: "hours", label: "ساعات الاتصال", value: (v) => `${v.toFixed(1)} ${t("ساعة")}` },
  { key: "earnings", label: "الدخل", value: (v) => formatMoney(v) },
];

export function DriverScoreCard({ driverId }: { driverId: string }) {
  const detail = useQuery({
    queryKey: ["go", `/admin/driver-scores/${driverId}`],
    queryFn: () => go<ScoreDetail>(`/admin/driver-scores/${driverId}`),
  });
  const live = detail.data?.live;
  const history = (detail.data?.history ?? []).slice(-30);

  return (
    <FormCard
      title={t("تقييم السائق")}
      hint={detail.data ? `${t("آخر")} ${detail.data.window_days} ${t("يوماً حتى الآن. الساعات والدخل مقارنةً بسائقي نفس الفرع.")}` : undefined}
    >
      <StateView bare loading={detail.isLoading} error={detail.error}>
        {live ? (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-4xl font-semibold tabular-nums text-heading">{live.score.toFixed(1)}</span>
              <StatusBadge value={live.band} label={enumLabel(live.band)} />
              <span className="text-xs text-muted">
                {live.metrics.completed} {t("رحلات")} · {live.metrics.offersCount} {t("عروض")} · {live.metrics.ratingsCount} {t("تقييمات")}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {METRICS.map((metric) => {
                const part = live.breakdown[metric.key];
                return (
                  <div key={metric.key} className="rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium text-muted">{t(metric.label)} · {t("الوزن")} {part.weight}</span>
                      <span className="text-sm font-semibold tabular-nums text-heading">{part.points == null ? t("لا بيانات") : part.points.toFixed(0)}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-heading/[0.07]">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${part.points ?? 0}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-body tabular-nums">{part.value == null ? "—" : metric.value(part.value)}</p>
                  </div>
                );
              })}
            </div>
            {live.breakdown.cancel.penalty > 0 ? (
              <p className="text-xs text-danger-ink">
                {t("خصم الإلغاء")}: −{live.breakdown.cancel.penalty.toFixed(1)} ({fixed(live.breakdown.cancel.value, 0, "%")} {t("إلغاء")})
              </p>
            ) : null}
            {history.length ? (
              <div className="grid gap-2">
                <p className="text-xs font-medium text-muted">{t("النتيجة في آخر الأيام")}</p>
                <div className="flex h-16 items-end gap-1 border-b border-line" dir="ltr">
                  {Array.from({ length: 30 - history.length }, (_, i) => (
                    <div key={`empty-${i}`} className="flex-1" />
                  ))}
                  {history.map((point) => {
                    const value = num(point.score) ?? 0;
                    return (
                      <div
                        key={point.day}
                        title={`${point.day}: ${value.toFixed(1)}`}
                        className={`flex-1 rounded-t ${BAR_TONE[point.band] ?? "bg-brand"}`}
                        style={{ height: `${Math.max(value, 3)}%` }}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between text-[11px] text-muted" dir="ltr">
                  <span>{history[0].day}</span>
                  <span>{history[history.length - 1].day}</span>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted">{t("لا توجد بيانات تقييم لهذا السائق بعد.")}</p>
        )}
      </StateView>
    </FormCard>
  );
}
