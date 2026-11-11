"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, RefreshCw } from "lucide";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";

import { ConfirmButton } from "@/features/desk/confirm";
import { useDesk } from "@/features/desk/desk-context";
import { useGo, useGoList, useGoRecord } from "@/features/desk/hooks";
import { go } from "@/features/desk/go-api";
import { localeTag, t } from "@/features/desk/i18n/t";
import { PhoneChangePendingBanner } from "@/features/desk/phone-change-screens";
import { entityName, enumLabel, formatMoney } from "@/features/desk/present";
import { disposeMap, escapeHtml, MAP_OPTIONS, mapAlive, resetHost, themeColor } from "@/features/desk/ride-map";
import type { StaffRole } from "@/features/desk/session";
import { btnGhostSm, btnPrimary, btnPrimarySm, chipActive, chipClass, chipGroup, DeskForm, EmptyState, Field, inputClass, Notice, PageTitle, Panel, PanelHeader, StateView, StatusBadge } from "@/features/desk/ui";
import { cx } from "@/shared/lib/cx";
import { Icon } from "@/shared/ui/icon";

import "leaflet/dist/leaflet.css";

type Period = "1h" | "today" | "7d" | "30d";
type Resolution = 7 | 8;
type MapMode = "observed" | "forecast" | "shortage";
type Layer = "cells" | "drivers" | "rides" | "waiting";
type Selection = { kind: "cell"; id: string } | { kind: "driver"; id: string } | { kind: "ride"; id: string } | null;

type Point = { lat: number; lng: number };

type RadarCell = {
  cell: string;
  center: Point;
  boundary: [number, number][];
  level: "high" | "medium" | "low" | "none";
  heat: number;
  observed: { requests: number; previous_requests: number; trend_pct: number | null; assigned: number; completed: number; unserved: number; cancelled_before_assignment: number; avg_assignment_sec: number | null };
  live: { unassigned: number; available_drivers: number; busy_drivers: number; stale_drivers: number };
  forecast: { expected_requests: number; heat: number } | null;
  shortage: { actual: boolean; forecast: boolean };
};

const HEAT_FALLBACK = ["#c6f6fa", "#7ae6f0", "#22c7d6", "#1f8d99", "#0c4d57"];
const HEAT_LEVELS = [1, 2, 3, 4, 5];
const EMPTY_CELL = "#1f8d99";

type ForecastMeta = { status: "ok" | "insufficient_data"; reason?: "NOT_ENOUGH_HISTORY" | "TOO_FEW_REQUESTS"; weeks_used: number; samples: number; method: string };

type Snapshot = {
  generated_at: string;
  stale_location_seconds: number;
  forecast: ForecastMeta;
  totals: Record<string, number | null>;
  data_quality: { requests_without_location: number; requests_pending_index: number };
  cells: RadarCell[];
};

type DriverPin = { driver_id: string; name: string | null; availability: string; state: "available" | "busy" | "stale"; on_ride: boolean; ride_id: string | null; lat: number; lng: number; last_location_at: string | null; location_age_sec: number | null };

type RidePin = {
  id: string;
  public_number: string;
  status: string;
  type: string;
  created_at: string;
  waiting_sec: number | null;
  pickup: Point;
  destination: Point | null;
  driver_location: (Point & { last_location_at: string | null; stale: boolean }) | null;
};

type Cohort = {
  requests: number;
  completed: number;
  cancelled: number;
  finished: number;
  no_show: number;
  unserved: number;
  completion_rate_pct: number | null;
  cancellation_rate_pct: number | null;
  unserved_rate_pct: number | null;
  avg_assignment_sec: number | null;
  avg_pickup_wait_sec: number | null;
};

type Insight = { code: string; severity: "info" | "warning" | "critical"; recommendation: string; evidence: Record<string, unknown> };

type Summary = {
  generated_at: string;
  timezone: string;
  live: {
    searching_now: number;
    active_rides: number;
    online_drivers: number;
    available_drivers: number;
    stale_location_drivers: number;
    open_alerts: number;
    open_alerts_by_severity: Partial<Record<"CRITICAL" | "WARNING" | "INFO", number>>;
    stale_location_seconds: number;
  };
  period: Cohort;
  previous: Cohort;
  changes: { requests_pct: number | null; completed_pct: number | null; cancellation_rate_pts: number | null; avg_assignment_pct: number | null };
  acceptance: { accepted: number; declined: number; expired: number; rate_pct: number | null };
  series: { unit: "hour" | "day"; points: { bucket: string; requests: number; completed: number; cancelled: number }[] };
  insights: Insight[];
};

const OPS_ROLES: StaffRole[] = ["CUSTOMER_SERVICE", "CUSTOMER_SERVICE_SUPERVISOR", "OPERATIONS", "ADMIN"];
const FINANCE_ROLES: StaffRole[] = ["FINANCE", "ADMIN"];

function hasRole(role: StaffRole | undefined, roles: StaffRole[]) {
  return !!role && (role === "SUPER_ADMIN" || roles.includes(role));
}

function windowOf(period: Period, hourKey: number) {
  if (period === "1h") return {};
  if (period === "today") {
    const start = new Date(hourKey);
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString() };
  }
  const days = period === "7d" ? 7 : 30;
  return { from: new Date(hourKey - days * 86_400_000).toISOString() };
}

function num(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(localeTag(), { maximumFractionDigits: digits }).format(value);
}

function duration(sec: number | null | undefined) {
  if (sec == null || !Number.isFinite(sec)) return "—";
  if (sec < 60) return `${num(sec, 0)} ${t("ث")}`;
  if (sec < 3600) return `${num(sec / 60, 1)} ${t("د")}`;
  return `${num(sec / 3600, 1)} ${t("س")}`;
}

function pct(value: number | null | undefined) {
  return value == null ? "—" : `${num(value)}%`;
}

function ago(iso: string | null | undefined) {
  if (!iso) return "—";
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return `${duration(sec)} ${t("مضت")}`;
}

function useCc<T>(key: unknown[], path: string, query: Record<string, unknown>, opts: { enabled?: boolean; refetch?: number } = {}) {
  return useQuery({
    queryKey: ["cc", ...key, query],
    enabled: opts.enabled ?? true,
    refetchInterval: opts.refetch ?? false,
    queryFn: () => go<T>(path, { query: query as Record<string, string | number | undefined> }),
  });
}

function Delta({ value, unit = "%", goodWhenUp = true }: { value: number | null; unit?: string; goodWhenUp?: boolean }) {
  if (value == null) return <span className="text-xs text-muted">{t("لا مقارنة")}</span>;
  if (value === 0) return <span className="text-xs text-muted">{t("بلا تغيير")}</span>;
  const up = value > 0;
  const good = up === goodWhenUp;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${good ? "text-success-ink" : "text-danger-ink"}`}>
      <Icon node={up ? ArrowUpRight : ArrowDownRight} size={14} />
      {num(Math.abs(value))}
      {unit}
    </span>
  );
}

function Kpi({ label, value, hint, stripe = "bg-brand", children }: { label: string; value: ReactNode; hint?: string; stripe?: string; children?: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface p-4 shadow-card">
      <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${stripe}`} />
      <p className="text-xs font-medium text-muted" title={hint}>{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-heading">{value}</p>
      {children ? <div className="mt-1">{children}</div> : null}
    </div>
  );
}

const PERIODS: { id: Period; label: string }[] = [
  { id: "1h", label: "آخر ساعة" },
  { id: "today", label: "اليوم" },
  { id: "7d", label: "آخر 7 أيام" },
  { id: "30d", label: "آخر 30 يوماً" },
];

export function CommandCenterScreen({ initialCell = null }: { initialCell?: string | null }) {
  const { session, branchId, link } = useDesk();
  const role = session?.user.role;
  const ops = hasRole(role, OPS_ROLES);
  const finance = hasRole(role, FINANCE_ROLES);
  const admin = hasRole(role, ["ADMIN"]);
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>("1h");
  const [hourKey, setHourKey] = useState(() => Math.floor(Date.now() / 3_600_000) * 3_600_000);
  const range = useMemo(() => windowOf(period, hourKey), [period, hourKey]);
  const scope = { branch_id: branchId ?? undefined, ...range };

  useEffect(() => {
    const id = window.setInterval(() => setHourKey(Math.floor(Date.now() / 3_600_000) * 3_600_000), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const summary = useCc<Summary>(["summary"], "/erp/command-center/summary", scope, { enabled: ops, refetch: 60_000 });
  const refreshedAt = summary.data?.generated_at;

  return (
    <div className="grid gap-5">
      <PageTitle
        title={t("مركز القيادة")}
        hint={t("صورة واحدة للتشغيل: الطلب والعرض على الخريطة، المؤشرات مقارنة بالفترة السابقة، التنبيهات، والملخص المالي لمن يملك الصلاحية.")}
        action={
          <>
            {refreshedAt ? <span className="text-xs text-muted">{t("آخر تحديث")} {new Date(refreshedAt).toLocaleTimeString(localeTag())}</span> : null}
            <button type="button" className={btnGhostSm} onClick={() => void queryClient.invalidateQueries({ queryKey: ["cc"] })}>
              <Icon node={RefreshCw} size={14} />
              {t("تحديث")}
            </button>
          </>
        }
      />
      {link !== "online" ? (
        <Notice>{link === "offline" ? t("الاتصال الحي مقطوع. الأرقام المعروضة من آخر تحميل وقد تكون قديمة.") : t("جارٍ إعادة الاتصال الحي. الأرقام قد تتأخر قليلاً.")}</Notice>
      ) : null}
      <div className={chipGroup}>
        {PERIODS.map((item) => (
          <button key={item.id} type="button" className={period === item.id ? chipActive : chipClass} onClick={() => setPeriod(item.id)}>
            {t(item.label)}
          </button>
        ))}
      </div>
      {ops ? (
        <>
          <LiveKpis summary={summary} />
          <PeriodKpis summary={summary} />
          <RadarSection scope={scope} initialCell={initialCell} />
          <BirthdaysTodayPanel />
          <PhoneChangePendingBanner />
          <div className="grid gap-5 xl:grid-cols-2">
            <InsightsPanel summary={summary} />
            <AlertsPanel />
          </div>
          <SeriesPanel summary={summary} />
        </>
      ) : null}
      {finance ? <FinancePanel scope={scope} /> : null}
      {admin ? <ConfigPanel /> : null}
    </div>
  );
}

function LiveKpis({ summary }: { summary: ReturnType<typeof useCc<Summary>> }) {
  const live = summary.data?.live;
  if (summary.isLoading || summary.error) return <StateView loading={summary.isLoading} error={summary.error}>{null}</StateView>;
  if (!live) return null;
  const critical = live.open_alerts_by_severity.CRITICAL ?? 0;
  return (
    <section aria-label={t("الآن")} className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <Kpi label={t("طلبات تبحث عن سائق")} value={num(live.searching_now, 0)} stripe="bg-warning" />
      <Kpi label={t("رحلات نشطة")} value={num(live.active_rides, 0)} />
      <Kpi label={t("سائقون متاحون")} value={num(live.available_drivers, 0)} stripe="bg-success" hint={t("متصل، بلا رحلة، وموقعه حديث.")} />
      <Kpi label={t("سائقون متصلون")} value={num(live.online_drivers, 0)} stripe="bg-teal" />
      <Kpi label={t("مواقع قديمة")} value={num(live.stale_location_drivers, 0)} stripe="bg-heading/30">
        <span className="text-xs text-muted">{t("أقدم من")} {duration(live.stale_location_seconds)}</span>
      </Kpi>
      <Kpi label={t("تنبيهات مفتوحة")} value={num(live.open_alerts, 0)} stripe={critical ? "bg-danger" : "bg-warning"}>
        {critical ? <span className="text-xs font-semibold text-danger-ink">{num(critical, 0)} {t("حرجة")}</span> : null}
      </Kpi>
    </section>
  );
}

function PeriodKpis({ summary }: { summary: ReturnType<typeof useCc<Summary>> }) {
  const data = summary.data;
  if (!data) return null;
  const p = data.period;
  const c = data.changes;
  return (
    <section aria-label={t("الفترة المختارة")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi label={t("الطلبات")} value={num(p.requests, 0)}>
        <Delta value={c.requests_pct} />
      </Kpi>
      <Kpi label={t("رحلات مكتملة")} value={num(p.completed, 0)} stripe="bg-success">
        <Delta value={c.completed_pct} />
      </Kpi>
      <Kpi label={t("نسبة الإلغاء")} value={pct(p.cancellation_rate_pct)} stripe="bg-danger" hint={t("الملغاة ÷ الرحلات المنتهية في الفترة.")}>
        <Delta value={c.cancellation_rate_pts} unit={` ${t("نقطة")}`} goodWhenUp={false} />
      </Kpi>
      <Kpi label={t("بلا سائق")} value={num(p.unserved, 0)} stripe="bg-warning" hint={t("طلبات انتهت دون إيجاد سائق.")}>
        <span className="text-xs text-muted">{pct(p.unserved_rate_pct)}</span>
      </Kpi>
      <Kpi label={t("متوسط زمن الإسناد")} value={duration(p.avg_assignment_sec)} stripe="bg-teal" hint={t("من الطلب حتى قبول السائق، للرحلات الفورية.")}>
        <Delta value={c.avg_assignment_pct} goodWhenUp={false} />
      </Kpi>
      <Kpi label={t("متوسط انتظار الزبون")} value={duration(p.avg_pickup_wait_sec)} stripe="bg-teal" hint={t("من الطلب حتى وصول السائق، للرحلات الفورية.")} />
      <Kpi label={t("قبول العروض")} value={pct(data.acceptance.rate_pct)} hint={t("المقبولة ÷ (المقبولة + المرفوضة + المنتهية).")}>
        <span className="text-xs text-muted">
          {num(data.acceptance.accepted, 0)} / {num(data.acceptance.accepted + data.acceptance.declined + data.acceptance.expired, 0)}
        </span>
      </Kpi>
      <Kpi label={t("رحلات منتهية")} value={num(p.finished, 0)} stripe="bg-heading/30" hint={t("مكتملة + ملغاة + عدم حضور + بلا سائق + متوقفة.")} />
    </section>
  );
}

const MODES: { id: MapMode; label: string }[] = [
  { id: "observed", label: "الطلب المرصود" },
  { id: "forecast", label: "التوقع" },
  { id: "shortage", label: "النقص" },
];

const LAYERS: { id: Layer; label: string }[] = [
  { id: "cells", label: "المناطق" },
  { id: "drivers", label: "السائقون" },
  { id: "rides", label: "الرحلات النشطة" },
  { id: "waiting", label: "طلبات بانتظار" },
];

function RadarSection({ scope, initialCell }: { scope: Record<string, unknown>; initialCell: string | null }) {
  const [resolution, setResolution] = useState<Resolution>(8);
  const [mode, setMode] = useState<MapMode>("observed");
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ cells: true, drivers: true, rides: true, waiting: true });
  const [selected, setSelected] = useState<Selection>(initialCell ? { kind: "cell", id: initialCell } : null);
  const mapScope = { branch_id: scope.branch_id };
  const cells = useCc<Snapshot>(["cells"], "/erp/radar/cells", { ...scope, resolution }, { refetch: 60_000 });
  const drivers = useCc<{ items: DriverPin[]; truncated: boolean }>(["drivers"], "/erp/radar/drivers", mapScope, { enabled: layers.drivers, refetch: 30_000 });
  const rides = useCc<{ items: RidePin[]; truncated: boolean }>(["rides"], "/erp/radar/rides", mapScope, { enabled: layers.rides || layers.waiting, refetch: 30_000 });

  const snap = cells.data;
  const forecastMissing = snap?.forecast.status === "insufficient_data";

  return (
    <Panel flush className="overflow-hidden">
      <PanelHeader
        title={t("الرادار")}
        hint={t("الطلب والعرض حسب المنطقة. اللون نسبي داخل المنطقة المعروضة، والتوقع للساعة القادمة فقط.")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className={chipGroup}>
              {MODES.map((item) => (
                <button key={item.id} type="button" className={mode === item.id ? chipActive : chipClass} onClick={() => setMode(item.id)}>
                  {t(item.label)}
                </button>
              ))}
            </div>
            <div className={chipGroup}>
              {([8, 7] as Resolution[]).map((res) => (
                <button key={res} type="button" className={resolution === res ? chipActive : chipClass} onClick={() => setResolution(res)}>
                  {res === 8 ? t("أحياء") : t("مناطق أوسع")}
                </button>
              ))}
            </div>
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-2.5 text-xs">
        {LAYERS.map((item) => (
          <label key={item.id} className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-body">
            <input type="checkbox" className="size-3.5 accent-[var(--teal)]" checked={layers[item.id]} onChange={(event) => setLayers((current) => ({ ...current, [item.id]: event.target.checked }))} />
            {t(item.label)}
          </label>
        ))}
        <Legend mode={mode} />
      </div>
      {mode === "forecast" && forecastMissing ? (
        <div className="border-b border-line px-5 py-3">
          <Notice>
            {snap?.forecast.reason === "TOO_FEW_REQUESTS" ? t("لا يوجد توقع: الطلبات في نفس الساعة من الأسابيع الماضية قليلة جداً.") : t("لا يوجد توقع: نحتاج أسبوعين على الأقل من بيانات الطلب.")}{" "}
            <span className="text-muted">{t("المعروض فارغ عمداً ولا يُقدَّر.")}</span>
          </Notice>
        </div>
      ) : null}
      {cells.error ? <div className="p-5"><StateView error={cells.error}>{null}</StateView></div> : null}
      <div className="grid lg:grid-cols-[1fr_22rem]">
        <div className="relative">
          <RadarMap
            cells={layers.cells ? snap?.cells ?? [] : []}
            drivers={layers.drivers ? drivers.data?.items ?? [] : []}
            rides={(rides.data?.items ?? []).filter((ride) => (ride.status === "SEARCHING" ? layers.waiting : layers.rides))}
            mode={mode}
            forecastReady={!forecastMissing}
            selected={selected}
            onSelect={setSelected}
          />
          {snap && layers.cells && !(mode === "forecast" && forecastMissing) && !hasShading(snap.cells, mode, !forecastMissing) ? (
            <p className="pointer-events-none absolute inset-x-0 top-3 z-[500] mx-auto w-fit max-w-[90%] rounded-full border border-line bg-surface/95 px-4 py-1.5 text-center text-xs font-medium text-heading shadow-sm">
              {mode === "observed" ? t("لا طلبات في هذه الفترة ولا طلبات بانتظار. اختر فترة أطول لرؤية الخلايا.") : mode === "forecast" ? t("لا طلب متوقع في الساعة القادمة.") : t("لا نقص في أي منطقة الآن.")}
            </p>
          ) : null}
        </div>
        <aside className="max-h-[560px] overflow-y-auto border-t border-line lg:border-s lg:border-t-0">
          <DetailPane
            selected={selected}
            scope={scope}
            snap={snap}
            drivers={drivers.data?.items ?? []}
            rides={rides.data?.items ?? []}
            loading={cells.isLoading}
          />
        </aside>
      </div>
      {snap ? (
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line px-5 py-2.5 text-xs text-muted">
          <span>{t("مناطق فيها نقص الآن")}: <b className="text-heading">{num(snap.totals.shortage_cells, 0)}</b></span>
          <span>{t("نقص متوقع")}: <b className="text-heading">{forecastMissing ? "—" : num(snap.totals.forecast_shortage_cells, 0)}</b></span>
          {snap.data_quality.requests_without_location ? <span>{t("طلبات بلا إحداثيات صالحة")}: {num(snap.data_quality.requests_without_location, 0)}</span> : null}
          {snap.data_quality.requests_pending_index ? <span>{t("طلبات قيد الفهرسة")}: {num(snap.data_quality.requests_pending_index, 0)}</span> : null}
          {drivers.data?.truncated || rides.data?.truncated ? <span className="text-warning-ink">{t("الخريطة تعرض أول 2000 عنصر فقط.")}</span> : null}
        </div>
      ) : null}
    </Panel>
  );
}

function hasShading(cells: RadarCell[], mode: MapMode, forecastReady: boolean) {
  if (mode === "observed") return cells.some((c) => c.heat > 0);
  if (mode === "forecast") return forecastReady && cells.some((c) => (c.forecast?.heat ?? 0) > 0);
  return cells.some((c) => c.shortage.actual || (forecastReady && c.shortage.forecast));
}

function Legend({ mode }: { mode: MapMode }) {
  const swatch = (cls: string, label: string, dashed = false) => (
    <span className="inline-flex items-center gap-1.5 text-muted">
      <i className={`size-2.5 rounded-sm ${cls} ${dashed ? "border border-dashed border-warning bg-transparent" : ""}`} />
      {t(label)}
    </span>
  );
  return (
    <div className="ms-auto flex flex-wrap gap-3">
      <span className="inline-flex items-center gap-1.5 text-muted">
        <i className="size-2.5 rounded-sm border" style={{ borderColor: EMPTY_CELL, backgroundColor: `${EMPTY_CELL}14` }} />
        {t("بلا طلب")}
      </span>
      {mode !== "shortage" ? (
        <span className="inline-flex items-center gap-1.5 text-muted">
          {t(mode === "forecast" ? "طلب متوقع" : "طلب")}: {t("أقل")}
          <span className="inline-flex overflow-hidden rounded-sm">
            {HEAT_LEVELS.map((step) => (
              <i key={step} className="h-2.5 w-4" style={{ backgroundColor: `var(--heat-${step})` }} />
            ))}
          </span>
          {t("أكثر")}
        </span>
      ) : (
        <>
          {swatch("bg-danger/60", "نقص فعلي الآن")}
          {swatch("", "نقص متوقع", true)}
        </>
      )}
      <span className="inline-flex items-center gap-1.5 text-muted"><i className="size-2.5 rounded-full bg-success" />{t("متاح")}</span>
      <span className="inline-flex items-center gap-1.5 text-muted"><i className="size-2.5 rounded-full bg-teal" />{t("مشغول")}</span>
      <span className="inline-flex items-center gap-1.5 text-muted"><i className="size-2.5 rounded-full border border-dashed border-muted" />{t("موقع قديم")}</span>
      <span className="inline-flex items-center gap-1.5 text-muted"><i className="size-2.5 rounded-full bg-warning" />{t("طلب بانتظار")}</span>
    </div>
  );
}

function RadarMap({
  cells,
  drivers,
  rides,
  mode,
  forecastReady,
  selected,
  onSelect,
}: {
  cells: RadarCell[];
  drivers: DriverPin[];
  rides: RidePin[];
  mode: MapMode;
  forecastReady: boolean;
  selected: Selection;
  onSelect: (next: Selection) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const groupRef = useRef<LayerGroup | null>(null);
  const fitted = useRef(false);
  const data = { cells, drivers, rides, mode, forecastReady, selected };
  const dataRef = useRef(data);
  const selectRef = useRef(onSelect);
  useLayoutEffect(() => {
    dataRef.current = data;
    selectRef.current = onSelect;
  });
  const dataKey = JSON.stringify([
    mode,
    forecastReady,
    selected,
    cells.map((c) => [c.cell, c.heat, c.live.unassigned, c.live.available_drivers, c.forecast?.expected_requests ?? null, c.forecast?.heat ?? null, c.shortage.actual, c.shortage.forecast]),
    drivers.map((d) => [d.driver_id, d.lat, d.lng, d.state]),
    rides.map((r) => [r.id, r.status, r.driver_location?.lat, r.driver_location?.lng]),
  ]);

  const paint = useCallback(() => {
    const map = mapRef.current;
    const group = groupRef.current;
    const current = dataRef.current;
    if (!mapAlive(map) || !group) return;
    void import("leaflet").then((L) => {
      if (mapRef.current !== map || !mapAlive(map)) return;
      try {
        group.clearLayers();
      } catch {
        return;
      }
      const danger = themeColor("--danger", "#ea5455");
      const warning = themeColor("--warning", "#ff9f43");
      const brand = themeColor("--brand", "#22e0ee");
      const teal = themeColor("--teal", "#389197");
      const success = themeColor("--success", "#28c76f");
      const muted = themeColor("--muted", "#8a8d93");
      const heatColors = HEAT_FALLBACK.map((fallback, i) => themeColor(`--heat-${i + 1}`, fallback));
      const ink = heatColors[4];
      const bounds: [number, number][] = [];

      for (const cell of current.cells) {
        let fill = EMPTY_CELL;
        let opacity = 0.08;
        let stroke = EMPTY_CELL;
        let strokeOpacity = 0.7;
        let dash: string | undefined;
        if (current.mode !== "shortage") {
          const step = current.mode === "observed" ? cell.heat : current.forecastReady ? cell.forecast?.heat ?? 0 : 0;
          if (step > 0) {
            fill = heatColors[Math.min(step, 5) - 1];
            opacity = 0.72;
            stroke = "#ffffff";
            strokeOpacity = 0.9;
          }
        } else if (cell.shortage.actual) {
          fill = danger;
          opacity = 0.55;
          stroke = "#ffffff";
          strokeOpacity = 0.9;
        } else if (cell.shortage.forecast && current.forecastReady) {
          stroke = warning;
          strokeOpacity = 0.9;
          dash = "5 4";
        }
        const isSelected = current.selected?.kind === "cell" && current.selected.id === cell.cell;
        const polygon = L.polygon(cell.boundary, {
          color: isSelected ? ink : stroke,
          weight: isSelected ? 3 : 1.5,
          opacity: isSelected ? 1 : strokeOpacity,
          dashArray: dash,
          fillColor: fill,
          fillOpacity: opacity,
        });
        const tip = [
          `${t("طلبات")}: ${cell.observed.requests}`,
          `${t("بانتظار الآن")}: ${cell.live.unassigned}`,
          `${t("متاحون")}: ${cell.live.available_drivers}`,
          current.forecastReady && cell.forecast ? `${t("متوقع")}: ${num(cell.forecast.expected_requests)}` : "",
        ].filter(Boolean).join("<br>");
        polygon.bindTooltip(tip, { sticky: true });
        polygon.on("click", () => selectRef.current({ kind: "cell", id: cell.cell }));
        polygon.addTo(group);
        for (const [lat, lng] of cell.boundary) bounds.push([lat, lng]);
      }

      for (const driver of current.drivers) {
        const color = driver.state === "available" ? success : driver.state === "busy" ? teal : muted;
        const marker = L.circleMarker([driver.lat, driver.lng], {
          radius: 6,
          color: driver.state === "stale" ? muted : themeColor("--surface", "#ffffff"),
          weight: 2,
          dashArray: driver.state === "stale" ? "2 2" : undefined,
          fillColor: color,
          fillOpacity: driver.state === "stale" ? 0.25 : 0.95,
        });
        marker.bindTooltip(escapeHtml(`${driver.name ?? t("سائق")} · ${driver.state === "stale" ? `${t("موقع قديم")} ${ago(driver.last_location_at)}` : enumLabel(driver.availability)}`));
        marker.on("click", () => selectRef.current({ kind: "driver", id: driver.driver_id }));
        marker.addTo(group);
        bounds.push([driver.lat, driver.lng]);
      }

      for (const ride of current.rides) {
        const waiting = ride.status === "SEARCHING";
        const at = !waiting && ride.driver_location ? ride.driver_location : ride.pickup;
        const marker = L.circleMarker([at.lat, at.lng], {
          radius: waiting ? 5 : 4,
          color: waiting ? warning : brand,
          weight: 2,
          fillColor: waiting ? warning : brand,
          fillOpacity: 0.85,
        });
        marker.bindTooltip(escapeHtml(`${ride.public_number} · ${enumLabel(ride.status)}${waiting && ride.waiting_sec != null ? ` · ${duration(ride.waiting_sec)}` : ""}`));
        marker.on("click", () => selectRef.current({ kind: "ride", id: ride.id }));
        marker.addTo(group);
        bounds.push([at.lat, at.lng]);
      }

      if (bounds.length && !fitted.current && mapAlive(map)) {
        map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
        fitted.current = true;
      }
    });
  }, []);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let cancelled = false;
    let created: LeafletMap | null = null;
    void import("leaflet").then((L) => {
      if (cancelled || mapRef.current || !node.isConnected) return;
      resetHost(node);
      const map = L.map(node, MAP_OPTIONS).setView([33.5138, 36.2765], 11);
      created = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      groupRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      if (cancelled) {
        disposeMap(map);
        mapRef.current = null;
        groupRef.current = null;
        return;
      }
      requestAnimationFrame(() => {
        if (!mapAlive(map)) return;
        map.invalidateSize();
        paint();
      });
    });
    return () => {
      cancelled = true;
      disposeMap(created ?? mapRef.current);
      mapRef.current = null;
      groupRef.current = null;
      fitted.current = false;
    };
  }, [paint]);

  useEffect(() => {
    paint();
  }, [dataKey, paint]);

  useEffect(() => {
    const observer = new MutationObserver(paint);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [paint]);

  return <div ref={host} dir="ltr" className="h-[560px] w-full [&_.leaflet-container]:z-0" />;
}

function Fact({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-heading/[0.02] px-3 py-2">
      <dt className="text-[11px] font-medium text-muted" title={hint}>{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-heading">{value}</dd>
    </div>
  );
}

function Bars({
  rows,
  labels,
  empty,
}: {
  rows: { bucket: number; requests: number }[];
  labels: (bucket: number) => string;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.requests));
  if (!rows.length) return <p className="text-xs text-muted">{empty ?? t("لا طلبات في هذه الفترة.")}</p>;
  const wide = rows.length <= 8;
  return (
    <div className={cx("flex items-end", wide ? "h-28 gap-1.5" : "h-24 gap-0.5")} dir="ltr">
      {rows.map((row) => {
        const label = labels(row.bucket);
        const height = Math.max(8, Math.round((row.requests / max) * (wide ? 72 : 56)));
        return (
          <div
            key={row.bucket}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
            title={`${label}: ${num(row.requests, 0)} ${t("طلب")}`}
          >
            <span className="text-[11px] font-semibold tabular-nums text-heading">{num(row.requests, 0)}</span>
            <div
              className="w-full max-w-10 rounded-t-md bg-teal/80 ring-1 ring-teal/20"
              style={{ height }}
              aria-hidden
            />
            <span className={cx("text-center leading-tight text-muted", wide ? "text-[11px] font-medium" : "text-[9px]")}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** ISODOW 1=Mon … 7=Sun — short labels that stay readable (avoid «الأ»). */
const WEEKDAY_SHORT = ["", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت", "أحد"];
const WEEKDAY_FULL = ["", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"];

function hourLabel(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  return `${String(h).padStart(2, "0")}:00`;
}

function DetailPane({
  selected,
  scope,
  snap,
  drivers,
  rides,
  loading,
}: {
  selected: Selection;
  scope: Record<string, unknown>;
  snap: Snapshot | undefined;
  drivers: DriverPin[];
  rides: RidePin[];
  loading: boolean;
}) {
  if (!selected) {
    if (loading) return <div className="p-5"><StateView loading>{null}</StateView></div>;
    const top = [...(snap?.cells ?? [])].filter((c) => c.shortage.actual || c.live.unassigned > 0).sort((a, b) => b.live.unassigned - a.live.unassigned).slice(0, 6);
    return (
      <div className="grid gap-3 p-5">
        <p className="text-sm font-semibold text-heading">{t("اختر منطقة أو سائقاً أو رحلة على الخريطة")}</p>
        {snap && snap.cells.length === 0 ? <p className="text-sm text-muted">{t("لا طلبات ولا سائقين في هذه الفترة والفرع.")}</p> : null}
        {top.length ? (
          <div className="grid gap-2">
            <p className="text-xs font-medium text-muted">{t("مناطق فيها طلبات بانتظار")}</p>
            {top.map((cell) => (
              <div key={cell.cell} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
                <span>
                  {num(cell.live.unassigned, 0)} {t("بانتظار")} · {num(cell.live.available_drivers, 0)} {t("متاح")}
                </span>
                {cell.shortage.actual ? <StatusBadge value="CRITICAL" label={t("نقص")} /> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  if (selected.kind === "cell") return <CellDetail cell={selected.id} scope={scope} />;
  if (selected.kind === "driver") {
    const driver = drivers.find((d) => d.driver_id === selected.id);
    if (!driver) return <p className="p-5 text-sm text-muted">{t("السائق لم يعد ظاهراً على الخريطة.")}</p>;
    return (
      <div className="grid gap-3 p-5">
        <p className="text-sm font-semibold text-heading">{driver.name ?? t("سائق")}</p>
        <dl className="grid grid-cols-2 gap-2">
          <Fact label={t("الحالة")} value={driver.state === "stale" ? t("موقع قديم") : enumLabel(driver.availability)} />
          <Fact label={t("آخر موقع")} value={ago(driver.last_location_at)} />
          <Fact label={t("في رحلة")} value={driver.on_ride ? t("نعم") : t("لا")} />
        </dl>
        <div className="flex flex-wrap gap-2">
          <Link className={btnGhostSm} href={`/admin/drivers/${driver.driver_id}`}>{t("ملف السائق")}</Link>
          {driver.ride_id ? <Link className={btnGhostSm} href={`/erp/rides/${driver.ride_id}#ride-map`}>{t("فتح الرحلة")}</Link> : null}
        </div>
      </div>
    );
  }
  const ride = rides.find((r) => r.id === selected.id);
  if (!ride) return <p className="p-5 text-sm text-muted">{t("الرحلة لم تعد نشطة.")}</p>;
  return (
    <div className="grid gap-3 p-5">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-heading">{ride.public_number}</p>
        <StatusBadge value={ride.status} label={enumLabel(ride.status)} />
      </div>
      <dl className="grid grid-cols-2 gap-2">
        <Fact label={t("النوع")} value={enumLabel(ride.type)} />
        {ride.waiting_sec != null ? <Fact label={t("ينتظر منذ")} value={duration(ride.waiting_sec)} /> : null}
        {ride.driver_location ? <Fact label={t("موقع السائق")} value={ride.driver_location.stale ? `${t("قديم")} · ${ago(ride.driver_location.last_location_at)}` : ago(ride.driver_location.last_location_at)} /> : null}
      </dl>
      <Link className={btnGhostSm} href={`/erp/rides/${ride.id}#ride-map`}>{t("فتح الرحلة")}</Link>
    </div>
  );
}

type CellDetailData = {
  cell: string;
  resolution: number;
  observed: RadarCell["observed"];
  live: RadarCell["live"] | null;
  forecast: { expected_requests: number } | null;
  forecast_status: ForecastMeta | null;
  shortage: RadarCell["shortage"] | null;
  by_hour: { bucket: number; requests: number }[];
  by_weekday: { bucket: number; requests: number }[];
  waiting_requests: { id: string; public_number: string; type: string; waiting_sec: number }[];
};

function CellDetail({ cell, scope }: { cell: string; scope: Record<string, unknown> }) {
  const detail = useCc<CellDetailData>(["cell", cell], `/erp/radar/cells/${cell}`, scope, { refetch: 60_000 });
  const data = detail.data;
  if (detail.isLoading || detail.error) return <div className="p-5"><StateView loading={detail.isLoading} error={detail.error}>{null}</StateView></div>;
  if (!data) return null;
  const forecastOk = data.forecast_status?.status === "ok";
  return (
    <div className="grid gap-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-heading">{t("تفاصيل المنطقة")}</p>
        {data.shortage?.actual ? <StatusBadge value="CRITICAL" label={t("نقص فعلي")} /> : null}
        {data.shortage?.forecast && forecastOk ? <StatusBadge value="WARNING" label={t("نقص متوقع")} /> : null}
      </div>
      <dl className="grid grid-cols-2 gap-2">
        <Fact label={t("طلبات في الفترة")} value={num(data.observed.requests, 0)} />
        <Fact label={t("الفترة السابقة")} value={`${num(data.observed.previous_requests, 0)}${data.observed.trend_pct != null ? ` (${data.observed.trend_pct > 0 ? "+" : ""}${num(data.observed.trend_pct)}%)` : ""}`} />
        <Fact label={t("مكتملة")} value={num(data.observed.completed, 0)} />
        <Fact label={t("بلا سائق")} value={num(data.observed.unserved, 0)} />
        <Fact label={t("أُلغيت قبل الإسناد")} value={num(data.observed.cancelled_before_assignment, 0)} />
        <Fact label={t("متوسط زمن الإسناد")} value={duration(data.observed.avg_assignment_sec)} />
        {data.live ? (
          <>
            <Fact label={t("بانتظار الآن")} value={num(data.live.unassigned, 0)} />
            <Fact label={t("سائقون متاحون")} value={num(data.live.available_drivers, 0)} />
          </>
        ) : null}
        <Fact
          label={t("متوقع للساعة القادمة")}
          value={forecastOk ? num(data.forecast?.expected_requests ?? 0) : t("بيانات غير كافية")}
          hint={t("متوسط نفس الساعة من الأسابيع الماضية، وليس وعداً.")}
        />
      </dl>
      <div className="grid gap-2 rounded-xl border border-line bg-canvas/40 p-3">
        <div>
          <p className="text-sm font-semibold text-heading">{t("الطلبات حسب الساعة")}</p>
          <p className="mt-0.5 text-[11px] text-muted">{t("عدد الطلبات في كل ساعة ضمن الفترة المحددة أعلى الخريطة.")}</p>
        </div>
        <Bars rows={data.by_hour} labels={hourLabel} empty={t("لا طلبات موزّعة على ساعات في هذه الفترة.")} />
      </div>
      <div className="grid gap-2 rounded-xl border border-line bg-canvas/40 p-3">
        <div>
          <p className="text-sm font-semibold text-heading">{t("الطلبات حسب اليوم")}</p>
          <p className="mt-0.5 text-[11px] text-muted">{t("توزيع الطلبات على أيام الأسبوع في نفس الفترة.")}</p>
        </div>
        <Bars
          rows={data.by_weekday}
          labels={(b) => t(WEEKDAY_SHORT[b] ?? WEEKDAY_FULL[b] ?? String(b))}
          empty={t("لا طلبات موزّعة على أيام في هذه الفترة.")}
        />
      </div>
      {data.waiting_requests.length ? (
        <div className="grid gap-1.5">
          <p className="text-xs font-medium text-muted">{t("طلبات بانتظار الآن")}</p>
          {data.waiting_requests.slice(0, 10).map((ride) => (
            <Link key={ride.id} href={`/erp/rides/${ride.id}`} className="flex items-center justify-between rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-heading/[0.03]">
              <span className="font-medium text-heading">{ride.public_number}</span>
              <span className="text-xs text-muted">{duration(ride.waiting_sec)}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const INSIGHT_TITLE: Record<string, string> = {
  SHORTAGE_AREA: "نقص سائقين في منطقة الآن",
  FORECAST_SHORTAGE: "نقص متوقع في الساعة القادمة",
  ASSIGNMENT_TIME_RISING: "زمن الإسناد يرتفع",
  CANCELLATION_RISING: "الإلغاء يرتفع",
  UNSERVED_REQUESTS: "طلبات انتهت بلا سائق",
  STALE_DRIVER_ON_RIDE: "سائق في رحلة وموقعه قديم",
};

const INSIGHT_ACTION: Record<string, string> = {
  REVIEW_DRIVER_DISTRIBUTION: "راجع توزيع السائقين قرب هذه المنطقة.",
  PREPARE_COVERAGE: "جهّز تغطية للمنطقة قبل الساعة القادمة.",
  INVESTIGATE_ASSIGNMENT_TIME: "افحص سبب تأخر قبول العروض.",
  REVIEW_CANCELLATIONS: "راجع أسباب الإلغاء الأخيرة.",
  REVIEW_UNSERVED: "راجع الطلبات التي لم تجد سائقاً.",
  CHECK_DRIVER_CONNECTIVITY: "تواصل مع السائق وتحقق من اتصاله.",
};

const EVIDENCE_LABEL: Record<string, string> = {
  waiting_requests: "طلبات بانتظار",
  available_drivers: "سائقون متاحون",
  forecast_requests: "طلبات متوقعة",
  weeks_used: "أسابيع البيانات",
  avg_assignment_sec: "متوسط الإسناد الآن",
  previous_avg_assignment_sec: "المتوسط السابق",
  change_pct: "التغير",
  samples: "عدد العينات",
  cancellation_rate_pct: "نسبة الإلغاء الآن",
  previous_cancellation_rate_pct: "النسبة السابقة",
  cancelled: "ملغاة",
  finished: "منتهية",
  unserved: "بلا سائق",
  unserved_rate_pct: "النسبة",
  public_number: "الرحلة",
  since: "منذ",
};

function evidenceValue(key: string, value: unknown) {
  if (typeof value === "number") {
    if (key.endsWith("_sec")) return duration(value);
    if (key.endsWith("_pct")) return pct(value);
    return num(value);
  }
  if (key === "since" && typeof value === "string") return ago(value);
  return typeof value === "string" ? value : "";
}

function InsightsPanel({ summary }: { summary: ReturnType<typeof useCc<Summary>> }) {
  const insights = summary.data?.insights ?? [];
  return (
    <Panel flush>
      <PanelHeader title={t("ملاحظات تشغيلية")} hint={t("مبنية على أرقام فعلية، والدليل ظاهر مع كل ملاحظة.")} />
      {summary.isLoading ? <div className="p-5"><StateView loading>{null}</StateView></div> : null}
      {!summary.isLoading && insights.length === 0 ? <EmptyState bare title={t("لا ملاحظات الآن")} hint={t("لا شيء يتجاوز الحدود في هذه الفترة.")} /> : null}
      <div className="divide-y divide-line">
        {insights.map((insight, index) => {
          const evidence = Object.entries(insight.evidence).filter(([key]) => EVIDENCE_LABEL[key]);
          const rideId = typeof insight.evidence.ride_id === "string" ? insight.evidence.ride_id : "";
          return (
            <div key={`${insight.code}-${index}`} className="grid gap-1.5 px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge value={insight.severity === "critical" ? "CRITICAL" : insight.severity === "warning" ? "WARNING" : "INFO"} label={enumLabel(insight.severity.toUpperCase())} />
                <p className="text-sm font-semibold text-heading">{t(INSIGHT_TITLE[insight.code] ?? insight.code)}</p>
              </div>
              <p className="text-xs text-muted">
                {evidence.map(([key, value]) => `${t(EVIDENCE_LABEL[key])}: ${evidenceValue(key, value)}`).join(" · ")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[13px] text-body">{t(INSIGHT_ACTION[insight.recommendation] ?? insight.recommendation)}</p>
                {rideId ? <Link className="text-xs font-semibold text-accent" href={`/erp/rides/${rideId}#ride-map`}>{t("فتح الرحلة")}</Link> : null}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function BirthdaysTodayPanel() {
  const birthdays = useGoRecord("/admin/notifications/birthdays-today");
  const customers = Array.isArray(birthdays.data?.customers) ? birthdays.data.customers : [];
  const drivers = Array.isArray(birthdays.data?.drivers) ? birthdays.data.drivers : [];
  const total = customers.length + drivers.length;
  if (birthdays.isLoading || birthdays.error || total === 0) return null;

  function names(rows: unknown[]) {
    return rows
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const person = row as Record<string, unknown>;
        if (typeof person.full_name === "string" && person.full_name.trim()) return person.full_name;
        if (typeof person.phone === "string" && person.phone.trim()) return person.phone;
        return null;
      })
      .filter(Boolean)
      .slice(0, 6) as string[];
  }

  return (
    <Panel className="border-teal/35 bg-brand/5">
      <PanelHeader
        title={t("أعياد الميلاد اليوم")}
        hint={t("عملاء وسائقون ميلادهم اليوم حسب المسجّل في التطبيق.")}
        action={<Link className={btnGhostSm} href="/admin/notifications">{t("إرسال إشعار")}</Link>}
      />
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <div>
          <p className="text-sm font-semibold text-heading">{t("العملاء")} · {customers.length}</p>
          <p className="mt-1 text-sm text-body">{names(customers).join(" · ") || t("لا أحد اليوم")}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-heading">{t("السائقون")} · {drivers.length}</p>
          <p className="mt-1 text-sm text-body">{names(drivers).join(" · ") || t("لا أحد اليوم")}</p>
        </div>
      </div>
    </Panel>
  );
}

function AlertsPanel() {
  const alerts = useGoList("/erp/alerts", { status: "OPEN", limit: 8 });
  const call = useGo();
  const rows = alerts.data ?? [];
  return (
    <Panel flush>
      <PanelHeader title={t("تنبيهات مفتوحة")} action={<Link className={btnGhostSm} href="/erp/alerts">{t("كل التنبيهات")}</Link>} />
      {alerts.isLoading ? <div className="p-5"><StateView loading>{null}</StateView></div> : null}
      {!alerts.isLoading && rows.length === 0 ? <EmptyState bare title={t("لا تنبيهات مفتوحة")} /> : null}
      <div className="divide-y divide-line">
        {rows.map((row) => {
          const id = String(row.id ?? "");
          const type = typeof row.type === "string" ? row.type : "";
          return (
            <div key={id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-heading">{enumLabel(type)}</p>
                  {typeof row.severity === "string" ? <StatusBadge value={row.severity} label={enumLabel(row.severity)} /> : null}
                </div>
                <p className="text-xs text-muted">
                  {[entityName(row.ride), entityName(row.branch), ago(typeof row.started_at === "string" ? row.started_at : null)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <ConfirmButton className={btnPrimarySm} ask={{ title: t("استلام التنبيه"), body: t("سيُسند هذا التنبيه إليك."), confirm: t("استلام") }} onConfirm={() => call(`/erp/alerts/${id}/claim`, { method: "POST" })}>
                {t("استلام")}
              </ConfirmButton>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function SeriesPanel({ summary }: { summary: ReturnType<typeof useCc<Summary>> }) {
  const series = summary.data?.series;
  if (!series) return null;
  const max = Math.max(1, ...series.points.map((p) => p.requests));
  return (
    <Panel flush>
      <PanelHeader title={t("الطلبات عبر الوقت")} hint={series.unit === "hour" ? t("لكل ساعة بتوقيت الفرع.") : t("لكل يوم بتوقيت الفرع.")} />
      {series.points.length === 0 ? (
        <EmptyState bare title={t("لا طلبات في هذه الفترة.")} />
      ) : (
        <div className="overflow-x-auto px-5 py-4">
          <div className="flex h-40 min-w-fit items-end gap-1" dir="ltr">
            {series.points.map((point) => {
              const other = Math.max(0, point.requests - point.completed - point.cancelled);
              const h = (n: number) => `${(n / max) * 128}px`;
              return (
                <div key={point.bucket} className="flex w-6 flex-col items-center gap-1" title={`${point.bucket} · ${t("الطلبات")} ${point.requests} · ${t("مكتملة")} ${point.completed} · ${t("ملغاة")} ${point.cancelled}`}>
                  <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-sm">
                    <div className="bg-success/80" style={{ height: h(point.completed) }} />
                    <div className="bg-danger/70" style={{ height: h(point.cancelled) }} />
                    <div className="bg-heading/20" style={{ height: h(other) }} />
                  </div>
                  <span className="text-[9px] text-muted">{series.unit === "hour" ? point.bucket.slice(11, 13) : point.bucket.slice(5, 10)}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-success/80" />{t("مكتملة")}</span>
            <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-danger/70" />{t("ملغاة")}</span>
            <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-heading/20" />{t("أخرى أو جارية")}</span>
          </div>
        </div>
      )}
    </Panel>
  );
}

type Finance = {
  ride_fares: { completed_rides: number; gross_fares: number; discounts: number; compensations_on_fares: number; customer_payable: number };
  company_revenue: { commission_collected: number; commission_reversed: number; net_commission: number; driver_cancel_penalties: number };
  company_costs: { incentives_paid: number; incentive_transactions: number; compensation_borne_by_beroya: number };
  compensations: { total_applied: number; count: number; unallocated: number; driver_borne: number };
  driver_wallet_movements: { top_ups: number; adjustments: number; reversals_total: number };
  customer_wallet_movements: { ride_payments: number; ride_refunds: number; top_ups: number } | null;
  balances_now: { driver_prepaid_balance: number; driver_wallets: number; driver_outstanding_due: number; customer_wallet_balance: number | null };
};

function FinancePanel({ scope }: { scope: Record<string, unknown> }) {
  const finance = useCc<Finance>(["finance"], "/erp/command-center/finance", scope, { refetch: 120_000 });
  const f = finance.data;
  return (
    <Panel flush>
      <PanelHeader
        title={t("الملخص المالي")}
        hint={t("حركة أموال في الفترة. إجمالي الأجور ليس إيراداً للشركة؛ إيراد الشركة هو صافي العمولة والغرامات.")}
        action={<Link className={btnGhostSm} href="/erp/finance/performance">{t("الأداء المالي")}</Link>}
      />
      {finance.isLoading || finance.error ? <div className="p-5"><StateView loading={finance.isLoading} error={finance.error}>{null}</StateView></div> : null}
      {f ? (
        <div className="grid gap-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label={t("صافي العمولة")} value={formatMoney(f.company_revenue.net_commission)} stripe="bg-success">
              <span className="text-xs text-muted">{t("محصّلة")} {formatMoney(f.company_revenue.commission_collected)} · {t("مُعادة")} {formatMoney(f.company_revenue.commission_reversed)}</span>
            </Kpi>
            <Kpi label={t("غرامات إلغاء السائقين")} value={formatMoney(f.company_revenue.driver_cancel_penalties)} stripe="bg-success" />
            <Kpi label={t("حوافز مدفوعة")} value={formatMoney(f.company_costs.incentives_paid)} stripe="bg-danger">
              <span className="text-xs text-muted">{num(f.company_costs.incentive_transactions, 0)} {t("دفعة")}</span>
            </Kpi>
            <Kpi label={t("تعويضات تتحملها الشركة")} value={formatMoney(f.company_costs.compensation_borne_by_beroya)} stripe="bg-danger" />
          </div>
          <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Fact label={t("رحلات مكتملة")} value={num(f.ride_fares.completed_rides, 0)} />
            <Fact label={t("إجمالي الأجور (ليس ربحاً)")} value={formatMoney(f.ride_fares.gross_fares)} />
            <Fact label={t("خصومات")} value={formatMoney(f.ride_fares.discounts)} />
            <Fact label={t("ما دفعه الزبائن")} value={formatMoney(f.ride_fares.customer_payable)} />
            <Fact label={t("تعويضات مطبّقة")} value={`${formatMoney(f.compensations.total_applied)} (${num(f.compensations.count, 0)})`} />
            <Fact label={t("تعويضات بلا تحميل بعد")} value={formatMoney(f.compensations.unallocated)} />
            <Fact label={t("تعويضات على السائقين")} value={formatMoney(f.compensations.driver_borne)} />
            <Fact label={t("شحن محافظ السائقين")} value={formatMoney(f.driver_wallet_movements.top_ups)} />
            <Fact label={t("أرصدة السائقين الآن")} value={formatMoney(f.balances_now.driver_prepaid_balance)} />
            <Fact label={t("مستحقات على السائقين")} value={formatMoney(f.balances_now.driver_outstanding_due)} />
            <Fact
              label={t("أرصدة محافظ الزبائن")}
              value={f.balances_now.customer_wallet_balance == null ? t("غير متاح لفرع واحد") : formatMoney(f.balances_now.customer_wallet_balance)}
            />
            {f.customer_wallet_movements ? <Fact label={t("دفعات الزبائن من المحفظة")} value={formatMoney(f.customer_wallet_movements.ride_payments)} /> : null}
          </dl>
        </div>
      ) : null}
    </Panel>
  );
}

type CcConfig = {
  alerts_enabled: boolean;
  coverage_min_unassigned: number;
  assignment_delay_seconds: number;
  ride_delay_factor: string | number;
  ride_delay_min_extra_seconds: number;
  cancellation_rate_pct: string | number;
  cancellation_window_minutes: number;
  cancellation_min_rides: number;
  dedupe_minutes: number;
};

const CONFIG_FIELDS: { name: keyof CcConfig; label: string; step?: string }[] = [
  { name: "coverage_min_unassigned", label: "حد الطلبات المنتظرة في منطقة" },
  { name: "assignment_delay_seconds", label: "تأخر الإسناد (ثانية)" },
  { name: "ride_delay_factor", label: "معامل تأخر الرحلة (× المدة المقدّرة)", step: "0.1" },
  { name: "ride_delay_min_extra_seconds", label: "أقل تأخير إضافي للرحلة (ثانية)" },
  { name: "cancellation_rate_pct", label: "حد نسبة الإلغاء %", step: "0.5" },
  { name: "cancellation_window_minutes", label: "نافذة حساب الإلغاء (دقيقة)" },
  { name: "cancellation_min_rides", label: "أقل عدد رحلات للحكم على الإلغاء" },
  { name: "dedupe_minutes", label: "عدم تكرار التنبيه نفسه خلال (دقيقة)" },
];

function ConfigPanel() {
  const config = useCc<CcConfig>(["config"], "/admin/command-center/config", {});
  const call = useGo();
  const queryClient = useQueryClient();
  const data = config.data;
  return (
    <Panel flush>
      <PanelHeader title={t("إعدادات تنبيهات مركز القيادة")} hint={t("التعديل يُسجّل في سجل التدقيق. التنبيهات تُقيَّم كل دقيقة.")} />
      {config.isLoading || config.error ? <div className="p-5"><StateView loading={config.isLoading} error={config.error}>{null}</StateView></div> : null}
      {data ? (
        <DeskForm
          key={JSON.stringify(data)}
          className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4"
          action={async (form) => {
            const body: Record<string, unknown> = { alerts_enabled: form.get("alerts_enabled") === "on" };
            for (const field of CONFIG_FIELDS) body[field.name] = Number(form.get(field.name));
            const result = await call("/admin/command-center/config", { method: "PATCH", body });
            await queryClient.invalidateQueries({ queryKey: ["cc"] });
            return result;
          }}
        >
          <label className="flex items-center gap-2 text-sm font-medium text-heading sm:col-span-2 xl:col-span-4">
            <input type="checkbox" name="alerts_enabled" defaultChecked={data.alerts_enabled} className="size-4 accent-[var(--teal)]" />
            {t("تفعيل تنبيهات مركز القيادة")}
          </label>
          {CONFIG_FIELDS.map((field) => (
            <Field key={field.name} label={t(field.label)}>
              <input className={inputClass} type="number" name={field.name} step={field.step ?? "1"} min="0" required defaultValue={String(data[field.name])} dir="ltr" />
            </Field>
          ))}
          <div className="sm:col-span-2 xl:col-span-4">
            <button type="submit" className={btnPrimary}>{t("حفظ الإعدادات")}</button>
          </div>
        </DeskForm>
      ) : null}
    </Panel>
  );
}