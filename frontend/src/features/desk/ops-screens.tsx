"use client";

import { alertOnRide, t } from "@/features/desk/i18n/t";

import { AudioLines, Pause, Phone, Play, Trash } from "lucide";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { io, type Socket } from "socket.io-client";

import { Icon } from "@/shared/ui/icon";

import { ConfirmButton, useConfirm } from "@/features/desk/confirm";
import { useDesk } from "@/features/desk/desk-context";
import { isGoFailure, useGo, useGoList, useGoRecord } from "@/features/desk/hooks";
import { STAFF_ENUMS } from "@/features/desk/enums";
import { entityName, enumLabel, formatMoney, formatScalar, headline, labelOf } from "@/features/desk/present";
import { DetailScreen, ListScreen, LookupSelect, NamedSelect, RecordList } from "@/features/desk/resource";
import { RideTrackMap } from "@/features/desk/ride-map";
import { EnumSelect } from "@/features/desk/select";
import type { StaffRole } from "@/features/desk/session";
import { CheckField, FormDialog } from "@/features/desk/controls";
import { btnDark, btnGhost, btnGhostSm, btnPrimary, btnPrimarySm, BusyMark, ChipCount, chipActive, chipClass, chipGroup, DeskForm, EmptyState, Field, FormCard, FormGrid, FormSpan, inputClass, Notice, PageTitle, Panel, StatusBadge } from "@/features/desk/ui";
import { isRecord } from "@/features/desk/go-api";

function isRecordId(value: unknown): value is { id: string } {
  return !!value && typeof value === "object" && "id" in value && typeof (value as { id: unknown }).id === "string";
}

function roleIs(role: StaffRole | undefined, roles: StaffRole[]) {
  return !!role && (role === "SUPER_ADMIN" || roles.includes(role));
}

function partyName(value: unknown, fallback: string) {
  return entityName(value) ?? fallback;
}

function initialOf(name: string) {
  const letter = name.trim().charAt(0);
  return letter || "؟";
}

function phoneText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/** Stop point for replacement pickup: dropoff at breakdown → case GPS → driver last GPS. */
function breakdownStopOf(record: Record<string, unknown>): { lat: number; lng: number; label?: string } | null {
  function pair(lat: unknown, lng: unknown) {
    const a = lat == null ? NaN : Number(lat);
    const b = lng == null ? NaN : Number(lng);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return { lat: a, lng: b };
  }
  function labelOfMeta(value: unknown) {
    if (!isRecord(value)) return "";
    const label = value.location_label;
    return typeof label === "string" && label.trim() ? label.trim() : "";
  }
  const alertLabel = Array.isArray(record.alerts)
    ? record.alerts.map((item) => (isRecord(item) ? labelOfMeta(item.metadata) : "")).find(Boolean) ?? ""
    : "";
  const fromDropoff = pair(record.actual_dropoff_lat, record.actual_dropoff_lng);
  if (fromDropoff) return { ...fromDropoff, label: alertLabel || undefined };
  const openCase = Array.isArray(record.cases)
    ? record.cases.find(
        (item) =>
          isRecord(item) &&
          (item.type === "BREAKDOWN" || item.type === "ACCIDENT") &&
          (item.status === "OPEN" || item.status === "IN_REVIEW"),
      )
    : null;
  if (isRecord(openCase)) {
    const fromCase = pair(openCase.latitude, openCase.longitude);
    if (fromCase) return { ...fromCase, label: alertLabel || undefined };
  }
  const driver = isRecord(record.driver) ? record.driver : null;
  const state = driver && isRecord(driver.state) ? driver.state : null;
  if (state) {
    const fromDriver = pair(state.last_lat, state.last_lng);
    if (fromDriver) return { ...fromDriver, label: alertLabel || undefined };
  }
  return null;
}

async function reverseAreaName(lat: number, lng: number, signal: AbortSignal) {
  const params = new URLSearchParams({
    format: "jsonv2",
    lat: String(lat),
    lon: String(lng),
    "accept-language": "ar",
    zoom: "16",
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    name?: string;
    display_name?: string;
    address?: Record<string, string>;
  };
  const a = body.address ?? {};
  const area = a.neighbourhood || a.suburb || a.quarter || a.city_district || a.residential;
  const road = a.road || a.pedestrian;
  const city = a.city || a.town || a.village || a.state;
  const parts = [area, road, city].filter(Boolean);
  if (parts.length) return [...new Set(parts)].join("، ");
  if (body.name?.trim()) return body.name.trim();
  if (body.display_name) return body.display_name.split(",").slice(0, 3).map((p) => p.trim()).filter(Boolean).join("، ");
  return null;
}

function BreakdownStopPlace({ stop }: { stop: { lat: number; lng: number; label?: string } }) {
  const [place, setPlace] = useState(stop.label?.trim() || "");
  useEffect(() => {
    if (stop.label?.trim()) {
      setPlace(stop.label.trim());
      return;
    }
    const ctrl = new AbortController();
    setPlace("");
    void reverseAreaName(stop.lat, stop.lng, ctrl.signal)
      .then((name) => {
        if (!ctrl.signal.aborted) setPlace(name?.trim() || t("موقع التعطّل"));
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setPlace(t("موقع التعطّل"));
      });
    return () => ctrl.abort();
  }, [stop.lat, stop.lng, stop.label]);
  return (
    <p className="mb-3 rounded-lg border border-line bg-heading/[0.03] px-3 py-2 text-sm text-heading">
      {t("موقع توقف السيارة")}: <span className="font-medium">{place || t("جاري تحديد المنطقة…")}</span>
    </p>
  );
}

function ContactPerson({
  role,
  name,
  phone,
  revealed,
  vacant = false,
}: {
  role: string;
  name: string;
  phone: string;
  revealed: boolean;
  vacant?: boolean;
}) {
  return (
    <div className="flex items-start gap-3.5 rounded-xl border border-line bg-heading/[0.02] px-4 py-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand/12 text-[15px] font-semibold text-accent ring-1 ring-inset ring-brand/25">
        {initialOf(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted">{role}</p>
        <p className="mt-0.5 truncate text-[15px] font-semibold text-heading">{name}</p>
        {vacant ? (
          <p className="mt-1 text-sm text-muted">{t("لم يُسند سائق بعد")}</p>
        ) : revealed && phone ? (
          <a className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent" href={`tel:${phone}`} dir="ltr" data-phone="">
            <Icon node={Phone} size={14} />
            <bdi className="phone-ltr" dir="ltr">{phone}</bdi>
          </a>
        ) : revealed ? (
          <p className="mt-1 text-sm text-muted">{t("لا يوجد رقم مسجّل")}</p>
        ) : (
          <p className="mt-1 text-sm text-muted">{t("الهاتف مخفي حتى الطلب")}</p>
        )}
      </div>
    </div>
  );
}

function RideContact({
  record,
  phones,
  revealing,
  onReveal,
}: {
  record: Record<string, unknown>;
  phones: Record<string, unknown> | null;
  revealing: boolean;
  onReveal: () => void;
}) {
  const customerName = phoneText(phones?.customer_name) || partyName(record.customer, t("الزبون"));
  const hasDriver = !!record.driver || !!phoneText(phones?.driver_name) || !!phoneText(phones?.driver_phone);
  const driverName = phoneText(phones?.driver_name) || (record.driver ? partyName(record.driver, t("السائق")) : t("بدون سائق"));

  return (
    <FormCard
      title={t("تواصل الرحلة")}
      hint={t("اسم الزبون والسائق ظاهران. الهاتف يُكشف لخدمة العملاء فقط.")}
      footer={
        <button className={btnPrimary} type="button" disabled={revealing} onClick={onReveal}>
          {revealing ? <BusyMark /> : null}
          {revealing ? t("جارٍ التنفيذ…") : phones ? t("تحديث الهواتف") : t("إظهار بيانات التواصل")}
        </button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <ContactPerson role={t("الزبون")} name={customerName} phone={phoneText(phones?.customer_phone)} revealed={!!phones} />
        <ContactPerson role={t("السائق")} name={driverName} phone={phoneText(phones?.driver_phone)} revealed={!!phones} vacant={!hasDriver} />
      </div>
    </FormCard>
  );
}

const ALERT_HINTS: Record<string, string> = {
  LONG_STOP: "السائق توقف أطول من المدة المسموحة.",
  LOCATION_STALE: "موقع السائق لم يتحدث منذ مدة.",
  MAJOR_ROUTE_DEVIATION: "السائق ابتعد عن مسار الرحلة.",
  SCHEDULED_DRIVER_OFFLINE: "سائق الرحلة المجدولة غير متصل.",
  SCHEDULED_DRIVER_DELAY: "سائق الموعد تأخر عن الوقت المطلوب.",
  URGENT_COMPLAINT: "وصلت شكوى عاجلة على هذه الرحلة.",
  EMERGENCY: "حالة طوارئ مرتبطة بهذه الرحلة.",
  DRIVER_COVERAGE_LOW: "طلبات تنتظر في منطقة أكثر من السائقين المتاحين فيها وحولها.",
  ASSIGNMENT_DELAYED: "طلب فوري ما زال يبحث عن سائق بعد الحد المسموح.",
  RIDE_DELAYED: "الرحلة الجارية تجاوزت مدتها المقدّرة بفارق كبير.",
  CANCELLATION_RATE_HIGH: "نسبة الإلغاء في الفرع خلال الفترة الأخيرة تجاوزت الحد.",
  REPLACEMENT_NEEDED: "الرحلة متوقفة بسبب عطل أو حادث — أسند سائقاً بديلاً لإكمالها.",
};

function alertDetailLines(kind: string, row: Record<string, unknown>): string[] {
  const meta = isRecord(row.metadata) ? row.metadata : null;
  const lines: string[] = [];
  if (ALERT_HINTS[kind]) lines.push(t(ALERT_HINTS[kind]));
  if (kind === "REPLACEMENT_NEEDED") {
    lines.push(t("الإجراء المطلوب: إسناد سائق آخر لإكمال الرحلة."));
    if (typeof meta?.phase === "string") {
      lines.push(
        meta.phase === "before_pickup"
          ? t("توقيت العطل: قبل الالتقاط — أُعيد فتح البحث عن سائق.")
          : t("توقيت العطل: أثناء الرحلة — أنشئ رحلة بديلة من نقطة التعطّل."),
      );
    }
  }
  if (typeof meta?.case_type === "string" && meta.case_type) {
    lines.push(`${t("نوع الحالة")}: ${enumLabel(meta.case_type)}`);
  }
  if (typeof meta?.subtype === "string" && meta.subtype) {
    lines.push(`${t("سبب العطل")}: ${enumLabel(meta.subtype)}`);
  }
  if (typeof meta?.note === "string" && meta.note.trim()) {
    lines.push(`${t("ملاحظة السائق")}: ${meta.note.trim()}`);
  }
  if (typeof meta?.public_number === "string" && meta.public_number) {
    lines.push(`${t("رقم الرحلة")}: ${meta.public_number}`);
  }
  if (typeof meta?.resolve_reason === "string" && meta.resolve_reason) {
    lines.push(`${t("سبب الحل")}: ${enumLabel(meta.resolve_reason)}`);
  }
  if (typeof meta?.resolve_notes === "string" && meta.resolve_notes.trim()) {
    lines.push(`${t("ملاحظة الحل")}: ${meta.resolve_notes.trim()}`);
  }
  if (kind === "MAJOR_ROUTE_DEVIATION" && meta) {
    const deviation = formatScalar("distance_m", meta.distance_m);
    const max = formatScalar("max_m", meta.max_m);
    if (deviation) lines.push(`${t("الانحراف")}: ${deviation}`);
    if (max) lines.push(`${t("الحد")}: ${max}`);
  }
  return [...new Set(lines.filter(Boolean))];
}

const COMMAND_CENTER_ALERTS = new Set(["DRIVER_COVERAGE_LOW", "ASSIGNMENT_DELAYED", "RIDE_DELAYED", "CANCELLATION_RATE_HIGH"]);

function alertMeasure(type: string, row: Record<string, unknown>) {
  const measured = row.measured_value == null ? null : Number(row.measured_value);
  const limit = row.threshold == null ? null : Number(row.threshold);
  if (measured == null || !Number.isFinite(measured)) return "";
  if (type === "DRIVER_COVERAGE_LOW") {
    const nearby = isRecord(row.metadata) ? Number(row.metadata.available_nearby ?? 0) : 0;
    return `${t("طلبات بانتظار")} ${measured} · ${t("سائقون متاحون قريباً")} ${nearby}`;
  }
  if (type === "CANCELLATION_RATE_HIGH") return `${t("نسبة الإلغاء")} ${measured}% · ${t("الحد")} ${limit ?? "—"}%`;
  return [
    formatScalar("waited_sec", measured) ? `${t("المدة")} ${formatScalar("waited_sec", measured)}` : "",
    limit != null && formatScalar("limit_sec", limit) ? `${t("الحد")} ${formatScalar("limit_sec", limit)}` : "",
  ].filter(Boolean).join(" · ");
}

function alertStripe(type: string, severity?: unknown) {
  if (severity === "CRITICAL" || type === "REPLACEMENT_NEEDED") return "bg-danger";
  if (COMMAND_CENTER_ALERTS.has(type)) return severity === "INFO" ? "bg-teal" : "bg-warning";
  if (type === "EMERGENCY" || type === "URGENT_COMPLAINT") return "bg-danger";
  if (type === "LONG_STOP" || type === "MAJOR_ROUTE_DEVIATION" || type === "SCHEDULED_DRIVER_DELAY") return "bg-warning";
  return "bg-teal";
}

function AlertResolve({ id, type }: { id: string; type: string }) {
  const call = useGo();
  const confirm = useConfirm();
  const [reason, setReason] = useState("");
  const longStop = type === "LONG_STOP";
  return (
    <DeskForm
      className="flex flex-wrap items-end gap-2"
      action={async (form) => {
        const notes = String(form.get("notes") || "") || undefined;
        await confirm({
          title: t("حل التنبيه"),
          body: t("سيُغلق التنبيه بعد تسجيل الحل."),
          confirm: t("حل التنبيه"),
          perform: () => call(`/erp/alerts/${id}/resolve`, {
            method: "POST",
            body: {
              reason: longStop ? reason || undefined : undefined,
              notes,
            },
          }),
        });
      }}
    >
      {longStop ? (
        <div className="min-w-48 flex-1">
          <EnumSelect kind="longStopReason" name="reason" value={reason} onValueChange={setReason} required placeholder={t("سبب التوقف")} />
        </div>
      ) : null}
      <input className={`${inputClass} min-w-48 flex-1`} name="notes" placeholder={t("ملاحظة الحل")} required={reason === "OTHER"} />
      <button className={`${btnPrimarySm} shrink-0`} type="submit">{t("حل التنبيه")}</button>
    </DeskForm>
  );
}

const LIVE_FLOW = STAFF_ENUMS.liveRideStatus;

export function LiveRides() {
  const rides = useGoList("/erp/rides/live", { limit: 100 });
  const offers = useGoList("/erp/offers", { limit: 50 });
  const alerts = useGoList("/erp/alerts", { status: "OPEN", limit: 50 });
  const emergencies = useGoList("/erp/emergencies", { status: "ACTIVE", limit: 50 });
  const cases = useGoList("/erp/cases", { status: "OPEN", limit: 50 });
  const rows = rides.data ?? [];
  const [focus, setFocus] = useState("");
  const visible = focus ? rows.filter((row) => row.status === focus) : rows;

  return (
    <div className="grid gap-4">
      <PageTitle title={t("غرفة العمليات")} hint={t("جدول الرحلات النشطة والمتوقفة بانتظار بديل: الرقم والحالة والفرع والسائق والتنبيهات. الخريطة في تفاصيل الرحلة. الهاتف لا يظهر هنا.")} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: t("رحلات حية"), value: rows.length, href: "/erp/rides/live", stripe: "bg-brand" },
          { label: t("تنبيهات مفتوحة"), value: alerts.data?.length ?? 0, href: "/erp/alerts", stripe: "bg-warning" },
          { label: t("طوارئ نشطة"), value: emergencies.data?.length ?? 0, href: "/erp/emergencies", stripe: "bg-danger" },
          { label: t("حوادث مفتوحة"), value: cases.data?.length ?? 0, href: "/erp/cases", stripe: "bg-teal" },
        ].map((item) => (
          <Link key={item.href + item.label} href={item.href} className="group relative overflow-hidden rounded-xl border border-line bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-float">
            <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${item.stripe}`} />
            <p className="text-xs font-medium text-muted">{item.label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-heading">{item.value}</p>
          </Link>
        ))}
      </div>
      {(offers.data?.length ?? 0) > 0 ? (
        <Panel>
          <p className="mb-2 text-sm font-semibold">{t("عروض التوزيع المفتوحة")}</p>
          <div className="grid gap-2">
            {(offers.data ?? []).map((offer) => (
              <div key={String(offer.id)} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{entityName(offer.ride) ?? headline(offer)} · {entityName(offer.driver) ?? t("سائق")}</span>
                {typeof offer.status === "string" ? <StatusBadge value={offer.status} label={enumLabel(offer.status)} /> : null}
                {isRecordId(offer.ride) ? <Link className={btnGhost} href={`/erp/rides/${offer.ride.id}`}>{t("فتح الرحلة")}</Link> : null}
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
      <div className={chipGroup}>
        <button type="button" className={focus ? chipClass : chipActive} onClick={() => setFocus("")}>
          {t("الكل")}
          <ChipCount value={rows.length} active={!focus} />
        </button>
        {LIVE_FLOW.map((status) => {
          const count = rows.filter((row) => row.status === status).length;
          const active = focus === status;
          return (
            <button key={status} type="button" className={active ? chipActive : chipClass} onClick={() => setFocus((current) => (current === status ? "" : status))}>
              {enumLabel(status)}
              <ChipCount value={count} active={active} />
            </button>
          );
        })}
      </div>
      {rides.isLoading ? <Panel><p className="text-sm text-muted">{t("جارٍ تحميل الرحلات…")}</p></Panel> : null}
      {rides.error ? <Notice>{t("تعذّر تحميل الرحلات الحية.")}</Notice> : null}
      {!rides.isLoading && visible.length === 0 ? <Panel><p className="text-sm text-muted">{t("لا توجد رحلات في هذه الحالة.")}</p></Panel> : null}
      {visible.length > 0 ? (
        <Panel flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-heading/[0.025]">
                  <th scope="col" className="h-10 whitespace-nowrap px-4 text-start text-xs font-semibold text-muted">{t("الرقم")}</th>
                  <th scope="col" className="h-10 whitespace-nowrap px-4 text-start text-xs font-semibold text-muted">{t("الحالة")}</th>
                  <th scope="col" className="h-10 whitespace-nowrap px-4 text-start text-xs font-semibold text-muted">{t("الفرع")}</th>
                  <th scope="col" className="h-10 whitespace-nowrap px-4 text-start text-xs font-semibold text-muted">{t("السائق")}</th>
                  <th scope="col" className="h-10 whitespace-nowrap px-4 text-start text-xs font-semibold text-muted">{t("التنبيهات")}</th>
                  <th className="h-10 px-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((row) => {
                  const id = String(row.id ?? "");
                  const alertCount = Array.isArray(row.alerts) ? row.alerts.length : 0;
                  return (
                    <tr key={id} className="transition-colors hover:bg-brand/[0.04]">
                      <td className="px-4 py-3 font-semibold text-heading">{headline(row)}</td>
                      <td className="px-4 py-3">{typeof row.status === "string" ? <StatusBadge value={row.status} label={enumLabel(row.status)} /> : "—"}</td>
                      <td className="px-4 py-3 text-body">{entityName(row.branch) ?? "—"}</td>
                      <td className="px-4 py-3 text-body">{entityName(row.driver) ?? t("بانتظار الإسناد")}</td>
                      <td className="px-4 py-3">{alertCount > 0 ? <span className="font-semibold text-danger">{alertOnRide(alertCount)}</span> : <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3 text-end">
                        {id ? <Link className="inline-flex h-8 items-center rounded-md px-2.5 text-xs font-semibold text-accent hover:bg-brand/10" href={`/erp/rides/${id}#ride-map`}>{t("فتح الخريطة")}</Link> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

const SETTLEMENT_KEYS = [
  "payment_method",
  "payment_status",
  "fare_stack_decision",
  "estimated_duration_sec",
  "actual_duration_sec",
  "billable_waiting_sec",
  "gross_final_fare",
  "estimated_fare",
  "discount_total",
  "compensation_total",
  "customer_payable",
] as const;

/** Shown in RideDistances / RideSettlement — keep out of «بيانات السجل». */
const RIDE_FACT_OMIT = [
  ...SETTLEMENT_KEYS,
  "to_customer_distance_m",
  "to_pickup_distance_m",
  "planned_trip_distance_m",
  "estimated_distance_m",
  "with_customer_distance_m",
  "actual_distance_m",
  "to_destination_distance_m",
  "driver_total_distance_m",
  "destination_changed",
  "stops_count",
  "free_waiting_sec",
  "total_wait_sec",
  "pickup_wait",
] as const;

function pickupWaitFromRecord(record: Record<string, unknown>) {
  const nested = isRecord(record.pickup_wait) ? record.pickup_wait : null;
  const freeSec =
    typeof nested?.free_waiting_sec === "number"
      ? nested.free_waiting_sec
      : typeof record.free_waiting_sec === "number"
        ? record.free_waiting_sec
        : 120;
  const totalSec =
    typeof nested?.total_wait_sec === "number"
      ? nested.total_wait_sec
      : null;
  const billableSec =
    typeof nested?.billable_waiting_sec === "number"
      ? nested.billable_waiting_sec
      : typeof record.billable_waiting_sec === "number"
        ? record.billable_waiting_sec
        : null;
  const hasArrived = record.arrived_at != null;
  if (!hasArrived && totalSec == null && billableSec == null) return null;
  return { freeSec, totalSec, billableSec };
}

function RideDistances({ record }: { record: Record<string, unknown> }) {
  const toCustomer =
    formatScalar("to_customer_distance_m", record.to_customer_distance_m) ||
    formatScalar("to_pickup_distance_m", record.to_pickup_distance_m);
  const planned =
    formatScalar("planned_trip_distance_m", record.planned_trip_distance_m) ||
    formatScalar("estimated_distance_m", record.estimated_distance_m);
  const withCustomer =
    formatScalar("with_customer_distance_m", record.with_customer_distance_m) ||
    formatScalar("actual_distance_m", record.actual_distance_m);
  const duration =
    formatScalar("actual_duration_sec", record.actual_duration_sec) ||
    formatScalar("estimated_duration_sec", record.estimated_duration_sec);
  const stops = Array.isArray(record.stops) ? record.stops.filter(isRecord) : [];
  const destinationChanged = record.destination_changed === true;
  const bookedDestination =
    typeof record.original_destination_address === "string" && record.original_destination_address
      ? record.original_destination_address
      : null;
  const pickupWait = pickupWaitFromRecord(record);
  const hasAny = toCustomer || planned || withCustomer || stops.length > 0 || pickupWait;
  if (!hasAny) return null;

  return (
    <FormCard
      title={t("المسافات")}
      hint={t("الأجرة وعمولة المنصة تُحسب فقط على المسافة مع العميل في السيارة — مسار الذهاب للعميل بدون عمولة ولا يدخل في الأجرة.")}
    >
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
          <dt className="text-[11px] font-medium text-muted">{t("إلى العميل")}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-heading">
            {toCustomer || t("غير متاح")}
          </dd>
          <p className="mt-1 text-[12px] text-muted">{t("من موقع السائق إلى نقطة الالتقاط")}</p>
        </div>
        <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
          <dt className="text-[11px] font-medium text-muted">{t("تقدير الطلب")}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-heading">
            {planned || t("غير متاح")}
          </dd>
          <p className="mt-1 text-[12px] text-muted">{t("من الالتقاط إلى الوجهة عند إنشاء الطلب")}</p>
        </div>
        <div className="min-w-0 rounded-lg border border-teal/40 bg-brand/[0.06] px-3.5 py-3 sm:col-span-2 lg:col-span-1">
          <dt className="text-[11px] font-medium text-muted">{t("مع العميل في السيارة")}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-heading">
            {withCustomer || t("غير متاح بعد")}
          </dd>
          <p className="mt-1 text-[12px] text-muted">
            {t("كل الكيلومترات بعد الركوب حتى التنزيل — بما فيها تغيير الوجهة")}
          </p>
        </div>
        {duration ? (
          <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
            <dt className="text-[11px] font-medium text-muted">{t("مدة الرحلة")}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-heading">{duration}</dd>
            <p className="mt-1 text-[12px] text-muted">
              {record.actual_duration_sec != null ? t("فعلي مع العميل") : t("تقدير عند الطلب")}
            </p>
          </div>
        ) : null}
        {pickupWait ? (
          <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3 sm:col-span-2 lg:col-span-1">
            <dt className="text-[11px] font-medium text-muted">{t("انتظار الالتقاط")}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-heading">
              {pickupWait.billableSec != null && pickupWait.billableSec > 0
                ? formatScalar("billable_waiting_sec", pickupWait.billableSec)
                : pickupWait.totalSec != null
                  ? formatScalar("total_wait_sec", pickupWait.totalSec)
                  : t("ضمن المجاني")}
            </dd>
            <p className="mt-1 text-[12px] text-muted">
              {t("دقيقتان مجاناً بعد وصول السائق — الزائد يدخل الأجرة ويزيد أجر السائق")}
              {pickupWait.totalSec != null
                ? ` · ${t("الإجمالي")}: ${formatScalar("total_wait_sec", pickupWait.totalSec)}`
                : ""}
              {` · ${t("مجاني")}: ${formatScalar("free_waiting_sec", pickupWait.freeSec)}`}
            </p>
          </div>
        ) : null}
        <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
          <dt className="text-[11px] font-medium text-muted">{t("التوقفات")}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-heading">{stops.length}</dd>
          <p className="mt-1 text-[12px] text-muted">{t("محطات أُضيفت أثناء الرحلة")}</p>
        </div>
      </dl>

      {destinationChanged || bookedDestination ? (
        <div className="mt-4 grid gap-2 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3 text-sm">
          {bookedDestination ? (
            <p>
              <span className="text-muted">{t("الوجهة عند الطلب")}: </span>
              <span className="font-medium text-heading">{bookedDestination}</span>
            </p>
          ) : null}
          {destinationChanged ? (
            <p className="font-semibold text-warning">
              {t("نقطة التنزيل الفعلية اختلفت عن الوجهة الأصلية (تغيير وجهة أو مكان آخر).")}
            </p>
          ) : null}
        </div>
      ) : null}

      {stops.length ? (
        <ol className="mt-4 grid gap-2">
          {stops.map((stop, index) => {
            const label =
              typeof stop.address === "string" && stop.address.trim()
                ? stop.address.trim()
                : `${t("محطة")} ${index + 1}`;
            const wait =
              stop.waiting_seconds != null ? formatScalar("billable_waiting_sec", stop.waiting_seconds) : "";
            return (
              <li
                key={typeof stop.id === "string" ? stop.id : `stop-${index}`}
                className="flex gap-3 rounded-lg bg-canvas px-3 py-2.5 text-sm"
              >
                <span className="mt-1 size-2 shrink-0 rounded-full bg-teal" />
                <div className="min-w-0">
                  <p className="font-semibold text-heading">
                    {t("محطة")} {index + 1}: {label}
                  </p>
                  {wait ? <p className="text-xs text-muted">{t("انتظار")}: {wait}</p> : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </FormCard>
  );
}

const BONUS_REASON: Record<string, string> = {
  REJECTION: "طلب رفضه سائقون آخرون",
  DISTANCE: "بعيد عن المركز",
  "REJECTION+DISTANCE": "رفض وبعد عن المركز",
};

function DriverBonusLine({ record }: { record: Record<string, unknown> }) {
  const pct = Number(record.incentive_percentage);
  const grants = Array.isArray(record.incentive_grants) ? (record.incentive_grants as Record<string, unknown>[]) : [];
  if (!(pct > 0) && grants.length === 0) return null;
  const reason = typeof record.incentive_reason === "string" ? record.incentive_reason : "";
  const paid = grants.reduce((sum, grant) => sum + (Number(grant.amount) || 0), 0);
  return (
    <div className="mt-4 rounded-lg border border-line bg-heading/[0.02] px-3 py-2 text-sm">
      <span className="font-medium text-heading">{t("مكافأة السائق")}: </span>
      {pct > 0 ? <span dir="auto">{pct}% {reason ? `(${t(BONUS_REASON[reason] ?? reason)})` : ""}</span> : null}
      {grants.length ? (
        <span className="ms-2 text-muted">
          {t("صُرف")}: <span className="font-semibold text-heading">{formatMoney(paid)}</span>
          {" — "}
          {grants.map((grant) => enumLabel(String(grant.kind))).join("، ")}
        </span>
      ) : record.status === "COMPLETED" ? (
        <span className="ms-2 text-muted">{t("لم تُصرف (الرحلة أقصر من الحد الأدنى أو بلغ السقف اليومي).")}</span>
      ) : (
        <span className="ms-2 text-muted">{t("تُصرف عند إكمال الرحلة.")}</span>
      )}
    </div>
  );
}

const TIMELINE_LABELS: Record<string, string> = {
  CREATED: "إنشاء الطلب",
  OFFERED: "عرض على سائق",
  ASSIGNED: "قبول / إسناد",
  EN_ROUTE: "التوجه إلى الراكب",
  ARRIVED: "الوصول لنقطة الالتقاء",
  STARTED: "بدء الرحلة",
  COMPLETED: "إكمال الرحلة",
  CANCELLED: "إلغاء",
  NO_SHOW: "عدم حضور",
  PICKUP_UPDATED: "تعديل نقطة الالتقاء",
  BREAKDOWN_REPORTED: "بلاغ تعطّل السيارة",
};

function RideTimeline({ rideId }: { rideId: string }) {
  const timeline = useGoRecord(`/erp/rides/${rideId}/timeline`);
  const data = timeline.data ?? null;
  const events = Array.isArray(data?.events) ? data.events : [];
  const caveats = Array.isArray(data?.caveats) ? data.caveats.map(String) : [];
  const pickup = isRecord(data?.pickup) ? data.pickup : null;

  return (
    <FormCard title={t("السجل الزمني للرحلة")}>
      {timeline.isLoading ? <p className="text-sm text-muted">{t("جاري التحميل…")}</p> : null}
      {!timeline.isLoading && events.length === 0 ? <p className="text-sm text-muted">{t("لا توجد أحداث مسجّلة.")}</p> : null}
      {pickup && (pickup.source || pickup.updated_at) ? (
        <p className="mb-3 text-sm text-muted">
          {t("مصدر نقطة الالتقاء")}:{" "}
          <span className="font-medium text-heading">{typeof pickup.source === "string" ? pickup.source : t("غير محدد")}</span>
          {typeof pickup.updated_at === "string" ? (
            <>
              {" · "}
              {t("آخر تعديل")}: {formatScalar("updated_at", pickup.updated_at)}
            </>
          ) : null}
        </p>
      ) : null}
      <ol className="grid gap-2">
        {events.map((raw, index) => {
          if (!isRecord(raw)) return null;
          const type = typeof raw.type === "string" ? raw.type : "";
          const at = typeof raw.at === "string" ? formatScalar("created_at", raw.at) : "";
          const verification = typeof raw.verification === "string" ? raw.verification : "";
          return (
            <li key={`${type}-${at}-${index}`} className="flex gap-3 rounded-lg bg-canvas px-3 py-2.5">
              <span className="mt-1 size-2 shrink-0 rounded-full bg-brand" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-heading">{TIMELINE_LABELS[type] ?? type}</p>
                <p className="text-xs text-muted">
                  {at}
                  {verification ? ` · ${verification}` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {caveats.length ? (
        <p className="mt-3 text-[12px] leading-5 text-muted">
          {t("تنبيه للمراجعة")}: {t("موقع GPS وحده ليس دليلاً قاطعاً؛ قد تتأخر الأحداث مع ضعف الشبكة. الوصول مسجّل بإقرار السائق.")}
        </p>
      ) : null}
      <p className="mt-2 text-[12px] text-muted">
        {t("خلاف مالي")}:{" "}
        <Link className="font-semibold text-accent" href="/erp/wallets">
          {t("محافظ السائقين")}
        </Link>
        {" · "}
        <Link className="font-semibold text-accent" href="/erp/finance/compensation">
          {t("التعويضات")}
        </Link>
      </p>
    </FormCard>
  );
}

function RideSettlement({ record }: { record: Record<string, unknown> }) {
  const status = typeof record.status === "string" ? record.status : "";
  const facts = SETTLEMENT_KEYS.flatMap((key) => {
    const value = formatScalar(key, record[key]);
    if (!value) return [];
    const raw = record[key];
    const badge = typeof raw === "string" && (key === "payment_status" || key === "fare_stack_decision" || key === "payment_method") ? raw : "";
    return [{ key, value, badge }];
  });
  if (facts.length === 0) return null;
  const cancelFree = status === "SEARCHING" || status === "DRIVER_ASSIGNED";
  const cancelPenalty = status === "DRIVER_EN_ROUTE" || status === "ARRIVED";
  const cancelClosed = status === "IN_PROGRESS";
  return (
    <FormCard title={t("الأجرة والدفع")}>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.key} className="min-w-0">
            <dt className="text-[11px] font-medium text-muted">{labelOf(fact.key)}</dt>
            <dd className="mt-1 text-sm font-semibold text-heading">
              {fact.badge ? <StatusBadge value={fact.badge} label={enumLabel(fact.badge)} /> : fact.value}
            </dd>
          </div>
        ))}
      </dl>
      <DriverBonusLine record={record} />
      {cancelFree ? <p className="mt-3 text-sm text-muted">{t("يمكن للعميل إلغاء الرحلة أثناء البحث أو بعد الإسناد (مع نقاط إن تأخر عن النافذة المجانية).")}</p> : null}
      {cancelPenalty ? <p className="mt-3 text-sm text-muted">{t("يمكن للعميل الإلغاء بعد تحرك السائق أو وصوله، مع خصم نقاط أعلى. لا رسوم نقدية على العميل وفق سياسة Beroya.")}</p> : null}
      {cancelClosed ? <p className="mt-3 text-sm text-muted">{t("لا يمكن إلغاء الرحلة بعد بدئها.")}</p> : null}
    </FormCard>
  );
}

export function RideDetail({ rideId }: { rideId: string }) {
  const { session } = useDesk();
  const call = useGo();
  const confirm = useConfirm();
  const router = useRouter();
  const role = session?.user.role;
  const [phones, setPhones] = useState<Record<string, unknown> | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [compensationType, setCompensationType] = useState("PERCENTAGE");
  const cs = roleIs(role, ["CUSTOMER_SERVICE", "CUSTOMER_SERVICE_SUPERVISOR"]);
  const supervisor = roleIs(role, ["CUSTOMER_SERVICE_SUPERVISOR"]);
  const fareDecider = roleIs(role, ["CUSTOMER_SERVICE_SUPERVISOR", "ADMIN"]);
  const canStaffCancel = roleIs(role, ["CUSTOMER_SERVICE_SUPERVISOR", "ADMIN"]);
  const activeForStaffCancel = ["SEARCHING", "DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "ARRIVED", "IN_PROGRESS"];

  useEffect(() => {
    setPhones(null);
  }, [rideId]);

  async function run(path: string, body?: unknown, idempotent = false) {
    const result = await call<Record<string, unknown>>(path, { method: "POST", body, idempotent });
    return isGoFailure(result) ? null : result;
  }

  return (
    <DetailScreen
      title={t("تفاصيل الرحلة")}
      path={`/erp/rides/${rideId}`}
      omitPhones
      omitFactKeys={RIDE_FACT_OMIT}
    >
      {(record) => {
        const replacement = Array.isArray(record.replacement_rides)
          ? record.replacement_rides.find((item) => isRecordId(item))
          : isRecordId(record.replacement_ride)
            ? record.replacement_ride
            : null;
        const original = isRecordId(record.replacement_of_ride) ? record.replacement_of_ride : typeof record.replacement_of_ride_id === "string" ? { id: record.replacement_of_ride_id } : null;
        const openCase = Array.isArray(record.cases)
          ? record.cases.find(
              (item) =>
                isRecord(item) &&
                (item.type === "BREAKDOWN" || item.type === "ACCIDENT") &&
                (item.status === "OPEN" || item.status === "IN_REVIEW") &&
                !item.replacement_ride_id,
            )
          : null;
        const caseReason =
          isRecord(openCase) && typeof openCase.reason_code === "string" && openCase.reason_code
            ? enumLabel(openCase.reason_code)
            : null;
        const caseNote =
          isRecord(openCase) && typeof openCase.driver_statement === "string" && openCase.driver_statement.trim()
            ? openCase.driver_statement.trim()
            : isRecord(openCase) && typeof openCase.customer_statement === "string" && openCase.customer_statement.trim()
              ? openCase.customer_statement.trim()
              : null;
        const needsReplacement = record.status === "INTERRUPTED" && !replacement;
        const stopPoint = breakdownStopOf(record);
        return (
        <>
          {needsReplacement ? (
            <Notice>
              <p className="font-semibold text-heading">{t("بحاجة لإسناد سائق آخر")}</p>
              <p className="mt-1">
                {t("الرحلة متوقفة ولا تكتمل حتى يُنشأ بديل ويُسند سائق من نقطة التعطّل إلى الوجهة.")}
              </p>
              {caseReason ? (
                <p className="mt-1">
                  {t("السبب")}: <span className="font-medium">{caseReason}</span>
                  {isRecord(openCase) && typeof openCase.type === "string" ? ` · ${enumLabel(openCase.type)}` : null}
                </p>
              ) : (
                <p className="mt-1">{t("السبب: عطل أو حادث أبلغ عنه السائق.")}</p>
              )}
              {caseNote ? <p className="mt-1 text-muted">{caseNote}</p> : null}
              {isRecord(openCase) && typeof openCase.id === "string" ? (
                <p className="mt-2">
                  <Link className="font-semibold text-accent" href={`/erp/cases/${openCase.id}`}>{t("فتح قضية العطل")}</Link>
                </p>
              ) : null}
            </Notice>
          ) : null}
          {replacement ? (
            <Notice>
              {t("هذه الرحلة استُبدلت. المسار المتبقي على الرحلة الجديدة.")}{" "}
              <Link className="font-semibold text-accent" href={`/erp/rides/${replacement.id}#ride-map`}>{t("فتح الرحلة البديلة")}</Link>
            </Notice>
          ) : null}
          {original ? (
            <Notice>
              {t("هذه رحلة بديلة. الخط المعروض هو المتبقي حتى الوجهة.")}{" "}
              <Link className="font-semibold text-accent" href={`/erp/rides/${original.id}`}>{t("الرحلة الأصلية")}</Link>
            </Notice>
          ) : null}
          <RideTrackMap rideId={rideId} />
          <RideDistances record={record} />
          <RideTimeline rideId={rideId} />
          <RideSettlement record={record} />
          {cs ? (
            <RideContact
              record={record}
              phones={phones}
              revealing={revealing}
              onReveal={() => {
                setRevealing(true);
                void call<Record<string, unknown>>(`/erp/rides/${rideId}/contact-info`)
                  .then((data) => {
                    if (!isGoFailure(data)) setPhones(data);
                  })
                  .finally(() => setRevealing(false));
              }}
            />
          ) : null}
          {record.status === "SEARCHING" && !record.driver_id && !isRecordId(record.driver) ? (
            <DeskForm action={async (form) => { const driverId = String(form.get("driver_id")); await confirm({ title: t("إسناد سائق"), body: t("ستُسند الرحلة إلى السائق المختار."), confirm: t("إسناد"), perform: () => run(`/erp/rides/${rideId}/assign`, { driver_id: driverId }, true) }); }}>
              <FormCard title={t("إسناد سائق")} footer={<button className={btnDark} type="submit">{t("إسناد")}</button>}>
                <NamedSelect path="/erp/drivers" name="driver_id" label={t("إسناد سائق")} required placeholder={t("اختر السائق")} />
              </FormCard>
            </DeskForm>
          ) : null}
          {cs && (record.status === "IN_PROGRESS" || record.status === "INTERRUPTED") ? (
            <DeskForm
              action={async (form) => {
                const reason = String(form.get("reason"));
                const driverId = String(form.get("driver_id") || "").trim();
                await confirm({
                  title: t("إسناد سائق بديل بعد التعطّل"),
                  body: t("يُحتسب أجر السائق الأول حتى نقطة التعطّل، وتُنشأ رحلة جديدة من هناك إلى الوجهة. اختيار سائق يسنده فوراً؛ وإلا تُفتح للبحث."),
                  confirm: t("تأكيد"),
                  danger: true,
                  perform: async () => {
                    const created = await run(
                      `/erp/rides/${rideId}/replacement`,
                      {
                        reason,
                        lat: stopPoint?.lat,
                        lng: stopPoint?.lng,
                        driver_id: driverId || undefined,
                      },
                      true,
                    );
                    const next =
                      created && isRecord(created.replacement) && typeof created.replacement.id === "string"
                        ? created.replacement.id
                        : "";
                    if (next) router.push(`/erp/rides/${next}#ride-map`);
                  },
                });
              }}
            >
              <FormCard
                title={t("إسناد سائق بديل بعد تعطّل السيارة")}
                footer={<button className={btnDark} type="submit">{t("إنشاء بديل وإسناد")}</button>}
              >
                <p className="mb-3 text-sm text-muted">
                  {t("لا تُصفَّر الأجرة تلقائياً. عمولة السائق الأول = من البداية حتى موقع التعطّل. السائق الثاني = من التعطّل إلى الوجهة.")}
                </p>
                {stopPoint ? (
                  <BreakdownStopPlace stop={stopPoint} />
                ) : (
                  <p className="mb-3 text-sm text-warning-ink">
                    {t("لا يوجد موقع GPS محفوظ — سيُستخدم موقع الالتقاط كاحتياط.")}
                  </p>
                )}
                <FormGrid>
                  <Field label={t("سبب الحالة")}>
                    <EnumSelect kind="caseType" name="reason" defaultValue="BREAKDOWN" />
                  </Field>
                  <NamedSelect
                    path="/erp/drivers"
                    name="driver_id"
                    label={t("السائق البديل")}
                    placeholder={t("اختياري — اتركه فارغاً للبحث التلقائي")}
                  />
                </FormGrid>
              </FormCard>
            </DeskForm>
          ) : null}
          {fareDecider && record.fare_stack_decision === "PENDING" ? (
            <DeskForm
              action={async (form) => {
                const decision = String(form.get("decision"));
                await confirm({
                  title: t("تثبيت القرار"),
                  body: t("سيثبّت قرار الخصم والتعويض على هذه الرحلة."),
                  confirm: t("تثبيت القرار"),
                  perform: () => run(`/erp/rides/${rideId}/fare-stack`, { decision }),
                });
              }}
            >
              <FormCard title={t("قرار الخصم والتعويض")} footer={<button className={btnDark} type="submit">{t("تثبيت القرار")}</button>}>
                <p className="mb-3 text-sm text-muted">{t("الخصم والتعويض مجتمعان على هذه الرحلة. المستحق يبقى على الأجرة الكاملة حتى تثبيت القرار.")}</p>
                <Field label={t("القرار")}>
                  <EnumSelect kind="fareStackDecision" name="decision" defaultValue="DISCOUNT_ONLY" />
                </Field>
              </FormCard>
            </DeskForm>
          ) : null}
          {supervisor ? (
            <DeskForm
              action={async (form) => {
                const body = {
                  type: compensationType,
                  percentage: compensationType === "PERCENTAGE" && form.get("percentage") ? Number(form.get("percentage")) : undefined,
                  fixed_amount: compensationType === "FIXED_AMOUNT" && form.get("fixed_amount") ? Number(form.get("fixed_amount")) : undefined,
                  reason: String(form.get("reason")),
                };
                await confirm({
                  title: t("تطبيق التعويض"),
                  body: t("سيُطبَّق التعويض على هذه الرحلة."),
                  confirm: t("تطبيق التعويض"),
                  perform: () => run(`/erp/rides/${rideId}/compensation`, body, true),
                });
              }}
            >
              <FormCard title={t("تطبيق التعويض")} footer={<button className={btnDark} type="submit">{t("تطبيق التعويض")}</button>}>
                <FormGrid>
                  <Field label={t("نوع التعويض")}>
                    <EnumSelect kind="compensationType" name="type" value={compensationType} onValueChange={setCompensationType} />
                  </Field>
                  {compensationType === "PERCENTAGE" ? (
                    <Field label={t("النسبة")}><input className={inputClass} name="percentage" inputMode="decimal" required /></Field>
                  ) : (
                    <Field label={`${t("مبلغ ثابت")} (${t("ل.س")})`}><input className={inputClass} name="fixed_amount" inputMode="decimal" required /></Field>
                  )}
                  <Field label={t("السبب")}><input className={inputClass} name="reason" required /></Field>
                </FormGrid>
              </FormCard>
            </DeskForm>
          ) : null}
          {canStaffCancel && typeof record.status === "string" && activeForStaffCancel.includes(record.status) ? (
            <DeskForm
              action={async (form) => {
                const body = {
                  reason: String(form.get("reason") || ""),
                  reason_code: String(form.get("reason_code") || "STAFF_CANCEL"),
                  penalize_customer: form.get("penalize_customer") === "on",
                  penalize_driver: form.get("penalize_driver") === "on",
                  wallet_penalty: form.get("wallet_penalty") === "on",
                };
                await confirm({
                  title: t("إلغاء إداري"),
                  body: t("ستُلغى الرحلة من المكتب. اختر العقوبات بحذر."),
                  confirm: t("إلغاء الرحلة"),
                  danger: true,
                  perform: () => run(`/erp/rides/${rideId}/cancel`, body, true),
                });
              }}
            >
              <FormCard title={t("إلغاء إداري")} footer={<button className={btnDark} type="submit">{t("إلغاء الرحلة")}</button>}>
                <p className="mb-4 text-sm leading-6 text-muted">
                  {t("سجّل سبب الإلغاء، ثم فعّل العقوبات المناسبة فقط. الخيارات غير المفعّلة لا تطبّق أي خصم.")}
                </p>
                <FormGrid>
                  <Field label={t("رمز السبب")}><input className={inputClass} name="reason_code" defaultValue="STAFF_CANCEL" /></Field>
                  <Field label={t("السبب")}><input className={inputClass} name="reason" required /></Field>
                  <FormSpan>
                    <div className="rounded-xl border border-line bg-heading/[0.025] p-3.5">
                      <p className="mb-3 text-[13px] font-semibold text-heading">{t("العقوبات الاختيارية")}</p>
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <CheckField
                          name="penalize_customer"
                          tone="warn"
                          label={t("خصم نقاط من العميل")}
                          hint={t("يُخصم من جواز سفر العميل عند الإلغاء الإداري.")}
                        />
                        <CheckField
                          name="penalize_driver"
                          tone="warn"
                          label={t("خصم نقاط من السائق")}
                          hint={t("يُخصم من نقاط أداء السائق فقط، دون المحفظة.")}
                        />
                        <div className="sm:col-span-2">
                          <CheckField
                            name="wallet_penalty"
                            tone="warn"
                            defaultChecked
                            label={t("خصم من محفظة السائق")}
                            hint={t("يُطبَّق خصم مالي من المحفظة مع نقاط السائق معاً.")}
                          />
                        </div>
                      </div>
                    </div>
                  </FormSpan>
                </FormGrid>
              </FormCard>
            </DeskForm>
          ) : null}
          <RelatedLinks record={record} />
        </>
        );
      }}
    </DetailScreen>
  );
}

const RIDE_LINKS: { key: string; label: string; href: (row: Record<string, unknown>) => string | null }[] = [
  { key: "complaints", label: "الشكاوى", href: (row) => (typeof row.id === "string" ? `/erp/complaints/${row.id}` : null) },
  { key: "cases", label: "القضايا", href: (row) => (typeof row.id === "string" ? `/erp/cases/${row.id}` : null) },
  { key: "emergencies", label: "الطوارئ", href: (row) => (typeof row.id === "string" ? `/erp/emergencies/${row.id}` : null) },
  { key: "compensations", label: "التعويضات", href: (row) => (typeof row.id === "string" ? `/erp/finance/compensation/${row.id}` : null) },
  { key: "entitlements", label: "المستحقات", href: (row) => (typeof row.id === "string" ? `/erp/finance/entitlements/${row.id}` : null) },
  { key: "offers", label: "عروض التوزيع", href: () => null },
  { key: "ratings", label: "التقييمات", href: () => null },
];

function RelatedLinks({ record }: { record: Record<string, unknown> }) {
  const blocks = RIDE_LINKS.flatMap((block) => {
    const value = record[block.key];
    const rows = Array.isArray(value)
      ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      : [];
    return rows.length ? [{ ...block, rows }] : [];
  });
  if (blocks.length === 0) return null;
  return (
    <div className="grid gap-5">
      {blocks.map((block) => (
        <RecordList key={block.key} title={t(block.label)} rows={block.rows} href={block.href} />
      ))}
    </div>
  );
}

export function RideHistory({ lockedType }: { lockedType?: "SCHEDULED" } = {}) {
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  return (
    <ListScreen
      title={lockedType === "SCHEDULED" ? t("الرحلات المجدولة") : t("سجل الرحلات")}
      hint={lockedType === "SCHEDULED" ? t("الرحلات التي موعدها محدد مسبقاً.") : t("كل الرحلات ضمن نطاق الموظف، بما فيها المنتهية. التصفية ترسل حالة الخادم كما هي.")}
      path="/erp/rides"
      dates
      initialQuery={{
        ...(lockedType ? { type: lockedType } : {}),
        ...(q ? { q } : {}),
      }}
      search={{
        param: "q",
        placeholder: t("ابحث برقم الرحلة"),
        hint: t("البحث يشمل كل الصفحات وليس الصفحة الحالية فقط."),
      }}
      filters={[
        { name: "status", label: t("الحالة"), options: [...STAFF_ENUMS.rideStatus] },
        ...(lockedType ? [] : [{ name: "type", label: t("النوع"), options: ["IMMEDIATE", "SCHEDULED"] }]),
      ]}
      lookups={[
        { name: "customer_id", label: t("العميل"), path: "/erp/customers" },
        { name: "driver_id", label: t("السائق"), path: "/erp/drivers" },
        { name: "branch_id", label: t("الفرع"), path: "/erp/branches" },
      ]}
      rowHref={(row) => (typeof row.id === "string" ? `/erp/rides/${row.id}` : null)}
    />
  );
}

export function AlertsScreen() {
  const { session } = useDesk();
  const call = useGo();
  const resolvesRideAlerts = roleIs(session?.user.role, ["CUSTOMER_SERVICE", "CUSTOMER_SERVICE_SUPERVISOR"]);
  const resolvesAreaAlerts = roleIs(session?.user.role, ["OPERATIONS", "CUSTOMER_SERVICE_SUPERVISOR", "ADMIN"]);
  const [status, setStatus] = useState("OPEN");
  const [type, setType] = useState("");
  const [severity, setSeverity] = useState("");
  const [rideId, setRideId] = useState("");
  const [branchId, setBranchId] = useState("");
  const list = useGoList("/erp/alerts", { status, type, severity, ride_id: rideId, branch_id: branchId, limit: 50 });
  const rows = list.data ?? [];

  return (
    <div className="grid gap-5">
      <PageTitle title={t("التنبيهات")} hint={t("كل تنبيه يعرض السبب والتفاصيل. عطل المركبة ينشئ تنبيهاً «بحاجة لإسناد سائق بديل» مع القضية المرتبطة.")} />
      <div className={chipGroup}>
        {STAFF_ENUMS.alertStatus.map((value) => (
          <button key={value} type="button" className={status === value ? chipActive : chipClass} onClick={() => setStatus(value)}>
            {enumLabel(value)}
          </button>
        ))}
      </div>
      <Panel className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Field label={t("النوع")}>
            <EnumSelect kind="alertType" value={type} onValueChange={setType} allowEmpty emptyLabel={t("كل الأنواع")} />
          </Field>
        </div>
        <div className="min-w-44">
          <Field label={t("الخطورة")}>
            <EnumSelect kind="alertSeverity" value={severity} onValueChange={setSeverity} allowEmpty emptyLabel={t("كل المستويات")} />
          </Field>
        </div>
        <LookupSelect path="/erp/rides" label={t("الرحلة")} value={rideId} onValueChange={setRideId} />
        <LookupSelect path="/erp/branches" label={t("الفرع")} value={branchId} onValueChange={setBranchId} />
      </Panel>
      {list.isLoading ? (
        <Panel>
          <div className="grid gap-3">
            <div className="h-4 w-40 animate-pulse rounded-full bg-line" />
            <div className="h-16 animate-pulse rounded-lg bg-heading/[0.04]" />
            <div className="h-16 animate-pulse rounded-lg bg-heading/[0.04]" />
          </div>
        </Panel>
      ) : null}
      {!list.isLoading && rows.length === 0 ? <EmptyState title={t("لا توجد تنبيهات في هذا النطاق.")} hint={t("غيّر الحالة أو النوع أو انتظر تنبيهاً جديداً.")} /> : null}
      <div className="grid gap-3">
        {rows.map((row) => {
          const id = String(row.id ?? "");
          const rideHref = typeof row.ride_id === "string" ? row.ride_id : isRecordId(row.ride) ? row.ride.id : "";
          const kind = typeof row.type === "string" ? row.type : "";
          const ride = row.ride && typeof row.ride === "object" ? (row.ride as Record<string, unknown>) : null;
          const customer = ride ? entityName(ride.customer) : null;
          const driver = ride ? entityName(ride.driver) : null;
          const areaAlert = COMMAND_CENTER_ALERTS.has(kind);
          const canResolve = areaAlert ? resolvesAreaAlerts : resolvesRideAlerts;
          const measure = areaAlert ? alertMeasure(kind, row) : "";
          const details = alertDetailLines(kind, row);
          const meta = isRecord(row.metadata) ? row.metadata : null;
          const caseHref = typeof meta?.case_id === "string" ? meta.case_id : "";
          return (
            <article key={id} className="relative rounded-xl border border-line bg-surface shadow-card">
              <span aria-hidden className={`absolute inset-y-0 start-0 w-1 rounded-s-xl ${alertStripe(kind, row.severity)}`} />
              <div className="grid gap-4 p-5 ps-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[16px] font-semibold text-heading">{kind ? enumLabel(kind) : headline(row)}</h2>
                      {typeof row.status === "string" ? <StatusBadge value={row.status} label={enumLabel(row.status)} /> : null}
                      {typeof row.severity === "string" ? <StatusBadge value={row.severity} label={enumLabel(row.severity)} /> : null}
                      {row.occurrence_no != null ? <span className="text-xs font-medium text-muted">{t("التكرار")} {String(row.occurrence_no)}</span> : null}
                    </div>
                    {details.length > 0 ? (
                      <ul className="mt-2 grid gap-1 text-[13px] leading-6 text-body">
                        {details.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                    {measure ? <p className="mt-1 text-sm font-medium text-heading">{measure}</p> : null}
                    <p className="mt-2 text-sm">
                      <span className="font-semibold text-heading">{entityName(row.ride) ?? t("بدون رحلة")}</span>
                      {entityName(row.branch) ? <span className="text-muted"> · {entityName(row.branch)}</span> : null}
                      {typeof ride?.status === "string" ? <span className="text-muted"> · {enumLabel(ride.status)}</span> : null}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {t("الزبون")}: <span className="font-medium text-heading">{customer ?? t("غير معروف")}</span>
                      <span className="mx-2 text-muted">·</span>
                      {t("السائق")}: <span className="font-medium text-heading">{driver ?? t("بانتظار الإسناد")}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted">{formatScalar("started_at", row.started_at)}</p>
                    {row.status === "CLAIMED" && entityName(row.claimed_by) ? (
                      <p className="mt-1 text-xs text-muted">{t("استلمه")} {entityName(row.claimed_by)}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {rideHref && kind === "REPLACEMENT_NEEDED" ? (
                      <Link className={btnPrimarySm} href={`/erp/rides/${rideHref}`}>{t("إسناد سائق بديل")}</Link>
                    ) : null}
                    {rideHref ? <Link className={btnGhostSm} href={`/erp/rides/${rideHref}#ride-map`}>{t("فتح الخريطة")}</Link> : null}
                    {caseHref ? <Link className={btnGhostSm} href={`/erp/cases/${caseHref}`}>{t("فتح القضية")}</Link> : null}
                    {typeof row.h3_cell === "string" && row.h3_cell ? <Link className={btnGhostSm} href={`/erp/command-center?cell=${row.h3_cell}`}>{t("فتح في الرادار")}</Link> : null}
                    {row.status === "OPEN" ? (
                      <ConfirmButton className={btnPrimarySm} ask={{ title: t("استلام التنبيه"), body: t("سيُسند هذا التنبيه إليك."), confirm: t("استلام") }} onConfirm={() => call(`/erp/alerts/${id}/claim`, { method: "POST" })}>{t("استلام")}</ConfirmButton>
                    ) : null}
                  </div>
                </div>
                {canResolve && row.status !== "RESOLVED" ? (
                  <div className="border-t border-line pt-4">
                    <AlertResolve id={id} type={kind} />
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function ComplaintsScreen() {
  return (
    <ListScreen
      title={t("الشكاوى")}
      path="/erp/complaints"
        filters={[
          { name: "status", label: t("الحالة"), options: [...STAFF_ENUMS.complaintStatus] },
          { name: "priority", label: t("الأولوية"), options: [...STAFF_ENUMS.complaintPriority] },
        ]}
      rowHref={(row) => (typeof row.id === "string" ? `/erp/complaints/${row.id}` : null)}
    />
  );
}

function complaintRideId(record: Record<string, unknown>) {
  if (typeof record.ride_id === "string" && record.ride_id) return record.ride_id;
  if (isRecordId(record.ride)) return record.ride.id;
  return "";
}

function ComplaintRidePanel({ complaint }: { complaint: Record<string, unknown> }) {
  const rideId = complaintRideId(complaint);
  const rideQuery = useGoRecord(`/erp/rides/${rideId}`, Boolean(rideId));
  if (!rideId) {
    return <Notice>{t("لا توجد رحلة مرتبطة بهذه الشكوى.")}</Notice>;
  }
  if (rideQuery.isLoading) {
    return (
      <FormCard title={t("تفاصيل الرحلة")}>
        <p className="text-sm text-muted">{t("جارٍ تحميل الرحلة…")}</p>
      </FormCard>
    );
  }
  const ride = rideQuery.data;
  if (!ride || rideQuery.isError) {
    return (
      <FormCard
        title={t("تفاصيل الرحلة")}
        action={
          <Link className={btnGhostSm} href={`/erp/rides/${rideId}`}>
            {t("فتح الرحلة")}
          </Link>
        }
      >
        <Notice>{t("تعذّر تحميل تفاصيل الرحلة.")}</Notice>
      </FormCard>
    );
  }

  const pickup = typeof ride.pickup_address === "string" ? ride.pickup_address : "";
  const dropoff =
    typeof ride.original_destination_address === "string" && ride.original_destination_address
      ? ride.original_destination_address
      : typeof ride.destination_address === "string"
        ? ride.destination_address
        : "";
  const status = typeof ride.status === "string" ? ride.status : "";
  const nested = complaint.ride && typeof complaint.ride === "object" ? (complaint.ride as Record<string, unknown>) : null;

  return (
    <div className="grid gap-4">
      <FormCard
        title={t("تفاصيل الرحلة")}
        hint={t("بيانات الرحلة المرتبطة بالشكوى للمراجعة قبل اتخاذ إجراء.")}
        action={
          <Link className={btnGhostSm} href={`/erp/rides/${rideId}`}>
            {t("فتح الرحلة")}
          </Link>
        }
      >
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
            <dt className="text-xs font-medium text-muted">{t("الرحلة")}</dt>
            <dd className="mt-1 text-sm font-semibold text-heading">{entityName(nested ?? ride) ?? rideId}</dd>
          </div>
          <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
            <dt className="text-xs font-medium text-muted">{t("الحالة")}</dt>
            <dd className="mt-1">{status ? <StatusBadge value={status} label={enumLabel(status)} /> : "—"}</dd>
          </div>
          <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
            <dt className="text-xs font-medium text-muted">{t("الفئة")}</dt>
            <dd className="mt-1 text-sm font-semibold text-heading">{entityName(ride.ride_category) ?? "—"}</dd>
          </div>
          <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3 sm:col-span-2">
            <dt className="text-xs font-medium text-muted">{t("من")}</dt>
            <dd className="mt-1 text-sm font-semibold text-heading">{pickup || "—"}</dd>
          </div>
          <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3 sm:col-span-2 lg:col-span-1">
            <dt className="text-xs font-medium text-muted">{t("إلى")}</dt>
            <dd className="mt-1 text-sm font-semibold text-heading">{dropoff || "—"}</dd>
          </div>
          <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
            <dt className="text-xs font-medium text-muted">{t("العميل")}</dt>
            <dd className="mt-1 text-sm font-semibold text-heading">{entityName(ride.customer) ?? entityName(complaint.customer) ?? "—"}</dd>
          </div>
          <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
            <dt className="text-xs font-medium text-muted">{t("السائق")}</dt>
            <dd className="mt-1 text-sm font-semibold text-heading">{entityName(ride.driver) ?? entityName(complaint.driver) ?? "—"}</dd>
          </div>
          <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
            <dt className="text-xs font-medium text-muted">{t("وقت الإنشاء")}</dt>
            <dd className="mt-1 text-sm font-semibold text-heading">{formatScalar("created_at", ride.created_at) || "—"}</dd>
          </div>
        </dl>
      </FormCard>
      <RideDistances record={ride} />
      <RideSettlement record={ride} />
      <RideTimeline rideId={rideId} />
    </div>
  );
}

export function ComplaintDetail({ complaintId }: { complaintId: string }) {
  const call = useGo();
  return (
    <DetailScreen title={t("شكوى")} path={`/erp/complaints/${complaintId}`}>
      {(record) => {
        const status = typeof record.status === "string" ? record.status : "";
        const claimable = status === "OPEN" || status === "IN_REVIEW";
        const closed = status === "CLOSED";
        const nextStatus = status === "OPEN" || status === "IN_REVIEW" || status === "RESOLVED" ? status : "IN_REVIEW";
        return (
          <>
            <ComplaintRidePanel complaint={record} />
            <DeskForm key={status} action={(form) => call(`/erp/complaints/${complaintId}`, { method: "PATCH", body: { status: String(form.get("status")), notes: String(form.get("notes") || "") || undefined } })}>
              <FormCard
                title={t("إجراءات الشكوى")}
                action={
                  <div className="flex flex-wrap gap-2">
                    {claimable ? <ConfirmButton className={btnGhost} ask={{ title: t("استلام الشكوى"), body: t("ستصبح الشكوى بعهدتك."), confirm: t("استلام") }} onConfirm={() => call(`/erp/complaints/${complaintId}/claim`, { method: "POST" })}>{t("استلام")}</ConfirmButton> : null}
                    {closed ? null : <ConfirmButton className={btnGhost} ask={{ title: t("إغلاق الشكوى"), body: t("ستُغلق الشكوى ولن تُستلم من جديد."), confirm: t("إغلاق"), danger: true }} onConfirm={() => call(`/erp/complaints/${complaintId}/close`, { method: "POST" })}>{t("إغلاق")}</ConfirmButton>}
                  </div>
                }
                footer={closed ? undefined : <button className={btnDark} type="submit">{t("تحديث")}</button>}
              >
                {closed ? <Notice>{t("الشكوى مغلقة.")}</Notice> : (
                  <FormGrid>
                    <Field label={t("الحالة")}><EnumSelect kind="complaintUpdateStatus" name="status" defaultValue={nextStatus} /></Field>
                    <Field label={t("ملاحظات")}><input className={inputClass} name="notes" placeholder={t("ملاحظات")} /></Field>
                  </FormGrid>
                )}
                {!claimable && !closed ? <Notice>{t("الاستلام متاح للشكوى المفتوحة أو قيد المراجعة فقط.")}</Notice> : null}
              </FormCard>
            </DeskForm>
          </>
        );
      }}
    </DetailScreen>
  );
}

export function EmergenciesScreen() {
  return (
    <ListScreen
      title={t("الطوارئ")}
      hint={t("الاستماع المباشر متاح لخدمة العملاء من صفحة الطوارئ. تشغيل التسجيل للمشرف.")}
      path="/erp/emergencies"
      filters={[{ name: "status", label: t("الحالة"), options: [...STAFF_ENUMS.emergencyStatus] }]}
      rowHref={(row) => (typeof row.id === "string" ? `/erp/emergencies/${row.id}` : null)}
    />
  );
}

function formatAudioClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

const RECORDING_WAVE = [34, 52, 70, 44, 88, 58, 76, 40, 64, 92, 48, 72, 36, 84, 60, 78, 42, 68, 90, 50, 74, 38, 82, 56, 66, 46, 80, 54];

function RecordingWave() {
  return (
    <div className="desk-recording-wave" aria-hidden>
      {RECORDING_WAVE.map((height, index) => (
        <span key={index} style={{ "--desk-wave-i": index, "--desk-wave-h": `${height}%` } as CSSProperties} />
      ))}
    </div>
  );
}

function SavedRecordingPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.load();
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [src]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      return;
    }
    audio.pause();
    setPlaying(false);
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(value)) return;
    audio.currentTime = value;
    setCurrent(value);
  }

  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  return (
    <div className={`desk-recording-player ${playing ? "is-playing" : ""}`} data-playing={playing || undefined}>
      <audio
        ref={audioRef}
        className="hidden"
        preload="metadata"
        src={src}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
      />
      <RecordingWave />
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-teal text-on-teal shadow-glow transition-[transform,background-color] duration-200 hover:bg-teal-strong active:scale-95"
          aria-label={playing ? t("إيقاف مؤقت") : t("تشغيل التسجيل")}
          onClick={toggle}
        >
          <Icon node={playing ? Pause : Play} size={18} className={playing ? undefined : "translate-x-[1px]"} />
        </button>
        <div className="min-w-0 flex-1">
          <input
            className="desk-recording-seek"
            type="range"
            min={0}
            max={duration || 0}
            step={0.05}
            value={Math.min(current, duration || 0)}
            aria-label={t("موضع التشغيل")}
            onChange={(event) => seek(Number(event.currentTarget.value))}
            style={{ "--desk-seek": `${progress}%` } as CSSProperties}
          />
          <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] font-semibold tabular-nums text-muted">
            <span>{formatAudioClock(current)}</span>
            <span>{formatAudioClock(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveAudio({ emergencyId }: { emergencyId: string }) {
  const call = useGo();
  const audioRef = useRef<HTMLAudioElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState(t("غير متصل"));
  const [live, setLive] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => () => {
    socketRef.current?.close();
  }, []);

  async function listen() {
    if (joining) return;
    setJoining(true);
    socketRef.current?.close();
    const issued = await call<{ token: string; namespace: string }>(`/erp/emergencies/${emergencyId}/audio/token`, { method: "POST" });
    setJoining(false);
    if (isGoFailure(issued)) return;
    const origin = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8000";
    const socket = io(`${origin}${issued.namespace}`, { auth: { token: issued.token }, transports: ["websocket", "polling"] });
    socketRef.current = socket;
    const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peer.ontrack = (event) => {
      if (audioRef.current) audioRef.current.srcObject = event.streams[0] ?? null;
      setLive(true);
      setStatus(t("جارٍ استقبال الصوت"));
    };
    peer.onicecandidate = (event) => {
      if (event.candidate) socket.emit("emergency.audio.signal", { type: "candidate", candidate: event.candidate });
    };
    socket.on("emergency.audio.ready", () => setStatus(t("متصل بغرفة الصوت، بانتظار إشارة العميل")));
    socket.on("emergency.audio.signal", (message: { type?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) => {
      void (async () => {
        if (message.type === "offer" && message.sdp) {
          await peer.setRemoteDescription(message.sdp);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socket.emit("emergency.audio.signal", { type: "answer", sdp: peer.localDescription });
        } else if (message.type === "candidate" && message.candidate) {
          await peer.addIceCandidate(message.candidate);
        }
      })();
    });
    socket.on("disconnect", () => {
      setLive(false);
      setStatus(t("انقطع الاتصال الصوتي"));
    });
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-heading">{t("الاستماع المباشر")}</p>
          <p className="mt-0.5 text-[13px] text-muted">{status}</p>
        </div>
        <button className={btnPrimarySm} type="button" disabled={joining} onClick={() => void listen()}>
          {joining ? <BusyMark /> : null}
          {joining ? t("جارٍ التنفيذ…") : t("اتصال بالغرفة")}
        </button>
      </div>
      {live ? <audio ref={audioRef} className="w-full" autoPlay controls /> : <audio ref={audioRef} className="hidden" autoPlay />}
    </div>
  );
}

function EmergencyParty({ role, name, detail }: { role: string; name: string; detail?: string | null }) {
  const letter = name.trim().charAt(0) || "؟";
  return (
    <div className="flex items-start gap-3.5 rounded-xl border border-line bg-heading/[0.02] px-4 py-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-danger/12 text-[15px] font-semibold text-danger-ink ring-1 ring-inset ring-danger/20">
        {letter}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted">{role}</p>
        <p className="mt-0.5 truncate text-[15px] font-semibold text-heading">{name}</p>
        {detail ? (
          <p className="mt-1 text-sm text-muted" dir={/^\+?\d[\d\s().-]{6,18}$/.test(detail.trim()) ? "ltr" : undefined}>
            <bdi
              className={/^\+?\d[\d\s().-]{6,18}$/.test(detail.trim()) ? "phone-ltr" : undefined}
              dir={/^\+?\d[\d\s().-]{6,18}$/.test(detail.trim()) ? "ltr" : undefined}
              data-phone={/^\+?\d[\d\s().-]{6,18}$/.test(detail.trim()) ? "" : undefined}
            >
              {detail}
            </bdi>
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function EmergencyDetail({ emergencyId }: { emergencyId: string }) {
  const { session } = useDesk();
  const call = useGo();
  const role = session?.user.role;
  const desk = roleIs(role, ["CUSTOMER_SERVICE", "CUSTOMER_SERVICE_SUPERVISOR"]);
  const playback = roleIs(role, ["CUSTOMER_SERVICE_SUPERVISOR"]);
  const [stream, setStream] = useState<string | null>(null);

  return (
    <DetailScreen title={t("طوارئ")} path={`/erp/emergencies/${emergencyId}`} facts="none">
      {(record) => {
        const ride = record.ride && typeof record.ride === "object" ? (record.ride as Record<string, unknown>) : null;
        const rideId = typeof record.ride_id === "string" ? record.ride_id : isRecordId(record.ride) ? record.ride.id : "";
        const customer = entityName(record.customer) ?? t("الزبون");
        const driver = ride ? entityName(ride.driver) : null;
        const customerUser = record.customer && typeof record.customer === "object" && "user" in record.customer ? (record.customer as { user?: unknown }).user : null;
        const phone = customerUser && typeof customerUser === "object" && "phone" in customerUser ? phoneText((customerUser as { phone?: unknown }).phone) : "";
        const pickup = ride && typeof ride.pickup_address === "string" ? ride.pickup_address : "";
        const recording = typeof record.recording_status === "string" ? record.recording_status : "";
        const handler = entityName(record.handled_by);
        const lat = record.started_lat == null ? "" : String(record.started_lat);
        const lng = record.started_lng == null ? "" : String(record.started_lng);

        return (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-line bg-surface px-4 py-4 shadow-card">
                <p className="text-xs font-medium text-muted">{t("حالة الجلسة")}</p>
                <div className="mt-2">{typeof record.status === "string" ? <StatusBadge value={record.status} label={enumLabel(record.status)} /> : <span className="text-sm text-muted">—</span>}</div>
                <p className="mt-2 text-xs text-muted">{formatScalar("started_at", record.started_at)}</p>
              </div>
              <div className="rounded-xl border border-line bg-surface px-4 py-4 shadow-card">
                <p className="text-xs font-medium text-muted">{t("حالة التسجيل")}</p>
                <div className="mt-2">{recording ? <StatusBadge value={recording} label={enumLabel(recording)} /> : <span className="text-sm text-muted">—</span>}</div>
                {handler ? <p className="mt-2 text-xs text-muted">{t("استلمه")} {handler}</p> : <p className="mt-2 text-xs text-muted">{t("لم يُستلم بعد")}</p>}
              </div>
              <div className="rounded-xl border border-line bg-surface px-4 py-4 shadow-card">
                <p className="text-xs font-medium text-muted">{t("الرحلة")}</p>
                <p className="mt-2 text-[15px] font-semibold text-heading">{entityName(record.ride) ?? t("بدون رحلة")}</p>
                {typeof ride?.status === "string" ? <p className="mt-1 text-xs text-muted">{enumLabel(ride.status)}</p> : null}
                {rideId ? <Link className="mt-2 inline-flex text-sm font-semibold text-accent" href={`/erp/rides/${rideId}`}>{t("فتح الرحلة")}</Link> : null}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <EmergencyParty role={t("الزبون")} name={customer} detail={desk ? phone || undefined : undefined} />
              <EmergencyParty role={t("السائق")} name={driver ?? t("بدون سائق")} detail={pickup || undefined} />
            </div>
            {lat && lng ? (
              <p className="text-sm text-muted">{t("موقع البداية")}: <bdi>{lat}, {lng}</bdi></p>
            ) : null}
            <FormCard title={t("التحكم بالجلسة")}>
              {desk ? (
                <div className="grid gap-4">
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted">{t("المتابعة")}</p>
                    <div className="flex flex-wrap gap-2">
                      <ConfirmButton className={btnPrimarySm} ask={{ title: t("استلام الطوارئ"), body: t("ستصبح جلسة الطوارئ بعهدتك."), confirm: t("استلام") }} onConfirm={() => call(`/erp/emergencies/${emergencyId}/claim`, { method: "POST" })}>{t("استلام")}</ConfirmButton>
                      <ConfirmButton className={btnGhostSm} ask={{ title: t("إغلاق الجلسة"), body: t("ستُغلق جلسة الطوارئ."), confirm: t("إغلاق الجلسة"), danger: true }} onConfirm={() => call(`/erp/emergencies/${emergencyId}/close`, { method: "POST" })}>{t("إغلاق الجلسة")}</ConfirmButton>
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted">{t("البث والتسجيل")}</p>
                    <div className="flex flex-wrap gap-2">
                      <ConfirmButton className={btnGhostSm} ask={{ title: t("إيقاف الصوت"), body: t("سيتوقف البث الصوتي لهذه الجلسة."), confirm: t("إيقاف الصوت") }} onConfirm={() => call(`/erp/emergencies/${emergencyId}/audio/stop`, { method: "POST" })}>{t("إيقاف الصوت")}</ConfirmButton>
                      <ConfirmButton className={btnGhostSm} ask={{ title: t("حفظ التسجيل"), body: t("سيُحفظ التسجيل نهائياً. يمكنك الاستماع قبل الحفظ من قسم التسجيل."), confirm: t("حفظ التسجيل") }} onConfirm={() => call(`/erp/emergencies/${emergencyId}/recording/save`, { method: "POST" })}>{t("حفظ التسجيل")}</ConfirmButton>
                      <ConfirmButton className={btnGhostSm} ask={{ title: t("تجاهل التسجيل"), body: t("لن يُحفظ هذا التسجيل."), confirm: t("تجاهل التسجيل"), danger: true }} onConfirm={() => call(`/erp/emergencies/${emergencyId}/recording/discard`, { method: "POST" })}>{t("تجاهل التسجيل")}</ConfirmButton>
                    </div>
                  </div>
                </div>
              ) : <Notice>{t("التشغيل متاح لخدمة العملاء. يمكنك المتابعة للقراءة فقط.")}</Notice>}
            </FormCard>
            {desk ? (
              <FormCard title={t("غرفة الصوت")}>
                <LiveAudio emergencyId={emergencyId} />
              </FormCard>
            ) : null}
            {playback ? (
              <FormCard title={t("التسجيل")}>
                <div className="grid gap-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/12 text-accent ring-1 ring-inset ring-brand/25">
                      <Icon node={AudioLines} size={18} />
                    </span>
                    <p className="text-[13px] leading-6 text-muted">
                      {recording === "SAVED"
                        ? t("التشغيل والحذف للمشرف. التسجيل محفوظ نهائياً.")
                        : t("يمكنك الاستماع قبل الحفظ. الحذف النهائي متاح بعد حفظ التسجيل.")}
                    </p>
                  </div>

                  {stream ? (
                    <SavedRecordingPlayer src={stream} />
                  ) : (
                    <div className="desk-recording-player desk-recording-player--idle">
                      <RecordingWave />
                      <p className="text-center text-[13px] text-muted">{t("اضغط تشغيل لتحميل التسجيل.")}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      className={`${btnPrimarySm} min-h-9`}
                      type="button"
                      onClick={() =>
                        void call<Record<string, unknown>>(`/erp/emergencies/${emergencyId}/recording`).then((data) => {
                          if (isGoFailure(data)) return;
                          const token = data.stream_token ?? data.token;
                          if (typeof token === "string") {
                            setStream(`/api/proxy/api/v1/go/erp/emergencies/${emergencyId}/recording/stream?token=${encodeURIComponent(token)}`);
                            return;
                          }
                          const url = data.signed_url;
                          if (typeof url === "string" && url.startsWith("http")) setStream(url);
                        })
                      }
                    >
                      <Icon node={Play} size={15} />
                      {t("تشغيل التسجيل")}
                    </button>
                    {recording === "SAVED" ? (
                      <ConfirmButton
                        className={`${btnGhostSm} min-h-9 text-danger-ink`}
                        ask={{ title: t("حذف التسجيل"), body: t("سيُحذف التسجيل المحفوظ نهائياً."), confirm: t("حذف التسجيل"), danger: true }}
                        onConfirm={() => call(`/erp/emergencies/${emergencyId}/recording`, { method: "DELETE" }).then((result) => {
                          if (!isGoFailure(result)) setStream(null);
                          return result;
                        })}
                      >
                        <Icon node={Trash} size={15} />
                        {t("حذف التسجيل")}
                      </ConfirmButton>
                    ) : null}
                  </div>
                </div>
              </FormCard>
            ) : null}
          </>
        );
      }}
    </DetailScreen>
  );
}

export function CasesScreen() {
  return (
    <ListScreen
      title={t("الحوادث والأعطال")}
      path="/erp/cases"
      filters={[
        { name: "type", label: t("النوع"), options: [...STAFF_ENUMS.caseType] },
        { name: "status", label: t("الحالة"), options: [...STAFF_ENUMS.caseStatus] },
      ]}
      rowHref={(row) => (typeof row.id === "string" ? `/erp/cases/${row.id}` : null)}
    />
  );
}

function CaseVehiclePanel({ record }: { record: Record<string, unknown> }) {
  const vehicle =
    record.vehicle && typeof record.vehicle === "object"
      ? (record.vehicle as Record<string, unknown>)
      : null;
  if (!vehicle) {
    return (
      <FormCard title={t("تفاصيل المركبة")}>
        <Notice>{t("لا توجد مركبة مرتبطة بهذه القضية.")}</Notice>
      </FormCard>
    );
  }

  const plate = typeof vehicle.plate_number === "string" ? vehicle.plate_number : entityName(vehicle) ?? "—";
  const make = typeof vehicle.make === "string" ? vehicle.make : "";
  const model = typeof vehicle.model === "string" ? vehicle.model : "";
  const color = typeof vehicle.color === "string" ? vehicle.color : "";
  const year = vehicle.year == null ? "" : String(vehicle.year);
  const makeModel = [make, model].filter(Boolean).join(" ") || "—";
  const vehicleId = typeof vehicle.id === "string" ? vehicle.id : null;
  const category = entityName(vehicle.ride_category) ?? "—";
  const active = vehicle.is_active === true ? t("نشطة") : vehicle.is_active === false ? t("غير نشطة") : "";

  return (
    <FormCard
      title={t("تفاصيل المركبة")}
      hint={t("مركبة الرحلة وقت الحادث أو العطل.")}
      action={
        vehicleId ? (
          <Link className={btnGhostSm} href={`/admin/vehicles/${vehicleId}`}>
            {t("فتح المركبة")}
          </Link>
        ) : null
      }
    >
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
          <dt className="text-xs font-medium text-muted">{t("اللوحة")}</dt>
          <dd className="mt-1 text-sm font-semibold text-heading" dir="ltr">{plate}</dd>
        </div>
        <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
          <dt className="text-xs font-medium text-muted">{t("الشركة / الطراز")}</dt>
          <dd className="mt-1 text-sm font-semibold text-heading">{makeModel}</dd>
        </div>
        <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
          <dt className="text-xs font-medium text-muted">{t("اللون")}</dt>
          <dd className="mt-1 text-sm font-semibold text-heading">{color || "—"}</dd>
        </div>
        <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
          <dt className="text-xs font-medium text-muted">{t("سنة الصنع")}</dt>
          <dd className="mt-1 text-sm font-semibold text-heading">{year || "—"}</dd>
        </div>
        <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
          <dt className="text-xs font-medium text-muted">{t("الفئة")}</dt>
          <dd className="mt-1 text-sm font-semibold text-heading">{category}</dd>
        </div>
        {active ? (
          <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
            <dt className="text-xs font-medium text-muted">{t("الحالة")}</dt>
            <dd className="mt-1 text-sm font-semibold text-heading">{active}</dd>
          </div>
        ) : null}
      </dl>
    </FormCard>
  );
}

export function CaseDetail({ caseId }: { caseId: string }) {
  const { session } = useDesk();
  const call = useGo();
  const canEdit = roleIs(session?.user.role, ["CUSTOMER_SERVICE", "CUSTOMER_SERVICE_SUPERVISOR"]);
  return (
    <DetailScreen title={t("قضية")} path={`/erp/cases/${caseId}`}>
      {(record) => (
        <>
          <CaseVehiclePanel record={record} />
          {canEdit ? (
            <>
              <DeskForm key={String(record.updated_at ?? caseId)} action={(form) => call(`/erp/cases/${caseId}`, { method: "PATCH", body: { status: String(form.get("status")), accident_severity: String(form.get("severity") || "") || undefined, supervisor_decision: String(form.get("decision") || "") || undefined, reason_code: String(form.get("reason_code") || "") || undefined, negligence_suspected: form.get("negligence") === "on" } })}>
                <FormCard
                  title={t("تحديث القضية")}
                  action={
                    <div className="flex flex-wrap gap-2">
                      <ConfirmButton className={btnDark} ask={{ title: t("إغلاق القضية"), body: t("ستُغلق القضية. يمكن إعادة فتحها لاحقاً."), confirm: t("إغلاق"), danger: true }} onConfirm={() => call(`/erp/cases/${caseId}/close`, { method: "POST" })}>{t("إغلاق")}</ConfirmButton>
                      <ConfirmButton className={btnGhost} ask={{ title: t("إعادة فتح القضية"), body: t("ستعود القضية إلى قيد المراجعة."), confirm: t("إعادة فتح") }} onConfirm={() => call(`/erp/cases/${caseId}/reopen`, { method: "POST" })}>{t("إعادة فتح")}</ConfirmButton>
                    </div>
                  }
                  footer={<button className={btnDark} type="submit">{t("حفظ")}</button>}
                >
                  <FormGrid>
                    <Field label={t("الحالة")}><EnumSelect kind="caseUpdateStatus" name="status" defaultValue={record.status === "OPEN" || record.status === "IN_REVIEW" ? record.status : "IN_REVIEW"} /></Field>
                    <Field label={t("شدة الحادث")}><EnumSelect kind="accidentSeverity" name="severity" allowEmpty emptyLabel={t("الشدة")} defaultValue={typeof record.accident_severity === "string" ? record.accident_severity : ""} /></Field>
                    <Field label={t("قرار المشرف")}><input className={inputClass} name="decision" placeholder={t("قرار المشرف")} defaultValue={typeof record.supervisor_decision === "string" ? record.supervisor_decision : ""} /></Field>
                    <Field label={t("رمز السبب")}><input className={inputClass} name="reason_code" placeholder={t("رمز السبب")} maxLength={64} defaultValue={typeof record.reason_code === "string" ? record.reason_code : ""} /></Field>
                    <FormSpan><CheckField name="negligence" label={t("اشتباه إهمال")} defaultChecked={record.negligence_suspected === true} /></FormSpan>
                  </FormGrid>
                </FormCard>
              </DeskForm>
              <FormCard title={t("إفادات وملاحظات")}>
                <DeskForm className="grid gap-3 sm:grid-cols-[1fr_auto]" action={(form) => call(`/erp/cases/${caseId}/customer-statement`, { method: "POST", body: { statement: String(form.get("statement")) } })}>
                  <Field label={t("إفادة العميل")}><input className={inputClass} name="statement" placeholder={t("إفادة العميل")} required /></Field>
                  <button className={`${btnGhost} self-end`} type="submit">{t("حفظ إفادة العميل")}</button>
                </DeskForm>
                <DeskForm className="grid gap-3 sm:grid-cols-[1fr_auto]" action={(form) => call(`/erp/cases/${caseId}/driver-statement`, { method: "POST", body: { statement: String(form.get("statement")) } })}>
                  <Field label={t("إفادة السائق")}><input className={inputClass} name="statement" placeholder={t("إفادة السائق")} required /></Field>
                  <button className={`${btnGhost} self-end`} type="submit">{t("حفظ إفادة السائق")}</button>
                </DeskForm>
                <DeskForm className="grid gap-3 sm:grid-cols-[1fr_auto]" action={(form) => call(`/erp/cases/${caseId}/notes`, { method: "POST", body: { note: String(form.get("note")) } })}>
                  <Field label={t("ملاحظة")}><input className={inputClass} name="note" placeholder={t("ملاحظة")} required /></Field>
                  <button className={`${btnGhost} self-end`} type="submit">{t("إضافة ملاحظة")}</button>
                </DeskForm>
              </FormCard>
            </>
          ) : (
            <Notice>{t("العرض فقط لدور التشغيل.")}</Notice>
          )}
        </>
      )}
    </DetailScreen>
  );
}

export function CustomersScreen() {
  const { session } = useDesk();
  const call = useGo();
  const admin = roleIs(session?.user.role, ["ADMIN"]);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <ListScreen
        title={t("العملاء")}
        path="/erp/customers"
        rowHref={(row) => (typeof row.id === "string" ? `/erp/customers/${row.id}` : null)}
        action={admin ? <button className={btnPrimary} type="button" onClick={() => setCreating(true)}>{t("إضافة عميل")}</button> : undefined}
      />
      <FormDialog open={creating} title={t("عميل جديد")} onClose={() => setCreating(false)}>
        <DeskForm className="grid gap-3" action={async (form) => {
          const saved = await call("/admin/customers", { method: "POST", body: { phone: String(form.get("phone")), full_name: String(form.get("full_name") || "") || undefined, notes: String(form.get("notes") || "") || undefined } });
          if (!isGoFailure(saved)) setCreating(false);
        }}>
          <Field label={t("الهاتف")}><input className={inputClass} name="phone" dir="ltr" inputMode="tel" placeholder="+9639xxxxxxx" required /></Field>
          <Field label={t("الاسم")}><input className={inputClass} name="full_name" /></Field>
          <Field label={t("ملاحظات")}><textarea className={`${inputClass} min-h-24 py-3`} name="notes" /></Field>
          <button className={btnDark} type="submit">{t("حفظ العميل")}</button>
        </DeskForm>
      </FormDialog>
    </>
  );
}

function rowsOf(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
}

function customerWalletBalance(wallet: unknown) {
  if (!wallet || typeof wallet !== "object") return null;
  const raw = (wallet as Record<string, unknown>).balance;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() && Number.isFinite(Number(raw))) return Number(raw);
  return null;
}

export function CustomerDetail({ customerId }: { customerId: string }) {
  const { session } = useDesk();
  const call = useGo();
  const admin = roleIs(session?.user.role, ["ADMIN"]);
  const editor = roleIs(session?.user.role, ["CUSTOMER_SERVICE", "CUSTOMER_SERVICE_SUPERVISOR", "ADMIN"]);
  const canOpenWallet = roleIs(session?.user.role, ["WALLET_OPERATOR", "FINANCE", "ADMIN"]);
  return (
    <DetailScreen title={t("عميل")} path={`/erp/customers/${customerId}`}>
      {(record) => {
        const balance = customerWalletBalance(record.wallet);
        return (
        <>
          <FormCard
            title={t("محفظة العميل")}
            action={
              canOpenWallet ? (
                <Link className={btnGhostSm} href={`/erp/wallets/customer/${customerId}`}>
                  {t("فتح المحفظة")}
                </Link>
              ) : null
            }
          >
            {balance != null ? (
              <div className="min-w-0 max-w-xs rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
                <p className="text-xs font-medium text-muted">{t("الرصيد")}</p>
                <p className="mt-1 text-sm font-semibold text-heading">{formatMoney(balance)}</p>
              </div>
            ) : (
              <Notice>{t("لا توجد محفظة بعد. أول إيداع ينشئها.")}</Notice>
            )}
          </FormCard>
          {editor ? (
            <DeskForm action={(form) => call(`/erp/customers/${customerId}`, { method: "PATCH", body: { notes: String(form.get("notes") || "") || null, ...(admin ? { full_name: String(form.get("full_name") || "") || undefined, user_is_active: form.get("user_is_active") === "on" } : {}) } })}>
              <FormCard title={t("تعديل العميل")} footer={<button className={btnDark} type="submit">{t("حفظ العميل")}</button>}>
                <FormGrid>
                  {admin ? <Field label={t("الاسم")}><input className={inputClass} name="full_name" defaultValue={entityName(record.user) ?? ""} /></Field> : null}
                  <FormSpan><Field label={t("ملاحظات")}><textarea className={`${inputClass} min-h-24 py-3`} name="notes" defaultValue={typeof record.notes === "string" ? record.notes : ""} /></Field></FormSpan>
                  {admin ? <CheckField name="user_is_active" label={t("الحساب نشط")} defaultChecked={!(record.user && typeof record.user === "object" && "is_active" in record.user) || (record.user as { is_active?: boolean }).is_active !== false} /> : null}
                </FormGrid>
              </FormCard>
            </DeskForm>
          ) : null}
          {admin ? (
            <DeskForm
              action={async (form) => {
                const levelId = String(form.get("level_id") || "");
                if (!levelId) return;
                await call(`/admin/passport/customers/${customerId}/stamps`, {
                  method: "POST",
                  body: { level_id: levelId },
                });
              }}
            >
              <FormCard
                title={t("منح ختم")}
                hint={t("اختر مستوى الجواز لإضافة ختمه إلى جواز هذا العميل. المستوى الحالي لا يتغير.")}
                footer={<button className={btnDark} type="submit">{t("إضافة الختم")}</button>}
              >
                <NamedSelect
                  path="/admin/passport/levels"
                  name="level_id"
                  label={t("الختم")}
                  required
                  placeholder={t("اختر الختم")}
                />
              </FormCard>
            </DeskForm>
          ) : null}
          <RecordList title={t("الأختام")} rows={rowsOf(record.stamps)} href={() => null} />
          <RecordList title={t("الرحلات")} rows={rowsOf(record.rides)} href={(row) => `/erp/rides/${String(row.id)}`} />
          <RecordList title={t("الشكاوى")} rows={rowsOf(record.complaints)} href={(row) => `/erp/complaints/${String(row.id)}`} />
          <RecordList title={t("أكواد الخصم")} rows={rowsOf(record.discount_codes)} href={(row) => (typeof row.id === "string" ? `/admin/discounts/${row.id}` : "/admin/discounts")} />
          <RecordList title={t("سجل النقاط")} rows={rowsOf(record.score_ledger)} href={() => null} />
          <RecordList title={t("منح المكافآت")} rows={rowsOf(record.reward_grants)} href={(row) => (typeof row.id === "string" ? `/admin/passport/grants/${row.id}` : "/admin/passport")} />
        </>
        );
      }}
    </DetailScreen>
  );
}
