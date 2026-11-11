"use client";

import { Check, ChevronLeft, History, MapPinned, Pencil, Plus, Repeat2, SlidersHorizontal, Target, Trash2, Trophy, UserX, type IconNode } from "lucide";
import Link from "next/link";
import { useState } from "react";

import { useConfirm } from "@/features/desk/confirm";
import { FormDialog, TimeField } from "@/features/desk/controls";
import { isGoFailure, useGo, useGoList, useGoRecord } from "@/features/desk/hooks";
import { getDeskLocale, listJoin, t } from "@/features/desk/i18n/t";
import { formatMoney, formatScalar, headline } from "@/features/desk/present";
import { ChoiceSelect } from "@/features/desk/select";
import {
  asNumber,
  Choice,
  clockText,
  countText,
  DISTANCE_UNITS,
  distanceText,
  formatCount,
  OptionalStepper,
  SectionNav,
  SettingLine,
  SettingsSection,
  Stepper,
  Summary,
  Switch,
  UnitStepper,
  unitWord,
  useDraft,
  useSectionSave,
} from "@/features/desk/settings-kit";
import { btnGhost, btnGhostSm, btnPrimary, inputClass, StateView } from "@/features/desk/ui";
import { Icon } from "@/shared/ui/icon";

type Row = Record<string, unknown>;

const CONFIG = "/admin/incentives/config";
const EXAMPLE_FARE = 10_000;

function text(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function strong(value: string) {
  return <b className="font-semibold text-accent">{value}</b>;
}

function need(value: number | null, min: number, max?: number) {
  if (value == null) return t("أدخل قيمة");
  if (value < min) return `${t("أقل قيمة مسموحة")}: ${formatCount(min)}`;
  if (max != null && value > max) return `${t("أعلى قيمة مسموحة")}: ${formatCount(max)}`;
  return null;
}

function useConfigSaver() {
  const call = useGo();
  return useSectionSave(async (changes) => {
    const saved = await call(CONFIG, { method: "PATCH", body: changes });
    if (isGoFailure(saved)) throw new Error("save failed");
  });
}

function saveProps(draft: { dirty: boolean; changes: Row; reset: () => void }, saver: ReturnType<typeof useConfigSaver>, errors: Record<string, string | null>) {
  return {
    dirty: draft.dirty,
    saving: saver.saving,
    blocked: Object.values(errors).some(Boolean),
    onReset: draft.reset,
    onSave: () => void saver.run(draft.changes).catch(() => undefined),
  };
}

function bonusExample(pct: number, cap: number | null) {
  const raw = (EXAMPLE_FARE * pct) / 100;
  const paid = cap != null ? Math.min(raw, cap) : raw;
  return (
    <p>
      {t("مثال: رحلة بـ")}
      {formatMoney(EXAMPLE_FARE)} ← {t("يحصل السائق على")} {strong(formatMoney(paid))} {t("إضافية من الشركة.")}
    </p>
  );
}

// ------------------------------------------------------------------ overview

function OverviewTile({ id, icon, title, on, value }: { id: string; icon: IconNode; title: string; on: boolean; value: string }) {
  return (
    <button
      type="button"
      onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
      className="group grid gap-3 rounded-2xl border border-line bg-surface p-4 text-start shadow-card transition-colors hover:border-teal/50"
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`grid size-10 place-items-center rounded-xl ring-1 ring-inset ${on ? "bg-brand/12 text-accent ring-brand/25" : "bg-heading/[0.05] text-muted ring-line"}`}>
          <Icon node={icon} size={19} />
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${on ? "bg-success/12 text-success-ink" : "bg-heading/[0.06] text-muted"}`}>
          <span className={`size-1.5 rounded-full ${on ? "bg-success" : "bg-line-strong"}`} />
          {on ? t("مفعّلة") : t("متوقفة")}
        </span>
      </div>
      <div>
        <p className="text-sm font-semibold text-heading">{title}</p>
        <p className="mt-1 text-[13px] leading-6 text-muted">{value}</p>
      </div>
      <span className="flex items-center gap-1 text-xs font-semibold text-accent opacity-80 group-hover:opacity-100">
        {t("تعديل")}
        <Icon node={ChevronLeft} size={14} className="ltr:rotate-180" />
      </span>
    </button>
  );
}

// ------------------------------------------------------------------ streak

function StreakSection({ config }: { config: Row }) {
  const draft = useDraft({
    streak_enabled: config.streak_enabled === true,
    streak_rides: asNumber(config.streak_rides),
    streak_amount: asNumber(config.streak_amount),
    daily_close_time: text(config.daily_close_time).slice(0, 5) || "00:00",
    streak_count_expired: config.streak_count_expired !== false,
  });
  const saver = useConfigSaver();
  const d = draft.draft;
  const errors = { streak_rides: need(d.streak_rides, 1, 100), streak_amount: need(d.streak_amount, 0) };
  return (
    <SettingsSection
      id="streak"
      icon={Repeat2}
      title={t("جائزة الرحلات المتتالية")}
      description={t("جائزة يومية للسائق الذي يكمل عدة رحلات وراء بعضها بدون أن يرفض أي طلب.")}
      enabled={d.streak_enabled}
      onToggle={(v) => draft.set("streak_enabled", v)}
      summary={
        <Summary off={!d.streak_enabled}>
          {d.streak_enabled ? (
            <>
              <p>
                {t("السائق الذي يكمل")} {strong(countText(d.streak_rides ?? 0, "ride"))} {t("متتالية بدون رفض أو إلغاء بينها يحصل على")} {strong(formatMoney(d.streak_amount ?? 0))}.
              </p>
              <p>
                {t("تُصرف مرة واحدة في اليوم، عند")} {strong(clockText(d.daily_close_time))}. {d.streak_count_expired ? t("تجاهل العرض حتى تنتهي مهلته يكسر السلسلة.") : t("تجاهل العرض لا يكسر السلسلة.")}
              </p>
            </>
          ) : (
            <p>{t("الجائزة متوقفة: لن تُصرف جوائز جديدة حتى تفعّلها.")}</p>
          )}
        </Summary>
      }
      save={saveProps(draft, saver, errors)}
    >
      <SettingLine label={t("عدد الرحلات المتتالية المطلوبة")} help={t("رحلات مكتملة وراء بعضها، بدون رفض أو إلغاء بينها.")} error={errors.streak_rides}>
        <Stepper label={t("عدد الرحلات المتتالية المطلوبة")} value={d.streak_rides} onChange={(v) => draft.set("streak_rides", v)} min={1} max={100} unit={unitWord(d.streak_rides ?? 0, "ride")} invalid={!!errors.streak_rides} />
      </SettingLine>
      <SettingLine label={t("مبلغ الجائزة")} help={t("يُضاف إلى محفظة السائق.")} error={errors.streak_amount}>
        <Stepper label={t("مبلغ الجائزة")} value={d.streak_amount} onChange={(v) => draft.set("streak_amount", v)} min={0} step={5000} unit={t("ل.س")} invalid={!!errors.streak_amount} />
      </SettingLine>
      <SettingLine label={t("متى ينتهي يوم الحوافز")} help={t("اليوم يبدأ من هذه الساعة حتى نفس الساعة في اليوم التالي، وتُصرف الجائزة عندها. مثلاً 4 صباحاً تجعل رحلات آخر الليل تُحسب مع اليوم السابق.")}>
        <TimeField value={d.daily_close_time} onValueChange={(v) => draft.set("daily_close_time", v)} presets={["00:00", "02:00", "04:00", "06:00"]} />
      </SettingLine>
      <SettingLine label={t("إذا تجاهل السائق العرض حتى انتهت مهلته")}>
        <Choice
          value={d.streak_count_expired ? "yes" : "no"}
          onChange={(v) => draft.set("streak_count_expired", v === "yes")}
          options={[
            { value: "yes", label: t("يكسر السلسلة"), hint: t("يُعامل مثل الرفض.") },
            { value: "no", label: t("لا يكسر السلسلة"), hint: t("فقط الرفض الصريح أو الإلغاء يكسرها.") },
          ]}
        />
      </SettingLine>
    </SettingsSection>
  );
}

// ------------------------------------------------------------------ campaigns

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const WORK_DAYS = [0, 1, 2, 3, 4];
const WEEKEND_DAYS = [5, 6];

function daysText(days: number[]) {
  return days.length === 0 || days.length === 7 ? t("كل يوم") : listJoin(days.map((day) => t(WEEKDAYS[day] ?? "")));
}

function sameDays(a: number[], b: number[]) {
  return a.length === b.length && a.every((day) => b.includes(day));
}

function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (next: number[]) => void }) {
  const everyDay = value.length === 0;
  const presets = [
    { label: t("كل الأيام"), days: [] as number[] },
    { label: t("أيام العمل"), days: WORK_DAYS },
    { label: t("نهاية الأسبوع"), days: WEEKEND_DAYS },
  ];
  function toggle(day: number) {
    const next = value.includes(day) ? value.filter((item) => item !== day) : [...value, day].sort((a, b) => a - b);
    onChange(next.length === 7 ? [] : next);
  }
  return (
    <div className="grid gap-2.5">
      <div className="inline-flex w-fit rounded-xl bg-heading/[0.05] p-1 ring-1 ring-inset ring-line">
        {presets.map((preset) => {
          const active = sameDays(value, preset.days);
          return (
            <button
              key={preset.label}
              type="button"
              aria-pressed={active}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${active ? "bg-teal text-on-teal shadow-glow" : "text-body hover:bg-heading/[0.06] hover:text-heading"}`}
              onClick={() => onChange(preset.days)}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
        {WEEKDAYS.map((label, index) => {
          const picked = value.includes(index);
          return (
            <button
              key={label}
              type="button"
              aria-pressed={picked}
              className={`group relative grid h-[4.25rem] place-items-center content-center gap-1.5 rounded-xl border text-[13px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 ${
                picked
                  ? "border-teal bg-teal text-on-teal shadow-glow"
                  : everyDay
                    ? "border-teal/35 bg-brand/[0.07] text-heading hover:border-teal/60"
                    : "border-line-strong bg-surface text-body hover:border-teal/45 hover:text-heading"
              }`}
              onClick={() => toggle(index)}
            >
              <span>{t(label)}</span>
              <span className={`grid size-5 place-items-center rounded-full ${picked ? "bg-on-teal/20" : everyDay ? "bg-brand/15 text-accent" : "text-transparent ring-1 ring-inset ring-line-strong group-hover:text-muted"}`}>
                <Icon node={Check} size={12} strokeWidth={3} />
              </span>
              {WEEKEND_DAYS.includes(index) ? <span className={`absolute end-1.5 top-1.5 size-1.5 rounded-full ${picked ? "bg-on-teal/70" : "bg-warning"}`} title={t("نهاية الأسبوع")} /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CampaignEditor({ campaign, onDone }: { campaign: Row | null; onDone: () => void }) {
  const call = useGo();
  const branches = useGoList("/admin/branches", { limit: 100 });
  const [name, setName] = useState(text(campaign?.name));
  const [start, setStart] = useState(text(campaign?.start_time).slice(0, 5) || "22:00");
  const [end, setEnd] = useState(text(campaign?.end_time).slice(0, 5) || "00:00");
  const [days, setDays] = useState<number[]>(Array.isArray(campaign?.days_of_week) ? (campaign.days_of_week as number[]).map(Number) : []);
  const [rides, setRides] = useState<number | null>(asNumber(campaign?.rides_required) ?? 5);
  const [reward, setReward] = useState<number | null>(asNumber(campaign?.reward_amount) ?? 50_000);
  const [branch, setBranch] = useState(text(campaign?.branch_id));
  const [active, setActive] = useState(campaign ? campaign.is_active !== false : true);
  const [saving, setSaving] = useState(false);
  const branchName = (branches.data ?? []).find((row) => String(row.id) === branch);
  const errors = {
    name: name.trim() ? null : t("اكتب اسماً للحملة"),
    rides: need(rides, 1, 1000),
    reward: need(reward, 0),
    time: start === end ? t("وقت البداية والنهاية متساويان") : null,
  };
  const blocked = Object.values(errors).some(Boolean);

  async function save() {
    if (blocked) return;
    setSaving(true);
    const body = {
      name: name.trim(),
      start_time: start,
      end_time: end,
      days_of_week: days,
      rides_required: rides,
      reward_amount: reward,
      branch_id: branch || null,
      is_active: active,
    };
    const saved = campaign
      ? await call(`/admin/incentives/campaigns/${text(campaign.id)}`, { method: "PATCH", body })
      : await call("/admin/incentives/campaigns", { method: "POST", body });
    setSaving(false);
    if (!isGoFailure(saved)) onDone();
  }

  return (
    <div className="grid gap-5">
      <Summary title={t("الحملة باختصار")}>
        <p>
          {t("من")} {strong(clockText(start))} {t("حتى")} {strong(clockText(end))}، {strong(daysText(days))}
          {branchName ? <> {t("في")} {strong(headline(branchName))}</> : <> {t("في كل المحافظات")}</>}.
        </p>
        <p>
          {t("كل سائق يكمل")} {strong(countText(rides ?? 0, "ride"))} {t("خلال هذا الوقت يحصل على")} {strong(formatMoney(reward ?? 0))}.
        </p>
        <p className="text-muted">{t("يصل إشعار للسائقين عند بداية الحملة، وتُصرف الجائزة تلقائياً عند نهايتها.")}</p>
      </Summary>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid content-start gap-1.5 sm:col-span-2">
          <span className="text-sm font-semibold text-heading">{t("اسم الحملة")}</span>
          <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("مثلاً: هدف الليل")} />
        </label>
        <div className="grid content-start gap-1.5">
          <span className="text-sm font-semibold text-heading">{t("تبدأ الساعة")}</span>
          <TimeField value={start} onValueChange={setStart} presets={["18:00", "20:00", "22:00", "23:00"]} />
        </div>
        <div className="grid content-start gap-1.5">
          <span className="text-sm font-semibold text-heading">{t("تنتهي الساعة")}</span>
          <TimeField value={end} onValueChange={setEnd} presets={["22:00", "00:00", "02:00", "04:00"]} />
          {errors.time ? <span className="text-xs text-danger-ink">{errors.time}</span> : null}
        </div>
        <div className="grid content-start gap-1.5">
          <span className="text-sm font-semibold text-heading">{t("عدد الرحلات المطلوبة")}</span>
          <Stepper label={t("عدد الرحلات المطلوبة")} value={rides} onChange={setRides} min={1} max={1000} unit={unitWord(rides ?? 0, "ride")} invalid={!!errors.rides} />
        </div>
        <div className="grid content-start gap-1.5">
          <span className="text-sm font-semibold text-heading">{t("مبلغ الجائزة")}</span>
          <Stepper label={t("مبلغ الجائزة")} value={reward} onChange={setReward} min={0} step={5000} unit={t("ل.س")} invalid={!!errors.reward} />
        </div>
        <div className="grid content-start gap-1.5 sm:col-span-2">
          <span className="text-sm font-semibold text-heading">{t("أيام الحملة")}</span>
          <WeekdayPicker value={days} onChange={setDays} />
          <span className="text-xs text-muted">{t("إذا عبرت الفترة منتصف الليل فاليوم هو يوم البداية.")}</span>
        </div>
        <div className="grid content-start gap-1.5">
          <span className="text-sm font-semibold text-heading">{t("المحافظة")}</span>
          <ChoiceSelect value={branch} onValueChange={setBranch} emptyLabel={t("كل المحافظات")} options={(branches.data ?? []).map((row) => ({ value: String(row.id), label: headline(row) }))} />
        </div>
        <div className="grid content-start gap-1.5">
          <span className="text-sm font-semibold text-heading">{t("حالة الحملة")}</span>
          <div className="flex">
            <Switch checked={active} onChange={setActive} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {blocked ? <p className="me-auto text-xs font-medium text-muted">{Object.values(errors).find(Boolean)}</p> : null}
        <button className={btnGhost} type="button" onClick={onDone}>{t("إلغاء")}</button>
        <button className={btnPrimary} type="button" onClick={() => void save()} disabled={blocked || saving}>
          <Icon node={Check} size={16} />
          {campaign ? t("حفظ الحملة") : t("إنشاء الحملة")}
        </button>
      </div>
    </div>
  );
}

function CampaignCard({ row, onEdit }: { row: Row; onEdit: () => void }) {
  const call = useGo();
  const confirm = useConfirm();
  const on = row.is_active !== false;
  const days = Array.isArray(row.days_of_week) ? (row.days_of_week as number[]).map(Number) : [];
  const facts: [string, string][] = [
    [t("الوقت"), `${clockText(text(row.start_time))} ← ${clockText(text(row.end_time))}`],
    [t("الأيام"), daysText(days)],
    [t("الهدف"), `${countText(asNumber(row.rides_required) ?? 0, "ride")} = ${formatMoney(asNumber(row.reward_amount) ?? 0)}`],
    [t("المحافظة"), row.branch && typeof row.branch === "object" ? headline(row.branch as Row) : t("كل المحافظات")],
  ];
  return (
    <article className={`grid gap-3 rounded-xl border p-4 ${on ? "border-line" : "border-dashed border-line-strong bg-heading/[0.02]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-[15px] font-semibold text-heading">{text(row.name)}</p>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${on ? "bg-success/12 text-success-ink" : "bg-heading/[0.06] text-muted"}`}>
            <span className={`size-1.5 rounded-full ${on ? "bg-success" : "bg-line-strong"}`} />
            {on ? t("فعّالة") : t("متوقفة")}
          </span>
        </div>
        <div className="flex gap-1.5">
          <button className={btnGhostSm} type="button" onClick={onEdit}>
            <Icon node={Pencil} size={13} />
            {t("تعديل")}
          </button>
          <button
            className={btnGhostSm}
            type="button"
            onClick={() =>
              void confirm({
                title: t("حذف الحملة"),
                body: t("لن تُصرف جوائز جديدة لهذه الحملة. الجوائز المصروفة تبقى في المحافظ."),
                confirm: t("حذف"),
                danger: true,
                perform: () => call(`/admin/incentives/campaigns/${text(row.id)}`, { method: "DELETE" }),
              })
            }
          >
            <Icon node={Trash2} size={13} />
            {t("حذف")}
          </button>
        </div>
      </div>
      <dl className="grid gap-2 sm:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-heading/[0.03] px-3 py-2">
            <dt className="text-[11px] font-medium text-muted">{label}</dt>
            <dd className="mt-0.5 text-[13px] font-semibold text-heading">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted">
        {t("صُرف حتى الآن")}: <span className="font-semibold text-heading">{formatMoney(asNumber(row.grants_total) ?? 0)}</span> · {countText(asNumber(row.grants_count) ?? 0, "driver")}
      </p>
    </article>
  );
}

function CampaignsSection() {
  const campaigns = useGoList("/admin/incentives/campaigns");
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);
  const rows = campaigns.data ?? [];
  const activeCount = rows.filter((row) => row.is_active !== false).length;
  return (
    <SettingsSection
      id="goals"
      icon={Target}
      title={t("حملات الأهداف")}
      description={t("هدف بوقت محدد: مثلاً من 10 مساءً حتى 12، من يكمل 5 رحلات يحصل على 50,000 ل.س.")}
      summary={
        <Summary off={activeCount === 0}>
          <p>
            {activeCount
              ? `${t("عدد الحملات الفعّالة الآن")}: ${formatCount(activeCount)}. ${t("يصل إشعار للسائقين عند بداية كل حملة، وتُصرف الجائزة تلقائياً عند نهايتها لمن حقق الهدف.")}`
              : t("لا توجد حملات فعّالة. أنشئ حملة لتشجيع السائقين في أوقات الضغط.")}
          </p>
        </Summary>
      }
      extra={
        <div className="grid gap-3 pt-4">
          <StateView bare loading={campaigns.isLoading} error={campaigns.error}>
            {rows.map((row) => <CampaignCard key={text(row.id)} row={row} onEdit={() => setEditing(row)} />)}
          </StateView>
          <button
            type="button"
            className="flex h-14 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong text-sm font-semibold text-body transition-colors hover:border-teal/60 hover:bg-brand/[0.05] hover:text-accent"
            onClick={() => setEditing(null)}
          >
            <Icon node={Plus} size={18} />
            {t("حملة جديدة")}
          </button>
          <FormDialog open={editing !== undefined} title={editing ? t("تعديل الحملة") : t("حملة جديدة")} onClose={() => setEditing(undefined)}>
            {editing !== undefined ? <CampaignEditor key={text(editing?.id) || "new"} campaign={editing} onDone={() => setEditing(undefined)} /> : null}
          </FormDialog>
        </div>
      }
    />
  );
}

// ------------------------------------------------------------------ ride bonuses

function RejectionSection({ config }: { config: Row }) {
  const draft = useDraft({
    rejection_enabled: config.rejection_enabled === true,
    rejection_min_drivers: asNumber(config.rejection_min_drivers),
    rejection_pct: asNumber(config.rejection_pct),
    rejection_cap: asNumber(config.rejection_cap),
    rejection_count_expired: config.rejection_count_expired !== false,
  });
  const saver = useConfigSaver();
  const d = draft.draft;
  const errors = {
    rejection_min_drivers: need(d.rejection_min_drivers, 1, 100),
    rejection_pct: need(d.rejection_pct, 0, 100),
    rejection_cap: d.rejection_cap != null && d.rejection_cap < 0 ? t("أدخل مبلغاً صحيحاً") : null,
  };
  return (
    <SettingsSection
      id="rejection"
      icon={UserX}
      title={t("مكافأة الطلب المرفوض")}
      description={t("طلب رفضه عدة سائقين يُعرض على الباقين مع مكافأة، حتى لا يبقى الزبون بدون سائق.")}
      enabled={d.rejection_enabled}
      onToggle={(v) => draft.set("rejection_enabled", v)}
      summary={
        <Summary off={!d.rejection_enabled}>
          {d.rejection_enabled ? (
            <>
              <p>
                {t("إذا رفض")} {strong(countText(d.rejection_min_drivers ?? 0, "driver"))} {t("مختلفين نفس الطلب، يظهر للسائقين التاليين مع مكافأة")} {strong(`${formatCount(d.rejection_pct ?? 0)}%`)} {t("من الأجرة")}
                {d.rejection_cap != null ? <> ({t("بحد أعلى")} {strong(formatMoney(d.rejection_cap))})</> : null}.
              </p>
              {bonusExample(d.rejection_pct ?? 0, d.rejection_cap)}
            </>
          ) : (
            <p>{t("المكافأة متوقفة: الطلبات المرفوضة تُعرض بدون مكافأة.")}</p>
          )}
        </Summary>
      }
      save={saveProps(draft, saver, errors)}
    >
      <SettingLine label={t("تبدأ المكافأة بعد رفض")} help={t("عدد السائقين المختلفين الذين رفضوا نفس الطلب.")} error={errors.rejection_min_drivers}>
        <Stepper label={t("تبدأ المكافأة بعد رفض")} value={d.rejection_min_drivers} onChange={(v) => draft.set("rejection_min_drivers", v)} min={1} max={100} unit={unitWord(d.rejection_min_drivers ?? 0, "driver")} invalid={!!errors.rejection_min_drivers} />
      </SettingLine>
      <SettingLine label={t("نسبة المكافأة من الأجرة")} help={t("تدفعها الشركة للسائق الذي يكمل الرحلة، والزبون لا يدفع أكثر.")} error={errors.rejection_pct}>
        <Stepper label={t("نسبة المكافأة من الأجرة")} value={d.rejection_pct} onChange={(v) => draft.set("rejection_pct", v)} min={0} max={100} unit="%" invalid={!!errors.rejection_pct} />
      </SettingLine>
      <SettingLine label={t("حد أعلى للمكافأة في الرحلة")} error={errors.rejection_cap}>
        <OptionalStepper
          label={t("حد أعلى للمكافأة في الرحلة")}
          value={d.rejection_cap}
          onChange={(v) => draft.set("rejection_cap", v)}
          offLabel={t("بدون حد")}
          onLabel={t("حدد مبلغاً")}
          defaultOn={5000}
          min={0}
          step={1000}
          unit={t("ل.س")}
        />
      </SettingLine>
      <SettingLine label={t("العرض الذي ينتهي بدون رد")}>
        <Choice
          value={d.rejection_count_expired ? "yes" : "no"}
          onChange={(v) => draft.set("rejection_count_expired", v === "yes")}
          options={[
            { value: "yes", label: t("يُحسب رفضاً"), hint: t("السائق الذي يتجاهل العرض يُعد من الرافضين.") },
            { value: "no", label: t("لا يُحسب"), hint: t("فقط من ضغط «رفض».") },
          ]}
        />
      </SettingLine>
    </SettingsSection>
  );
}

function DistanceSection({ config }: { config: Row }) {
  const draft = useDraft({
    distance_enabled: config.distance_enabled === true,
    distance_min_km: asNumber(config.distance_min_km),
    distance_pct: asNumber(config.distance_pct),
    distance_cap: asNumber(config.distance_cap),
    ride_bonus_stack: (text(config.ride_bonus_stack) || "MAX") as "MAX" | "SUM",
  });
  const saver = useConfigSaver();
  const d = draft.draft;
  const errors = {
    distance_min_km: need(d.distance_min_km, 0, 1000),
    distance_pct: need(d.distance_pct, 0, 100),
    distance_cap: d.distance_cap != null && d.distance_cap < 0 ? t("أدخل مبلغاً صحيحاً") : null,
  };
  return (
    <SettingsSection
      id="distance"
      icon={MapPinned}
      title={t("مكافأة الطلب البعيد")}
      description={t("الزبون البعيد عن مركز المحافظة يجد سائقاً أسرع، لأن السائق يحصل على مكافأة.")}
      enabled={d.distance_enabled}
      onToggle={(v) => draft.set("distance_enabled", v)}
      summary={
        <Summary off={!d.distance_enabled}>
          {d.distance_enabled ? (
            <>
              <p>
                {t("إذا كان الزبون على بعد أكثر من")} {strong(countText(d.distance_min_km ?? 0, "km"))} {t("من مركز المحافظة، يحصل السائق على مكافأة")} {strong(`${formatCount(d.distance_pct ?? 0)}%`)} {t("من الأجرة")}
                {d.distance_cap != null ? <> ({t("بحد أعلى")} {strong(formatMoney(d.distance_cap))})</> : null}.
              </p>
              {bonusExample(d.distance_pct ?? 0, d.distance_cap)}
              <p>{d.ride_bonus_stack === "SUM" ? t("إذا كان الطلب مرفوضاً وبعيداً معاً تُصرف المكافأتان.") : t("إذا كان الطلب مرفوضاً وبعيداً معاً تُصرف الأعلى فقط.")}</p>
            </>
          ) : (
            <p>{t("المكافأة متوقفة.")}</p>
          )}
        </Summary>
      }
      save={saveProps(draft, saver, errors)}
    >
      <SettingLine
        label={t("أقل مسافة عن مركز المحافظة")}
        help={
          <>
            {t("تُقاس بخط مستقيم من المركز إلى مكان الزبون.")}{" "}
            <Link href="/admin/branches" className="font-semibold text-accent underline-offset-4 hover:underline">
              {t("تحديد مركز كل محافظة من صفحة الفروع")}
            </Link>
          </>
        }
        error={errors.distance_min_km}
      >
        <Stepper label={t("أقل مسافة عن مركز المحافظة")} value={d.distance_min_km} onChange={(v) => draft.set("distance_min_km", v)} min={0} max={1000} unit={t("كم")} invalid={!!errors.distance_min_km} />
      </SettingLine>
      <SettingLine label={t("نسبة المكافأة من الأجرة")} help={t("تدفعها الشركة للسائق، والزبون لا يدفع أكثر.")} error={errors.distance_pct}>
        <Stepper label={t("نسبة المكافأة من الأجرة")} value={d.distance_pct} onChange={(v) => draft.set("distance_pct", v)} min={0} max={100} unit="%" invalid={!!errors.distance_pct} />
      </SettingLine>
      <SettingLine label={t("حد أعلى للمكافأة في الرحلة")} error={errors.distance_cap}>
        <OptionalStepper
          label={t("حد أعلى للمكافأة في الرحلة")}
          value={d.distance_cap}
          onChange={(v) => draft.set("distance_cap", v)}
          offLabel={t("بدون حد")}
          onLabel={t("حدد مبلغاً")}
          defaultOn={5000}
          min={0}
          step={1000}
          unit={t("ل.س")}
        />
      </SettingLine>
      <SettingLine label={t("إذا كان الطلب مرفوضاً وبعيداً معاً")}>
        <Choice
          value={d.ride_bonus_stack}
          onChange={(v) => draft.set("ride_bonus_stack", v)}
          options={[
            { value: "MAX", label: t("تُصرف الأعلى فقط"), hint: t("مثال: 15% و10% ← يأخذ 15%.") },
            { value: "SUM", label: t("تُصرفان معاً"), hint: t("مثال: 15% و10% ← يأخذ 25%.") },
          ]}
        />
      </SettingLine>
    </SettingsSection>
  );
}

// ------------------------------------------------------------------ scores

const WEIGHTS = [
  { key: "weight_rating", label: "تقييم الزبائن", hint: "متوسط النجوم التي يعطيها الزبائن.", color: "bg-teal" },
  { key: "weight_acceptance", label: "قبول الطلبات", hint: "كم طلباً قبل من الطلبات التي وصلته.", color: "bg-sky-500" },
  { key: "weight_hours", label: "ساعات الاتصال", hint: "مقارنةً بسائقي نفس المحافظة.", color: "bg-violet-500" },
  { key: "weight_earnings", label: "الدخل", hint: "مقارنةً بسائقي نفس المحافظة.", color: "bg-amber-500" },
] as const;

type WeightKey = (typeof WEIGHTS)[number]["key"];

function ScoreSection({ config }: { config: Row }) {
  const draft = useDraft({
    score_window_days: asNumber(config.score_window_days),
    weight_rating: asNumber(config.weight_rating),
    weight_acceptance: asNumber(config.weight_acceptance),
    weight_hours: asNumber(config.weight_hours),
    weight_earnings: asNumber(config.weight_earnings),
    weight_cancel: asNumber(config.weight_cancel),
    band_keep: asNumber(config.band_keep),
    band_watch: asNumber(config.band_watch),
  });
  const saver = useConfigSaver();
  const d = draft.draft;
  const total = WEIGHTS.reduce((sum, item) => sum + (d[item.key] ?? 0), 0);
  const keep = d.band_keep ?? 0;
  const watch = d.band_watch ?? 0;
  const errors: Record<string, string | null> = {
    score_window_days: need(d.score_window_days, 1, 365),
    weights: total <= 0 ? t("اجعل وزناً واحداً على الأقل أكبر من صفر") : null,
    weight_cancel: need(d.weight_cancel, 0, 100),
    band_keep: need(d.band_keep, 0, 100),
    band_watch: need(d.band_watch, 0, 100) ?? (watch >= keep ? t("يجب أن يكون أقل من حد «يُحافظ عليه»") : null),
  };
  return (
    <SettingsSection
      id="scores"
      icon={Trophy}
      title={t("تقييم السائقين")}
      description={t("نتيجة من 100 لكل سائق تُحسب كل ليلة، وتساعدك تعرف من تحافظ عليه ومن يحتاج متابعة.")}
      summary={
        <Summary>
          <p>
            {t("تُحسب النتيجة من آخر")} {strong(countText(d.score_window_days ?? 0, "day"))}.{" "}
            {total > 0
              ? `${t("أهمية كل عنصر")}: ${WEIGHTS.filter((item) => (d[item.key] ?? 0) > 0)
                  .map((item) => `${t(item.label)} ${Math.round(((d[item.key] ?? 0) / total) * 100)}%`)
                  .join(getDeskLocale() === "ar" ? "، " : ", ")}.`
              : null}
          </p>
          <p>
            {strong(`${formatCount(keep)}+`)} {t("يُحافظ عليه")} · {strong(`${formatCount(watch)}–${formatCount(keep)}`)} {t("يحتاج متابعة")} · {t("أقل من")} {strong(formatCount(watch))} {t("قابل للاستبدال")}
          </p>
        </Summary>
      }
      save={saveProps(draft, saver, errors)}
    >
      <SettingLine label={t("فترة التقييم")} help={t("كم يوماً للخلف تُحسب النتيجة.")} error={errors.score_window_days}>
        <Stepper label={t("فترة التقييم")} value={d.score_window_days} onChange={(v) => draft.set("score_window_days", v)} min={1} max={365} unit={unitWord(d.score_window_days ?? 0, "day")} invalid={!!errors.score_window_days} />
      </SettingLine>
      <SettingLine stacked label={t("أهمية كل عنصر في النتيجة")} help={t("حرّك المؤشر. المهم هو حجم كل عنصر مقارنةً بالباقي، والشريط يوضح النسبة النهائية.")} error={errors.weights}>
        <div className="grid gap-3">
          <div className="flex h-3 overflow-hidden rounded-full bg-heading/[0.06]" aria-hidden>
            {WEIGHTS.map((item) => (
              <span key={item.key} className={`${item.color} transition-all`} style={{ width: total > 0 ? `${((d[item.key] ?? 0) / total) * 100}%` : "0%" }} />
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {WEIGHTS.map((item) => {
              const value = d[item.key] ?? 0;
              const share = total > 0 ? Math.round((value / total) * 100) : 0;
              return (
                <label key={item.key} className="grid gap-2 rounded-xl border border-line p-3">
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-heading">
                      <span className={`size-2.5 rounded-full ${item.color}`} />
                      {t(item.label)}
                    </span>
                    <span className="rounded-md bg-heading/[0.05] px-2 py-0.5 text-xs font-bold tabular-nums text-heading">{share}%</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={value}
                    onChange={(event) => draft.set(item.key as WeightKey, Number(event.target.value))}
                    className="w-full accent-teal"
                  />
                  <span className="text-xs text-muted">{t(item.hint)}</span>
                </label>
              );
            })}
          </div>
        </div>
      </SettingLine>
      <SettingLine label={t("خصم الإلغاء")} help={t("النقاط التي تُخصم إذا ألغى السائق كل رحلاته (ونصفها إذا ألغى النصف). 0 يعني أن الإلغاء لا يؤثر.")} error={errors.weight_cancel}>
        <Stepper label={t("خصم الإلغاء")} value={d.weight_cancel} onChange={(v) => draft.set("weight_cancel", v)} min={0} max={100} unit={unitWord(d.weight_cancel ?? 0, "point")} invalid={!!errors.weight_cancel} />
      </SettingLine>
      <SettingLine stacked label={t("تصنيف السائقين حسب النتيجة")} error={errors.band_watch ?? errors.band_keep}>
        <div className="grid gap-4">
          <div className="grid content-start gap-1.5" dir="ltr">
            <div className="flex h-9 overflow-hidden rounded-xl text-[11px] font-semibold">
              <span className="grid place-items-center bg-danger/15 text-danger-ink" style={{ width: `${Math.max(0, Math.min(watch, 100))}%` }}>{watch > 12 ? t("قابل للاستبدال") : null}</span>
              <span className="grid place-items-center bg-warning/20 text-warning-ink" style={{ width: `${Math.max(0, Math.min(keep, 100) - Math.min(watch, 100))}%` }}>{keep - watch > 12 ? t("يحتاج متابعة") : null}</span>
              <span className="grid flex-1 place-items-center bg-success/15 text-success-ink">{100 - keep > 12 ? t("يُحافظ عليه") : null}</span>
            </div>
            <div className="relative h-4 text-[11px] font-semibold tabular-nums text-muted">
              <span className="absolute start-0">0</span>
              <span className="absolute -translate-x-1/2" style={{ left: `${Math.min(watch, 100)}%` }}>{formatCount(watch)}</span>
              <span className="absolute -translate-x-1/2" style={{ left: `${Math.min(keep, 100)}%` }}>{formatCount(keep)}</span>
              <span className="absolute end-0">100</span>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid content-start gap-1.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-heading"><span className="size-2.5 rounded-full bg-success" />{t("يُحافظ عليه من")}</span>
              <Stepper label={t("يُحافظ عليه من")} value={d.band_keep} onChange={(v) => draft.set("band_keep", v)} min={0} max={100} step={5} invalid={!!errors.band_keep} />
            </div>
            <div className="grid content-start gap-1.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-heading"><span className="size-2.5 rounded-full bg-warning" />{t("يحتاج متابعة من")}</span>
              <Stepper label={t("يحتاج متابعة من")} value={d.band_watch} onChange={(v) => draft.set("band_watch", v)} min={0} max={100} step={5} invalid={!!errors.band_watch} />
            </div>
          </div>
          <Link href="/admin/driver-scores" className="w-fit text-[13px] font-semibold text-accent underline-offset-4 hover:underline">
            {t("عرض نتائج السائقين")}
          </Link>
        </div>
      </SettingLine>
    </SettingsSection>
  );
}

// ------------------------------------------------------------------ general

const ZONES = [
  ["Asia/Damascus", "دمشق"],
  ["Asia/Beirut", "بيروت"],
  ["Asia/Amman", "عمّان"],
  ["Asia/Baghdad", "بغداد"],
  ["Europe/Istanbul", "إسطنبول"],
  ["Asia/Riyadh", "الرياض"],
  ["Asia/Dubai", "دبي"],
  ["UTC", "UTC"],
] as const;

function GeneralSection({ config }: { config: Row }) {
  const draft = useDraft({
    timezone: text(config.timezone) || "Asia/Damascus",
    min_counted_distance_m: asNumber(config.min_counted_distance_m),
    daily_total_cap: asNumber(config.daily_total_cap),
  });
  const saver = useConfigSaver();
  const d = draft.draft;
  const errors = {
    min_counted_distance_m: need(d.min_counted_distance_m, 0, 100_000),
    daily_total_cap: d.daily_total_cap != null && d.daily_total_cap < 0 ? t("أدخل مبلغاً صحيحاً") : null,
  };
  const zones = ZONES.some(([zone]) => zone === d.timezone) ? ZONES : [...ZONES, [d.timezone, d.timezone] as const];
  return (
    <SettingsSection
      id="general"
      icon={SlidersHorizontal}
      title={t("قواعد عامة لكل المكافآت")}
      description={t("تنطبق على كل أنواع المكافآت في هذه الصفحة.")}
      summary={
        <Summary>
          <p>{t("الرحلات الأقصر من")} {strong(distanceText(d.min_counted_distance_m ?? 0))} {t("لا تُحسب في أي مكافأة.")}</p>
          <p>{d.daily_total_cap != null ? <>{t("أعلى مجموع تدفعه الشركة لكل السائقين في اليوم")} {strong(formatMoney(d.daily_total_cap))}.</> : t("لا يوجد سقف يومي لمجموع المكافآت.")}</p>
        </Summary>
      }
      save={saveProps(draft, saver, errors)}
    >
      <SettingLine label={t("أقصر رحلة تُحسب")} help={t("حتى لا يستفيد أحد من رحلات وهمية قصيرة.")} error={errors.min_counted_distance_m}>
        <UnitStepper label={t("أقصر رحلة تُحسب")} value={d.min_counted_distance_m} onChange={(v) => draft.set("min_counted_distance_m", v)} units={DISTANCE_UNITS} min={0} max={100_000} invalid={!!errors.min_counted_distance_m} />
      </SettingLine>
      <SettingLine label={t("سقف يومي لكل المكافآت")} help={t("بعد الوصول له لا تُصرف مكافآت جديدة حتى اليوم التالي.")} error={errors.daily_total_cap}>
        <OptionalStepper
          label={t("سقف يومي لكل المكافآت")}
          value={d.daily_total_cap}
          onChange={(v) => draft.set("daily_total_cap", v)}
          offLabel={t("بدون سقف")}
          onLabel={t("حدد سقفاً")}
          defaultOn={1_000_000}
          min={0}
          step={50_000}
          unit={t("ل.س")}
        />
      </SettingLine>
      <SettingLine label={t("المنطقة الزمنية")} help={t("تحدد متى يبدأ اليوم ومتى تبدأ الحملات.")}>
        <ChoiceSelect value={d.timezone} onValueChange={(v) => draft.set("timezone", v)} options={zones.map(([zone, label]) => ({ value: zone, label: zone === label ? label : `${t(label)} (${zone})` }))} />
      </SettingLine>
    </SettingsSection>
  );
}

// ------------------------------------------------------------------ runs

function runLabel(row: Row) {
  const stats = row.stats && typeof row.stats === "object" ? (row.stats as Row) : {};
  if (row.kind === "STREAK_DAILY") return `${t("الرحلات المتتالية")} · ${text(row.period_key)}`;
  return `${text(stats.name) || t("حملة")} · ${text(row.period_key).split(":")[1] ?? ""}`;
}

function RunsSection() {
  const call = useGo();
  const runs = useGoList("/admin/incentives/runs", { limit: 10 });
  const [busy, setBusy] = useState(false);
  const rows = runs.data ?? [];
  return (
    <SettingsSection
      id="runs"
      icon={History}
      title={t("سجل الصرف التلقائي")}
      description={t("النظام يصرف الجوائز تلقائياً كل دقيقة. لا تحتاج لفعل شيء هنا عادةً.")}
      extra={
        <div className="grid gap-3 pt-4">
          <StateView bare loading={runs.isLoading} error={runs.error}>
            {rows.length === 0 ? (
              <p className="rounded-xl bg-heading/[0.03] px-4 py-3 text-sm text-muted">{t("لم يُصرف شيء بعد.")}</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {rows.map((row) => {
                  const stats = row.stats && typeof row.stats === "object" ? (row.stats as Row) : {};
                  const granted = asNumber(stats.GRANTED) ?? 0;
                  return (
                    <li key={text(row.id)} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <span className="font-medium text-heading">{runLabel(row)}</span>
                      <span className="flex items-center gap-3 text-xs text-muted">
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${row.settled_at ? "bg-success/12 text-success-ink" : "bg-warning/15 text-warning-ink"}`}>
                          {row.settled_at
                            ? granted > 0
                              ? `${t("صُرفت")}: ${countText(granted, "driver")}`
                              : t("لم يحقق أحد الهدف")
                            : row.notified_at
                              ? t("بدأت")
                              : t("بانتظار النهاية")}
                        </span>
                        {formatScalar("created_at", row.settled_at ?? row.created_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </StateView>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">{t("التشغيل اليدوي يصرف ما انتهى ولم يُصرف بعد، ولا يكرر أي جائزة.")}</p>
            <button
              className={btnGhost}
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await call("/admin/incentives/run", { method: "POST", body: { job: "TICK" } });
                setBusy(false);
              }}
            >
              {t("تشغيل الآن")}
            </button>
          </div>
        </div>
      }
    />
  );
}

// ------------------------------------------------------------------ page

function streakLine(config: Row) {
  return `${countText(asNumber(config.streak_rides) ?? 0, "ride")} ← ${formatMoney(asNumber(config.streak_amount) ?? 0)}`;
}

export function IncentivesScreen() {
  const config = useGoRecord(CONFIG);
  const campaigns = useGoList("/admin/incentives/campaigns");
  const c = config.data;
  const activeCampaigns = (campaigns.data ?? []).filter((row) => row.is_active !== false).length;
  const tiles: { id: string; icon: IconNode; title: string; on: boolean; value: string }[] = c
    ? [
        { id: "streak", icon: Repeat2, title: t("الرحلات المتتالية"), on: c.streak_enabled === true, value: streakLine(c) },
        { id: "goals", icon: Target, title: t("حملات الأهداف"), on: activeCampaigns > 0, value: activeCampaigns ? `${t("حملات فعّالة")}: ${formatCount(activeCampaigns)}` : t("لا توجد حملة فعّالة") },
        { id: "rejection", icon: UserX, title: t("الطلب المرفوض"), on: c.rejection_enabled === true, value: `${formatCount(asNumber(c.rejection_pct) ?? 0)}% ${t("بعد رفض")} ${countText(asNumber(c.rejection_min_drivers) ?? 0, "driver")}` },
        { id: "distance", icon: MapPinned, title: t("الطلب البعيد"), on: c.distance_enabled === true, value: `${formatCount(asNumber(c.distance_pct) ?? 0)}% ${t("بعد")} ${countText(asNumber(c.distance_min_km) ?? 0, "km")}` },
      ]
    : [];
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <h1 className="text-[26px] font-semibold tracking-tight text-heading">{t("حوافز السائقين")}</h1>
          <p className="max-w-2xl text-sm leading-7 text-muted">
            {t("مكافآت تدفعها الشركة إلى محفظة السائق لتشجيعه. سعر الزبون لا يتغير، وكل مكافأة تُصرف مرة واحدة فقط. غيّر ما تريد ثم اضغط «حفظ التغييرات» أسفل القسم.")}
          </p>
        </div>
        <Link href="/erp/finance/incentives" className={btnGhost}>
          {t("المكافآت المصروفة")}
          <Icon node={ChevronLeft} size={16} className="ltr:rotate-180" />
        </Link>
      </header>
      <StateView loading={config.isLoading} error={config.error}>
        {c ? (
          <div className="grid gap-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {tiles.map((tile) => <OverviewTile key={tile.id} {...tile} />)}
            </div>
            <SectionNav
              items={[
                { id: "streak", label: t("الرحلات المتتالية"), icon: Repeat2, on: c.streak_enabled === true },
                { id: "goals", label: t("حملات الأهداف"), icon: Target, on: activeCampaigns > 0 },
                { id: "rejection", label: t("الطلب المرفوض"), icon: UserX, on: c.rejection_enabled === true },
                { id: "distance", label: t("الطلب البعيد"), icon: MapPinned, on: c.distance_enabled === true },
                { id: "scores", label: t("تقييم السائقين"), icon: Trophy },
                { id: "general", label: t("قواعد عامة"), icon: SlidersHorizontal },
                { id: "runs", label: t("سجل الصرف"), icon: History },
              ]}
            />
            <StreakSection config={c} />
            <CampaignsSection />
            <RejectionSection config={c} />
            <DistanceSection config={c} />
            <ScoreSection config={c} />
            <GeneralSection config={c} />
            <RunsSection />
          </div>
        ) : null}
      </StateView>
    </div>
  );
}
