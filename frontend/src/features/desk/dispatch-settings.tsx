"use client";

import { BellRing, CalendarClock, Flame, IdCard, MapPinCheck, Radar, Wallet, X } from "lucide";
import Link from "next/link";
import { Fragment, useState, type ReactNode } from "react";

import { t } from "@/features/desk/i18n/t";
import { isGoFailure, useGo, useGoRecord } from "@/features/desk/hooks";
import { formatMoney } from "@/features/desk/present";
import {
  asNumber,
  Choice,
  countText,
  distanceText,
  DISTANCE_UNITS,
  durationText,
  formatCount,
  SectionNav,
  SettingLine,
  SettingsSection,
  Stepper,
  Summary,
  Switch,
  TIME_UNITS_MIN,
  TIME_UNITS_SEC,
  UnitStepper,
  unitWord,
  useDraft,
  useSectionSave,
} from "@/features/desk/settings-kit";
import { btnGhost, StateView } from "@/features/desk/ui";
import { Icon } from "@/shared/ui/icon";

type Row = Record<string, unknown>;

const DISPATCH = "/admin/config/dispatch";
const WALLET = "/admin/wallet-config";
const PASSPORT = "/admin/passport/config";
const STREAK = "/admin/passport/streak-config";

function Loaded({ path, children }: { path: string; children: (data: Row) => ReactNode }) {
  const record = useGoRecord(path);
  return (
    <StateView loading={record.isLoading} error={record.error}>
      {record.data ? children(record.data) : null}
    </StateView>
  );
}

function useSaver(path: string, idempotent: boolean) {
  const call = useGo();
  return useSectionSave(async (changes) => {
    const saved = await call(path, { method: "PATCH", body: changes, idempotent });
    if (isGoFailure(saved)) throw new Error("save failed");
  });
}

function saveProps<T extends Row>(draft: ReturnType<typeof useDraft<T>>, saver: ReturnType<typeof useSaver>, blocked: boolean) {
  return {
    dirty: draft.dirty,
    saving: saver.saving,
    blocked,
    onReset: draft.reset,
    onSave: () => void saver.run(draft.changes).catch(() => undefined),
  };
}

function need(value: number | null, min: number, message?: string) {
  if (value == null) return t("أدخل قيمة");
  if (value < min) return message ?? `${t("أقل قيمة مسموحة")}: ${formatCount(min)}`;
  return null;
}

function strong(text: string) {
  return <b className="font-semibold text-accent">{text}</b>;
}

// ------------------------------------------------------------------ dispatch

function shortDistance(meters: number) {
  return meters >= 1000 ? `${formatCount(meters / 1000)} ${t("كم")}` : `${formatCount(meters)} ${t("م")}`;
}

function RadiusSteps({ value, onChange, max }: { value: number[]; onChange: (next: number[]) => void; max: number | null }) {
  const [adding, setAdding] = useState<number | null>(null);
  const sorted = [...value].sort((a, b) => a - b);
  function add() {
    if (adding == null || adding <= 0 || sorted.includes(adding)) return;
    onChange([...sorted, adding].sort((a, b) => a - b));
    setAdding(null);
  }
  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {sorted.map((step, index) => (
          <Fragment key={step}>
            {index > 0 ? <span className="text-muted" aria-hidden>←</span> : null}
            <span
              className={`inline-flex h-8 items-center gap-1 rounded-lg ps-2.5 pe-1 text-[13px] font-semibold ring-1 ring-inset ${
                max != null && step > max ? "bg-danger/10 text-danger-ink ring-danger/40" : "bg-brand/10 text-heading ring-brand/30"
              }`}
            >
              {shortDistance(step)}
              <button
                type="button"
                className="grid size-6 place-items-center rounded-md text-muted hover:bg-heading/[0.08] hover:text-heading disabled:opacity-40"
                aria-label={`${t("حذف")} ${distanceText(step)}`}
                disabled={sorted.length <= 1}
                onClick={() => onChange(sorted.filter((item) => item !== step))}
              >
                <Icon node={X} size={13} />
              </button>
            </span>
          </Fragment>
        ))}
      </div>
      <div className="flex max-w-md gap-2">
        <div className="min-w-0 flex-1">
          <Stepper label={t("مرحلة جديدة")} value={adding} onChange={setAdding} min={1} step={100} unit={t("متر")} placeholder={t("مثلاً 1500")} />
        </div>
        <button className={btnGhost} type="button" onClick={add} disabled={adding == null || adding <= 0}>
          {t("إضافة")}
        </button>
      </div>
    </div>
  );
}

function MatchingSection({ data }: { data: Row }) {
  const steps = Array.isArray(data.radius_steps_json) ? data.radius_steps_json.map(Number).filter(Number.isFinite) : [];
  const draft = useDraft({
    batch_size: asNumber(data.batch_size),
    batch_timeout_seconds: asNumber(data.batch_timeout_seconds),
    radius_steps_json: steps,
    max_search_radius_m: asNumber(data.max_search_radius_m),
  });
  const saver = useSaver(DISPATCH, true);
  const d = draft.draft;
  const errors = {
    batch_size: need(d.batch_size, 1),
    batch_timeout_seconds: need(d.batch_timeout_seconds, 1),
    max_search_radius_m: need(d.max_search_radius_m, 100),
    radius_steps_json:
      d.radius_steps_json.length === 0
        ? t("أضف مرحلة واحدة على الأقل")
        : d.max_search_radius_m != null && d.radius_steps_json.some((step) => step > (d.max_search_radius_m ?? 0))
          ? t("بعض المراحل أبعد من أبعد مسافة للبحث")
          : null,
  };
  const blocked = Object.values(errors).some(Boolean);
  const ordered = [...d.radius_steps_json].sort((a, b) => a - b);
  return (
    <SettingsSection
      id="matching"
      icon={Radar}
      title={t("توزيع الطلبات على السائقين")}
      description={t("كيف يبحث النظام عن سائق لكل طلب جديد.")}
      summary={
        <Summary>
          <p>
            {t("يُرسل كل طلب جديد إلى")} {strong(countText(d.batch_size ?? 0, "driver"))} {t("من الأقرب في نفس الوقت، وأول من يقبل يأخذه.")}
          </p>
          <p>
            {t("مهلة قبول الطلب")} {strong(durationText(d.batch_timeout_seconds ?? 0))}
            {t(" — إذا لم يقبل أحد خلالها يُرسل للدفعة التالية.")}{" "}
            {ordered.length ? (
              <>
                {t("يبدأ البحث ضمن")} {strong(distanceText(ordered[0]))} {t("ويتوسع حتى")} {strong(distanceText(d.max_search_radius_m ?? 0))} {t("كحد أقصى.")}
              </>
            ) : null}
          </p>
        </Summary>
      }
      save={saveProps(draft, saver, blocked)}
    >
      <SettingLine label={t("عدد السائقين في كل دفعة")} help={t("يُرسل الطلب لهذا العدد من أقرب السائقين معاً.")} error={errors.batch_size}>
        <Stepper label={t("عدد السائقين في كل دفعة")} value={d.batch_size} onChange={(v) => draft.set("batch_size", v)} min={1} max={50} unit={unitWord(d.batch_size ?? 0, "driver")} invalid={!!errors.batch_size} />
      </SettingLine>
      <SettingLine
        label={t("مهلة قبول الطلب")}
        help={t("المدة المتاحة للسائق لقبول العرض. إذا انتهت دون قبول، يُرسل الطلب لدفعة سائقين تالية.")}
        error={errors.batch_timeout_seconds}
      >
        <UnitStepper
          label={t("مهلة قبول الطلب")}
          value={d.batch_timeout_seconds}
          onChange={(v) => draft.set("batch_timeout_seconds", v)}
          units={TIME_UNITS_SEC.slice(0, 2)}
          min={1}
          invalid={!!errors.batch_timeout_seconds}
        />
      </SettingLine>
      <SettingLine stacked label={t("مراحل توسيع البحث")} help={t("يبحث النظام أولاً في أصغر دائرة، ثم يكبرها مرحلة بعد مرحلة إذا لم يجد سائقاً.")} error={errors.radius_steps_json}>
        <RadiusSteps value={d.radius_steps_json} onChange={(v) => draft.set("radius_steps_json", v)} max={d.max_search_radius_m} />
      </SettingLine>
      <SettingLine label={t("أبعد مسافة للبحث")} help={t("لا يبحث النظام عن سائقين أبعد من هذه المسافة.")} error={errors.max_search_radius_m}>
        <UnitStepper label={t("أبعد مسافة للبحث")} value={d.max_search_radius_m} onChange={(v) => draft.set("max_search_radius_m", v)} units={DISTANCE_UNITS} min={100} invalid={!!errors.max_search_radius_m} />
      </SettingLine>
    </SettingsSection>
  );
}

function ArrivalSection({ data }: { data: Row }) {
  const draft = useDraft({
    busy_driver_max_eta_sec: asNumber(data.busy_driver_max_eta_sec),
    pickup_arrival_radius_m: asNumber(data.pickup_arrival_radius_m),
  });
  const saver = useSaver(DISPATCH, true);
  const d = draft.draft;
  const errors = {
    busy_driver_max_eta_sec: need(d.busy_driver_max_eta_sec, 0),
    pickup_arrival_radius_m: need(d.pickup_arrival_radius_m, 1),
  };
  return (
    <SettingsSection
      id="arrival"
      icon={MapPinCheck}
      title={t("الوصول إلى الزبون")}
      description={t("متى يُعرض الطلب على سائق مشغول، ومتى يُعتبر السائق واصلاً.")}
      summary={
        <Summary>
          <p>
            {t("يُعرض الطلب على سائق ما زال في رحلة أخرى فقط إذا كان سيصل للزبون خلال")} {strong(durationText(d.busy_driver_max_eta_sec ?? 0))}.
          </p>
          <p>
            {t("يُعتبر السائق واصلاً عندما يكون على بُعد")} {strong(distanceText(d.pickup_arrival_radius_m ?? 0))} {t("أو أقل من الزبون.")}
          </p>
        </Summary>
      }
      save={saveProps(draft, saver, Object.values(errors).some(Boolean))}
    >
      <SettingLine label={t("سائق مشغول: أقصى وقت للوصول")} help={t("السائق الذي ينهي رحلة الآن يمكن أن يأخذ طلباً جديداً إذا كان قريباً بما يكفي.")} error={errors.busy_driver_max_eta_sec}>
        <UnitStepper label={t("سائق مشغول: أقصى وقت للوصول")} value={d.busy_driver_max_eta_sec} onChange={(v) => draft.set("busy_driver_max_eta_sec", v)} units={TIME_UNITS_SEC.slice(0, 2)} min={0} invalid={!!errors.busy_driver_max_eta_sec} />
      </SettingLine>
      <SettingLine label={t("مسافة اعتبار السائق واصلاً")} help={t("عندما يقترب السائق من نقطة الالتقاط لهذه المسافة يُعتبر واصلاً.")} error={errors.pickup_arrival_radius_m}>
        <UnitStepper label={t("مسافة اعتبار السائق واصلاً")} value={d.pickup_arrival_radius_m} onChange={(v) => draft.set("pickup_arrival_radius_m", v)} units={DISTANCE_UNITS.slice(0, 1)} min={1} invalid={!!errors.pickup_arrival_radius_m} />
      </SettingLine>
    </SettingsSection>
  );
}

function MonitoringSection({ data }: { data: Row }) {
  const draft = useDraft({
    stale_location_seconds: asNumber(data.stale_location_seconds),
    long_stop_seconds: asNumber(data.long_stop_seconds),
    route_deviation_max_m: asNumber(data.route_deviation_max_m),
  });
  const saver = useSaver(DISPATCH, true);
  const d = draft.draft;
  const errors = {
    stale_location_seconds: need(d.stale_location_seconds, 1),
    long_stop_seconds: need(d.long_stop_seconds, 1),
    route_deviation_max_m: need(d.route_deviation_max_m, 50),
  };
  return (
    <SettingsSection
      id="monitoring"
      icon={BellRing}
      title={t("مراقبة الرحلات والتنبيهات")}
      description={t("متى يظهر تنبيه لفريق العمليات أثناء الرحلة.")}
      summary={
        <Summary>
          <p>{t("إذا لم يصل موقع جديد من السائق خلال")} {strong(durationText(d.stale_location_seconds ?? 0))} {t("يُعتبر موقعه قديماً ولا تصله طلبات جديدة.")}</p>
          <p>{t("يظهر تنبيه إذا توقفت السيارة أثناء الرحلة أكثر من")} {strong(durationText(d.long_stop_seconds ?? 0))}، {t("أو ابتعد السائق عن المسار أكثر من")} {strong(distanceText(d.route_deviation_max_m ?? 0))}.</p>
        </Summary>
      }
      save={saveProps(draft, saver, Object.values(errors).some(Boolean))}
    >
      <SettingLine label={t("متى يُعتبر موقع السائق قديماً")} help={t("التطبيق يرسل موقع السائق باستمرار. إذا انقطع أكثر من هذه المدة لا يُعتمد موقعه في التوزيع.")} error={errors.stale_location_seconds}>
        <UnitStepper label={t("متى يُعتبر موقع السائق قديماً")} value={d.stale_location_seconds} onChange={(v) => draft.set("stale_location_seconds", v)} units={TIME_UNITS_SEC.slice(0, 2)} min={1} invalid={!!errors.stale_location_seconds} />
      </SettingLine>
      <SettingLine label={t("تنبيه التوقف الطويل")} help={t("إذا بقيت السيارة متوقفة أثناء الرحلة أكثر من هذه المدة.")} error={errors.long_stop_seconds}>
        <UnitStepper label={t("تنبيه التوقف الطويل")} value={d.long_stop_seconds} onChange={(v) => draft.set("long_stop_seconds", v)} units={TIME_UNITS_SEC.slice(0, 2)} min={1} invalid={!!errors.long_stop_seconds} />
      </SettingLine>
      <SettingLine label={t("تنبيه الخروج عن المسار")} help={t("إذا ابتعد السائق عن المسار المتوقع للرحلة أكثر من هذه المسافة.")} error={errors.route_deviation_max_m}>
        <UnitStepper label={t("تنبيه الخروج عن المسار")} value={d.route_deviation_max_m} onChange={(v) => draft.set("route_deviation_max_m", v)} units={DISTANCE_UNITS} min={50} invalid={!!errors.route_deviation_max_m} />
      </SettingLine>
    </SettingsSection>
  );
}

function ScheduledSection({ data }: { data: Row }) {
  const draft = useDraft({
    scheduled_reminder_seconds: asNumber(data.scheduled_reminder_seconds),
    scheduled_online_required_seconds: asNumber(data.scheduled_online_required_seconds),
    scheduled_required_early_arrival_sec: asNumber(data.scheduled_required_early_arrival_sec),
    scheduled_late_tolerance_seconds: asNumber(data.scheduled_late_tolerance_seconds),
    scheduled_busy_to_pickup_max_eta_sec: asNumber(data.scheduled_busy_to_pickup_max_eta_sec),
  });
  const saver = useSaver(DISPATCH, true);
  const d = draft.draft;
  const errors = {
    scheduled_reminder_seconds: need(d.scheduled_reminder_seconds, 1),
    scheduled_online_required_seconds: need(d.scheduled_online_required_seconds, 1),
    scheduled_required_early_arrival_sec: need(d.scheduled_required_early_arrival_sec, 0),
    scheduled_late_tolerance_seconds: need(d.scheduled_late_tolerance_seconds, 0),
    scheduled_busy_to_pickup_max_eta_sec: need(d.scheduled_busy_to_pickup_max_eta_sec, 0),
  };
  const units = TIME_UNITS_SEC;
  return (
    <SettingsSection
      id="scheduled"
      icon={CalendarClock}
      title={t("الرحلات المجدولة")}
      description={t("ماذا يحدث قبل موعد الرحلة المحجوزة مسبقاً.")}
      summary={
        <Summary>
          <p>{t("قبل الموعد بـ")}{strong(durationText(d.scheduled_reminder_seconds ?? 0))} {t("يصل تذكير للسائق.")}</p>
          <p>
            {t("يجب أن يكون متصلاً قبل الموعد بـ")}{strong(durationText(d.scheduled_online_required_seconds ?? 0))}{t("، وأن يصل للزبون قبل الموعد بـ")}{strong(durationText(d.scheduled_required_early_arrival_sec ?? 0))}.
          </p>
          <p>{t("إذا تأخر أكثر من")} {strong(durationText(d.scheduled_late_tolerance_seconds ?? 0))} {t("بعد الموعد يُعتبر متأخراً.")}</p>
        </Summary>
      }
      save={saveProps(draft, saver, Object.values(errors).some(Boolean))}
    >
      <SettingLine label={t("تذكير السائق قبل الموعد")} help={t("متى يصل إشعار التذكير للسائق.")} error={errors.scheduled_reminder_seconds}>
        <UnitStepper label={t("تذكير السائق قبل الموعد")} value={d.scheduled_reminder_seconds} onChange={(v) => draft.set("scheduled_reminder_seconds", v)} units={units} min={1} invalid={!!errors.scheduled_reminder_seconds} />
      </SettingLine>
      <SettingLine label={t("يكون متصلاً قبل الموعد بـ")} help={t("يجب أن يفتح السائق التطبيق ويكون متصلاً قبل الموعد بهذه المدة.")} error={errors.scheduled_online_required_seconds}>
        <UnitStepper label={t("يكون متصلاً قبل الموعد بـ")} value={d.scheduled_online_required_seconds} onChange={(v) => draft.set("scheduled_online_required_seconds", v)} units={units} min={1} invalid={!!errors.scheduled_online_required_seconds} />
      </SettingLine>
      <SettingLine label={t("يصل للزبون قبل الموعد بـ")} help={t("حتى لا يتأخر الزبون عن موعده.")} error={errors.scheduled_required_early_arrival_sec}>
        <UnitStepper label={t("يصل للزبون قبل الموعد بـ")} value={d.scheduled_required_early_arrival_sec} onChange={(v) => draft.set("scheduled_required_early_arrival_sec", v)} units={units} min={0} invalid={!!errors.scheduled_required_early_arrival_sec} />
      </SettingLine>
      <SettingLine label={t("التأخير المسموح")} help={t("بعد هذه المدة من الموعد يُعتبر السائق متأخراً.")} error={errors.scheduled_late_tolerance_seconds}>
        <UnitStepper label={t("التأخير المسموح")} value={d.scheduled_late_tolerance_seconds} onChange={(v) => draft.set("scheduled_late_tolerance_seconds", v)} units={units} min={0} invalid={!!errors.scheduled_late_tolerance_seconds} />
      </SettingLine>
      <SettingLine label={t("سائق مشغول: أقصى وقت للوصول")} help={t("للرحلات المجدولة: يُسند الموعد لسائق ما زال في رحلة فقط إذا كان سيصل خلال هذا الوقت.")} error={errors.scheduled_busy_to_pickup_max_eta_sec}>
        <UnitStepper label={t("سائق مشغول: أقصى وقت للوصول")} value={d.scheduled_busy_to_pickup_max_eta_sec} onChange={(v) => draft.set("scheduled_busy_to_pickup_max_eta_sec", v)} units={units.slice(0, 2)} min={0} invalid={!!errors.scheduled_busy_to_pickup_max_eta_sec} />
      </SettingLine>
    </SettingsSection>
  );
}

// ------------------------------------------------------------------ wallet

const EXAMPLE_FARE = 10_000;

function WalletSection({ data }: { data: Row }) {
  const draft = useDraft({
    commission_percentage: asNumber(data.commission_percentage),
    commission_base: String(data.commission_base ?? "GROSS_FINAL_FARE") as "GROSS_FINAL_FARE" | "CUSTOMER_PAYABLE",
    minimum_initial_topup: asNumber(data.minimum_initial_topup),
    system_average_fare: asNumber(data.system_average_fare),
    low_balance_amount_enabled: data.low_balance_amount_enabled === true,
    low_balance_amount: asNumber(data.low_balance_amount),
    low_balance_rides_enabled: data.low_balance_rides_enabled === true,
    low_balance_remaining_rides: asNumber(data.low_balance_remaining_rides),
    driver_cancel_penalty_amount: asNumber(data.driver_cancel_penalty_amount),
  });
  const saver = useSaver(WALLET, true);
  const d = draft.draft;
  const pct = d.commission_percentage ?? 0;
  const errors = {
    commission_percentage: d.commission_percentage == null ? t("أدخل قيمة") : pct < 0 || pct > 100 ? t("النسبة بين 0 و 100") : null,
    minimum_initial_topup: need(d.minimum_initial_topup, 0),
    system_average_fare: need(d.system_average_fare, 0),
    low_balance_amount: d.low_balance_amount_enabled ? need(d.low_balance_amount, 0) : null,
    low_balance_remaining_rides: d.low_balance_rides_enabled ? need(d.low_balance_remaining_rides, 0) : null,
    driver_cancel_penalty_amount: need(d.driver_cancel_penalty_amount, 0),
  };
  const alerts = [
    d.low_balance_amount_enabled && d.low_balance_amount != null ? `${t("ينخفض تحت")} ${formatMoney(d.low_balance_amount)}` : null,
    d.low_balance_rides_enabled && d.low_balance_remaining_rides != null ? `${t("يكفي لـ")}${countText(d.low_balance_remaining_rides, "ride")} ${t("فقط")}` : null,
  ].filter(Boolean);
  return (
    <SettingsSection
      id="wallet"
      icon={Wallet}
      title={t("المحفظة والعمولة")}
      description={t("عمولة الشركة من كل رحلة، والشحن، وتنبيهات الرصيد للسائق.")}
      summary={
        <Summary>
          <p>
            {t("تأخذ الشركة")} {strong(`${formatCount(pct)}%`)} {t("من")} {strong(d.commission_base === "CUSTOMER_PAYABLE" ? t("ما يدفعه العميل") : t("الأجرة النهائية"))}.{" "}
            {t("مثال: رحلة بـ")}{formatMoney(EXAMPLE_FARE)} ← {t("عمولة")} {strong(formatMoney((EXAMPLE_FARE * pct) / 100))}.
          </p>
          <p>{t("أول شحن للسائق لا يقل عن")} {strong(formatMoney(d.minimum_initial_topup ?? 0))}.</p>
          <p>{alerts.length ? `${t("يصل تنبيه للسائق عندما رصيده")} ${alerts.join(` ${t("أو")} `)}.` : t("تنبيهات الرصيد المنخفض متوقفة.")}</p>
        </Summary>
      }
      save={saveProps(draft, saver, Object.values(errors).some(Boolean))}
    >
      <SettingLine label={t("نسبة عمولة الشركة")} help={t("تُخصم من محفظة السائق عند إكمال كل رحلة.")} error={errors.commission_percentage}>
        <Stepper label={t("نسبة عمولة الشركة")} value={d.commission_percentage} onChange={(v) => draft.set("commission_percentage", v)} min={0} max={100} step={0.5} unit="%" invalid={!!errors.commission_percentage} />
      </SettingLine>
      <SettingLine label={t("تُحسب العمولة من")}>
        <Choice
          value={d.commission_base}
          onChange={(v) => draft.set("commission_base", v)}
          options={[
            { value: "GROSS_FINAL_FARE", label: t("الأجرة النهائية"), hint: t("أجرة الرحلة كاملة قبل أي خصم للزبون.") },
            { value: "CUSTOMER_PAYABLE", label: t("ما يدفعه العميل"), hint: t("المبلغ بعد خصم الكوبونات والعروض.") },
          ]}
        />
      </SettingLine>
      <SettingLine label={t("أقل مبلغ لأول شحن")} help={t("أول مرة يشحن فيها السائق محفظته يجب ألا تقل عن هذا المبلغ.")} error={errors.minimum_initial_topup}>
        <Stepper label={t("أقل مبلغ لأول شحن")} value={d.minimum_initial_topup} onChange={(v) => draft.set("minimum_initial_topup", v)} min={0} step={1000} unit={t("ل.س")} invalid={!!errors.minimum_initial_topup} />
      </SettingLine>
      <SettingLine label={t("متوسط أجرة الرحلة")} help={t("يُستخدم لتقدير كم رحلة يكفي رصيد السائق.")} error={errors.system_average_fare}>
        <Stepper label={t("متوسط أجرة الرحلة")} value={d.system_average_fare} onChange={(v) => draft.set("system_average_fare", v)} min={0} step={500} unit={t("ل.س")} invalid={!!errors.system_average_fare} />
      </SettingLine>
      <SettingLine label={t("تنبيه عندما ينخفض الرصيد تحت مبلغ")} help={t("يصل تنبيه للسائق ليشحن محفظته.")} error={errors.low_balance_amount}>
        <Switch checked={d.low_balance_amount_enabled} onChange={(v) => draft.set("low_balance_amount_enabled", v)} onLabel={t("مفعّل")} offLabel={t("متوقف")} />
        {d.low_balance_amount_enabled ? (
          <Stepper label={t("تنبيه عندما ينخفض الرصيد تحت مبلغ")} value={d.low_balance_amount} onChange={(v) => draft.set("low_balance_amount", v)} min={0} step={1000} unit={t("ل.س")} invalid={!!errors.low_balance_amount} />
        ) : null}
      </SettingLine>
      <SettingLine label={t("تنبيه عندما يكفي الرصيد لعدد قليل من الرحلات")} help={t("يُحسب من متوسط أجرة الرحلة ونسبة العمولة.")} error={errors.low_balance_remaining_rides}>
        <Switch checked={d.low_balance_rides_enabled} onChange={(v) => draft.set("low_balance_rides_enabled", v)} onLabel={t("مفعّل")} offLabel={t("متوقف")} />
        {d.low_balance_rides_enabled ? (
          <Stepper label={t("تنبيه عندما يكفي الرصيد لعدد قليل من الرحلات")} value={d.low_balance_remaining_rides} onChange={(v) => draft.set("low_balance_remaining_rides", v)} min={0} unit={unitWord(d.low_balance_remaining_rides ?? 0, "ride")} invalid={!!errors.low_balance_remaining_rides} />
        ) : null}
      </SettingLine>
      <SettingLine label={t("غرامة إلغاء السائق")} help={t("تُخصم من محفظة السائق إذا ألغى رحلة بعد قبولها.")} error={errors.driver_cancel_penalty_amount}>
        <Stepper label={t("غرامة إلغاء السائق")} value={d.driver_cancel_penalty_amount} onChange={(v) => draft.set("driver_cancel_penalty_amount", v)} min={0} step={500} unit={t("ل.س")} invalid={!!errors.driver_cancel_penalty_amount} />
      </SettingLine>
    </SettingsSection>
  );
}

// ------------------------------------------------------------------ passport

function PassportSection({ data }: { data: Row }) {
  const draft = useDraft({
    initial_score: asNumber(data.initial_score),
    minimum_score: asNumber(data.minimum_score),
    maximum_score: asNumber(data.maximum_score),
    review_interval_minutes: asNumber(data.review_interval_minutes),
  });
  const saver = useSaver(PASSPORT, false);
  const d = draft.draft;
  const order =
    d.minimum_score != null && d.maximum_score != null && d.minimum_score >= d.maximum_score
      ? t("أدنى حد يجب أن يكون أقل من أعلى حد")
      : null;
  const errors = {
    initial_score:
      d.initial_score == null
        ? t("أدخل قيمة")
        : (d.minimum_score != null && d.initial_score < d.minimum_score) || (d.maximum_score != null && d.initial_score > d.maximum_score)
          ? t("يجب أن تكون بين أدنى حد وأعلى حد")
          : null,
    minimum_score: d.minimum_score == null ? t("أدخل قيمة") : order,
    maximum_score: d.maximum_score == null ? t("أدخل قيمة") : order,
    review_interval_minutes: need(d.review_interval_minutes, 1),
  };
  return (
    <SettingsSection
      id="passport"
      icon={IdCard}
      title={t("جواز العميل")}
      description={t("نقاط سرية لكل عميل تحدد مستواه. العميل يرى مستواه فقط، لا يرى النقاط.")}
      summary={
        <Summary>
          <p>
            {t("يبدأ العميل الجديد بـ")}{strong(countText(d.initial_score ?? 0, "point"))}. {t("النقاط تبقى بين")} {strong(formatCount(d.minimum_score ?? 0))} {t("و")}{strong(formatCount(d.maximum_score ?? 0))}.
          </p>
          <p>{t("يُراجع مستوى العميل كل")} {strong(durationText((d.review_interval_minutes ?? 0) * 60))}.</p>
        </Summary>
      }
      save={saveProps(draft, saver, Object.values(errors).some(Boolean))}
    >
      <SettingLine label={t("نقاط العميل الجديد")} error={errors.initial_score}>
        <Stepper label={t("نقاط العميل الجديد")} value={d.initial_score} onChange={(v) => draft.set("initial_score", v)} step={10} unit={unitWord(d.initial_score ?? 0, "point")} invalid={!!errors.initial_score} />
      </SettingLine>
      <SettingLine label={t("أدنى حد للنقاط")} help={t("لا تنزل نقاط أي عميل تحت هذا الحد. يمكن أن يكون سالباً.")} error={errors.minimum_score}>
        <Stepper label={t("أدنى حد للنقاط")} value={d.minimum_score} onChange={(v) => draft.set("minimum_score", v)} step={10} unit={unitWord(d.minimum_score ?? 0, "point")} invalid={!!errors.minimum_score} />
      </SettingLine>
      <SettingLine label={t("أعلى حد للنقاط")} error={errors.maximum_score}>
        <Stepper label={t("أعلى حد للنقاط")} value={d.maximum_score} onChange={(v) => draft.set("maximum_score", v)} step={10} unit={unitWord(d.maximum_score ?? 0, "point")} invalid={!!errors.maximum_score} />
      </SettingLine>
      <SettingLine label={t("مراجعة المستوى كل")} help={t("كل هذه المدة يُعاد حساب مستوى العميل حسب نقاطه.")} error={errors.review_interval_minutes}>
        <UnitStepper label={t("مراجعة المستوى كل")} value={d.review_interval_minutes} onChange={(v) => draft.set("review_interval_minutes", v)} units={TIME_UNITS_MIN} min={1} invalid={!!errors.review_interval_minutes} />
      </SettingLine>
    </SettingsSection>
  );
}

function CustomerStreakSection({ data }: { data: Row }) {
  const draft = useDraft({ is_active: data.is_active === true });
  const saver = useSaver(STREAK, false);
  const d = draft.draft;
  return (
    <SettingsSection
      id="customer-streak"
      icon={Flame}
      title={t("مكافأة رحلات العميل المتتالية")}
      description={t("مكافأة للعميل عند أعداد رحلات متتالية تحددها أنت.")}
      enabled={d.is_active}
      onToggle={(v) => draft.set("is_active", v)}
      summary={
        <Summary off={!d.is_active}>
          {d.is_active ? (
            <p>{t("يحصل العميل على مكافأة عند الأعداد المحددة في جدول المكافآت فقط.")}</p>
          ) : (
            <p>{t("المكافأة متوقفة: لن يحصل العملاء على مكافآت جديدة.")}</p>
          )}
        </Summary>
      }
      extra={
        <Link href="/admin/passport" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent transition-colors hover:text-brand-strong">
          {t("حدد الأعداد والمكافآت من جواز العميل ← مكافآت السلسلة")}
        </Link>
      }
      save={saveProps(draft, saver, false)}
    />
  );
}

// ------------------------------------------------------------------ page

export function DispatchSettingsScreen() {
  const streak = useGoRecord(STREAK);
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6">
      <header className="grid gap-2">
        <h1 className="text-[26px] font-semibold tracking-tight text-heading">{t("إعدادات التوزيع")}</h1>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          {t("كل قسم يشرح ماذا يفعل، وتحته جملة توضح ما سيحدث بالقيم الحالية. غيّر ما تريد ثم اضغط «حفظ التغييرات» أسفل القسم. لا يتغير شيء قبل الحفظ.")}
        </p>
      </header>
      <SectionNav
        items={[
          { id: "matching", label: t("توزيع الطلبات"), icon: Radar },
          { id: "arrival", label: t("الوصول"), icon: MapPinCheck },
          { id: "monitoring", label: t("التنبيهات"), icon: BellRing },
          { id: "scheduled", label: t("المجدولة"), icon: CalendarClock },
          { id: "wallet", label: t("المحفظة والعمولة"), icon: Wallet },
          { id: "passport", label: t("جواز العميل"), icon: IdCard },
          { id: "customer-streak", label: t("رحلات العميل المتتالية"), icon: Flame, on: streak.data ? streak.data.is_active === true : undefined },
        ]}
      />
      <Loaded path={DISPATCH}>
        {(data) => (
          <div className="grid gap-6">
            <MatchingSection data={data} />
            <ArrivalSection data={data} />
            <MonitoringSection data={data} />
            <ScheduledSection data={data} />
          </div>
        )}
      </Loaded>
      <Loaded path={WALLET}>{(data) => <WalletSection data={data} />}</Loaded>
      <Loaded path={PASSPORT}>{(data) => <PassportSection data={data} />}</Loaded>
      <Loaded path={STREAK}>{(data) => <CustomerStreakSection data={data} />}</Loaded>
    </div>
  );
}
