"use client";

import { Check, Flame, Gift, Pencil, Plus, Trash2 } from "lucide";
import { useState } from "react";

import { useConfirm } from "@/features/desk/confirm";
import { FormDialog } from "@/features/desk/controls";
import { isGoFailure, useGo, useGoList, useGoRecord } from "@/features/desk/hooks";
import { listJoin, t } from "@/features/desk/i18n/t";
import {
  asNumber,
  Choice,
  countText,
  durationText,
  formatCount,
  SettingsSection,
  Stepper,
  Summary,
  Switch,
  unitWord,
  useDraft,
  useSectionSave,
} from "@/features/desk/settings-kit";
import { btnGhost, btnGhostSm, btnPrimary, StateView } from "@/features/desk/ui";
import { Icon } from "@/shared/ui/icon";

type Row = Record<string, unknown>;
type RewardType = "SCORE" | "DISCOUNT_CODE" | "SCORE_AND_DISCOUNT";

const STREAK = "/admin/passport/streak-config";
const REWARDS = "/admin/passport/milestone-rewards";

function strong(value: string) {
  return <b className="font-semibold text-accent">{value}</b>;
}

function typeOf(row: Row | null | undefined): RewardType {
  const value = row?.reward_type;
  return value === "DISCOUNT_CODE" || value === "SCORE_AND_DISCOUNT" ? value : "SCORE";
}

function hasScore(type: RewardType) {
  return type === "SCORE" || type === "SCORE_AND_DISCOUNT";
}

function hasDiscount(type: RewardType) {
  return type === "DISCOUNT_CODE" || type === "SCORE_AND_DISCOUNT";
}

const MAX_VALID_HOURS = 365 * 24;
const VALIDITY_PRESETS = [12, 24, 72, 168, 720];

function rewardText(type: RewardType, points: number | null, discount: number | null, hours: number) {
  const parts: string[] = [];
  if (hasScore(type)) parts.push(countText(points ?? 0, "point"));
  if (hasDiscount(type)) parts.push(`${t("كود خصم")} ${formatCount(discount ?? 0)}% (${t("صالح")} ${durationText(hours * 3600)})`);
  return parts.join(" + ");
}

function rowReward(row: Row) {
  return rewardText(typeOf(row), asNumber(row.score_bonus), asNumber(row.discount_percentage), asNumber(row.discount_valid_hours) ?? 720);
}

function ridesOf(row: Row) {
  return asNumber(row.milestone_multiple) ?? 0;
}

function approvalText(needs: boolean) {
  return needs ? t("تُصرف بعد موافقتك") : t("تُصرف تلقائياً");
}

function atText(rides: number) {
  return `${t("عند إكمال")} ${countText(rides, "ride")} ${t("متتالية")}`;
}

// ------------------------------------------------------------------ on / off

function SwitchSection({ data }: { data: Row }) {
  const call = useGo();
  const draft = useDraft({ is_active: data.is_active === true });
  const saver = useSectionSave(async (changes) => {
    const saved = await call(STREAK, { method: "PATCH", body: changes });
    if (isGoFailure(saved)) throw new Error("save failed");
  });
  const on = draft.draft.is_active;
  return (
    <SettingsSection
      id="streak-switch"
      icon={Flame}
      title={t("مكافآت الرحلات المتتالية")}
      description={t("العميل يجمع رحلات مكتملة متتالية. أنت تحدد عند أي عدد يحصل على مكافأة، وما هي المكافأة.")}
      enabled={on}
      onToggle={(v) => draft.set("is_active", v)}
      summary={
        <Summary off={!on}>
          {on ? (
            <>
              <p>{t("يحصل العميل على مكافأة فقط عند الأعداد التي تضيفها في الجدول أدناه، ولا يتكرر شيء تلقائياً.")}</p>
              <p className="text-muted">{t("إذا ألغى العميل متأخراً أو لم يحضر للسائق يعود العدّ إلى الصفر.")}</p>
            </>
          ) : (
            <p>{t("المكافأة متوقفة: لن يحصل العملاء على مكافآت جديدة.")}</p>
          )}
        </Summary>
      }
      save={{
        dirty: draft.dirty,
        saving: saver.saving,
        blocked: false,
        onSave: () => void saver.run(draft.changes),
        onReset: draft.reset,
      }}
    />
  );
}

// ------------------------------------------------------------------ editor

function RewardEditor({ reward, taken, suggested, onDone }: { reward: Row | null; taken: number[]; suggested: number; onDone: () => void }) {
  const call = useGo();
  const [rides, setRides] = useState<number | null>(reward ? ridesOf(reward) : suggested);
  const [type, setType] = useState<RewardType>(typeOf(reward));
  const [points, setPoints] = useState<number | null>(asNumber(reward?.score_bonus) ?? 10);
  const [discount, setDiscount] = useState<number | null>(asNumber(reward?.discount_percentage) ?? 10);
  const savedHours = asNumber(reward?.discount_valid_hours) ?? 720;
  const [days, setDays] = useState<number | null>(Math.floor(savedHours / 24));
  const [hours, setHours] = useState<number | null>(savedHours % 24);
  const validHours = (days ?? 0) * 24 + (hours ?? 0);
  const [approval, setApproval] = useState(reward ? reward.requires_admin_approval !== false : true);
  const [active, setActive] = useState(reward ? reward.is_active !== false : true);
  const [saving, setSaving] = useState(false);

  const own = reward ? ridesOf(reward) : -1;
  const errors = {
    rides:
      rides == null || rides < 1
        ? t("أدخل عدد الرحلات (1 على الأقل)")
        : taken.includes(rides) && rides !== own
          ? t("توجد مكافأة لهذا العدد. عدّلها بدلاً من إضافة واحدة جديدة.")
          : null,
    points: hasScore(type) && !(points != null && points >= 1) ? t("أدخل عدد النقاط (1 على الأقل)") : null,
    discount: hasDiscount(type) && !(discount != null && discount > 0 && discount <= 100) ? t("نسبة الخصم بين 1 و100") : null,
    validity: !hasDiscount(type)
      ? null
      : !Number.isInteger(validHours) || validHours < 1
        ? t("حدد مدة صلاحية ساعة واحدة على الأقل")
        : validHours > MAX_VALID_HOURS
          ? t("أقصى مدة صلاحية 365 يوماً")
          : null,
  };
  const blocked = Object.values(errors).some(Boolean);

  async function save() {
    if (blocked) return;
    setSaving(true);
    const body = {
      milestone_multiple: rides,
      reward_type: type,
      score_bonus: hasScore(type) ? points : null,
      discount_percentage: hasDiscount(type) ? discount : null,
      ...(hasDiscount(type) ? { discount_valid_hours: validHours } : {}),
      requires_admin_approval: approval,
      is_active: active,
    };
    const saved = reward ? await call(`${REWARDS}/${String(reward.id)}`, { method: "PATCH", body }) : await call(REWARDS, { method: "POST", body });
    setSaving(false);
    if (!isGoFailure(saved)) onDone();
  }

  return (
    <div className="grid gap-5">
      <Summary title={t("المكافأة باختصار")} off={!active}>
        <p>
          {strong(atText(rides ?? 0))} {t("يحصل العميل على")} {strong(rewardText(type, points, discount, validHours))}، {strong(approvalText(approval))}.
        </p>
        {!active ? <p className="text-muted">{t("المكافأة متوقفة الآن ولن تُعطى حتى تفعّلها.")}</p> : null}
      </Summary>

      <div className="grid content-start gap-1.5">
        <span className="text-sm font-semibold text-heading">{t("عند إكمال كم رحلة متتالية؟")}</span>
        <Stepper label={t("عدد الرحلات")} value={rides} onChange={setRides} min={1} max={10000} unit={unitWord(rides ?? 0, "ride")} invalid={!!errors.rides} />
        {errors.rides ? <span className="text-xs text-danger-ink">{errors.rides}</span> : null}
      </div>

      <div className="grid content-start gap-1.5">
        <span className="text-sm font-semibold text-heading">{t("ماذا يحصل العميل؟")}</span>
        <Choice<RewardType>
          value={type}
          onChange={setType}
          options={[
            { value: "SCORE", label: t("نقاط فقط"), hint: t("تُضاف لنقاط العميل في الجواز وتساعده على الوصول لمستوى أعلى.") },
            { value: "DISCOUNT_CODE", label: t("كود خصم فقط"), hint: t("يصل العميل كود خصم يستخدمه في رحلة قادمة.") },
            { value: "SCORE_AND_DISCOUNT", label: t("نقاط + كود خصم"), hint: t("يحصل على الاثنين معاً.") },
          ]}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {hasScore(type) ? (
          <div className="grid content-start gap-1.5">
            <span className="text-sm font-semibold text-heading">{t("عدد النقاط")}</span>
            <Stepper label={t("عدد النقاط")} value={points} onChange={setPoints} min={1} max={100000} unit={unitWord(points ?? 0, "point")} invalid={!!errors.points} />
            {errors.points ? <span className="text-xs text-danger-ink">{errors.points}</span> : null}
          </div>
        ) : null}
        {hasDiscount(type) ? (
          <div className="grid content-start gap-1.5">
            <span className="text-sm font-semibold text-heading">{t("نسبة الخصم")}</span>
            <Stepper label={t("نسبة الخصم")} value={discount} onChange={setDiscount} min={1} max={100} unit="%" invalid={!!errors.discount} />
            {errors.discount ? <span className="text-xs text-danger-ink">{errors.discount}</span> : null}
          </div>
        ) : null}
      </div>

      {hasDiscount(type) ? (
        <div className="grid gap-2">
          <span className="text-sm font-semibold text-heading">{t("صلاحية الكود")}</span>
          <div className="flex flex-wrap gap-1.5">
            {VALIDITY_PRESETS.map((preset) => {
              const on = preset === validHours;
              return (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={on}
                  className={`h-8 rounded-lg px-3 text-xs font-semibold ring-1 ring-inset transition-colors ${
                    on ? "bg-brand/12 text-accent ring-brand/35" : "text-body ring-line-strong hover:bg-heading/[0.05] hover:text-heading"
                  }`}
                  onClick={() => {
                    setDays(Math.floor(preset / 24));
                    setHours(preset % 24);
                  }}
                >
                  {durationText(preset * 3600)}
                </button>
              );
            })}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid content-start gap-1">
              <span className="text-xs font-medium text-muted">{t("أيام")}</span>
              <Stepper label={t("أيام")} value={days} onChange={setDays} min={0} max={365} unit={unitWord(days ?? 0, "day")} invalid={!!errors.validity} />
            </div>
            <div className="grid content-start gap-1">
              <span className="text-xs font-medium text-muted">{t("ساعات")}</span>
              <Stepper label={t("ساعات")} value={hours} onChange={setHours} min={0} max={23} unit={unitWord(hours ?? 0, "hour")} invalid={!!errors.validity} />
            </div>
          </div>
          <span className={`text-xs ${errors.validity ? "text-danger-ink" : "text-muted"}`}>
            {errors.validity ?? `${t("الكود صالح لمدة")} ${durationText(validHours * 3600)} ${t("من لحظة وصوله، وبعدها ينتهي إذا لم يُستخدم.")}`}
          </span>
        </div>
      ) : null}

      <div className="grid content-start gap-1.5">
        <span className="text-sm font-semibold text-heading">{t("كيف تُصرف؟")}</span>
        <Choice
          value={approval ? "approve" : "auto"}
          onChange={(next) => setApproval(next === "approve")}
          options={[
            { value: "auto", label: t("تلقائياً"), hint: t("تصل للعميل فور إكماله الرحلة.") },
            { value: "approve", label: t("بعد موافقتي"), hint: t("تظهر في تبويب «المنح» لتوافق عليها أو ترفضها.") },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-semibold text-heading">{t("حالة المكافأة")}</span>
        <Switch checked={active} onChange={setActive} />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {blocked ? <p className="me-auto text-xs font-medium text-muted">{Object.values(errors).find(Boolean)}</p> : null}
        <button className={btnGhost} type="button" onClick={onDone}>{t("إلغاء")}</button>
        <button className={btnPrimary} type="button" onClick={() => void save()} disabled={blocked || saving}>
          <Icon node={Check} size={16} />
          {reward ? t("حفظ المكافأة") : t("إضافة المكافأة")}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ list

function RewardCard({ row, onEdit }: { row: Row; onEdit: () => void }) {
  const call = useGo();
  const confirm = useConfirm();
  const on = row.is_active !== false;
  const rides = ridesOf(row);
  return (
    <article className={`flex flex-wrap items-center gap-4 rounded-xl border p-4 ${on ? "border-line" : "border-dashed border-line-strong bg-heading/[0.02]"}`}>
      <div className={`grid size-14 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${on ? "bg-brand/12 text-accent ring-brand/25" : "bg-heading/[0.05] text-muted ring-line"}`}>
        <span className="text-lg font-bold leading-none tabular-nums">{formatCount(rides)}</span>
        <span className="-mt-2 text-[10px] font-medium">{unitWord(rides, "ride")}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[15px] font-semibold text-heading">{atText(rides)}</p>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${on ? "bg-success/12 text-success-ink" : "bg-heading/[0.06] text-muted"}`}>
            <span className={`size-1.5 rounded-full ${on ? "bg-success" : "bg-line-strong"}`} />
            {on ? t("فعّالة") : t("متوقفة")}
          </span>
        </div>
        <p className="mt-1 text-sm">
          <span className="font-semibold text-accent">{rowReward(row)}</span>
          <span className="text-muted"> · {approvalText(row.requires_admin_approval !== false)}</span>
        </p>
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
              title: t("حذف المكافأة"),
              body: `${atText(rides)} ${t("لن يحصل العميل على أي مكافأة بعد الحذف.")}`,
              confirm: t("حذف"),
              danger: true,
              perform: () => call(`${REWARDS}/${String(row.id)}`, { method: "DELETE" }),
            })
          }
        >
          <Icon node={Trash2} size={13} />
          {t("حذف")}
        </button>
      </div>
    </article>
  );
}

function RewardsSection() {
  const list = useGoList(REWARDS);
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);
  const rows = [...(list.data ?? [])].sort((a, b) => ridesOf(a) - ridesOf(b));
  const active = rows.filter((row) => row.is_active !== false);
  const taken = rows.map(ridesOf);
  const last = taken.length ? Math.max(...taken) : 0;
  const suggested = last ? last + 5 : 5;
  const counts = listJoin(active.map((row) => formatCount(ridesOf(row))));
  const lastActive = active.length ? ridesOf(active[active.length - 1]) : 0;

  return (
    <SettingsSection
      id="streak-rewards"
      icon={Gift}
      title={t("جدول المكافآت")}
      description={t("أضف كل مكافأة على حدة: اختر عدد الرحلات المتتالية وما يحصل عليه العميل عنده.")}
      summary={
        <Summary off={active.length === 0}>
          {active.length ? (
            <>
              <p>
                {t("يحصل العميل على مكافأة فقط عند هذه الأعداد من الرحلات المتتالية:")} {strong(counts)}.
              </p>
              <p className="text-muted">
                {t("بعد")} {countText(lastActive, "ride")} {t("لا توجد مكافآت أخرى إلا إذا أضفت عدداً أكبر.")}
              </p>
            </>
          ) : (
            <p>{t("لا توجد مكافآت بعد. أضف أول مكافأة، مثلاً عند 5 رحلات.")}</p>
          )}
        </Summary>
      }
      extra={
        <div className="grid gap-3 pt-4">
          <StateView bare loading={list.isLoading} error={list.error}>
            {rows.map((row) => <RewardCard key={String(row.id)} row={row} onEdit={() => setEditing(row)} />)}
          </StateView>
          <button
            type="button"
            className="flex h-14 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong text-sm font-semibold text-body transition-colors hover:border-teal/60 hover:bg-brand/[0.05] hover:text-accent"
            onClick={() => setEditing(null)}
          >
            <Icon node={Plus} size={18} />
            {t("أضف مكافأة")}
          </button>
          <FormDialog open={editing !== undefined} title={editing ? t("تعديل المكافأة") : t("مكافأة جديدة")} onClose={() => setEditing(undefined)}>
            {editing !== undefined ? (
              <RewardEditor key={editing ? String(editing.id) : "new"} reward={editing} taken={taken} suggested={suggested} onDone={() => setEditing(undefined)} />
            ) : null}
          </FormDialog>
        </div>
      }
    />
  );
}

export function StreakRewards() {
  const streak = useGoRecord(STREAK);
  return (
    <div className="grid gap-6">
      <StateView loading={streak.isLoading} error={streak.error}>
        {streak.data ? <SwitchSection data={streak.data} /> : null}
      </StateView>
      <RewardsSection />
    </div>
  );
}
