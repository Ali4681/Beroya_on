"use client";

import { Headphones, Mail, MessageCircle } from "lucide";
import { useState, type ReactNode } from "react";

import { isGoFailure, useGo, useGoRecord } from "@/features/desk/hooks";
import { t } from "@/features/desk/i18n/t";
import {
  SettingLine,
  SettingsSection,
  Summary,
  useDraft,
  useSectionSave,
} from "@/features/desk/settings-kit";
import { btnGhost, btnPrimary, inputClass, PageTitle, StateView } from "@/features/desk/ui";
import { Icon } from "@/shared/ui/icon";

type Row = Record<string, unknown>;
type AppIdentity = "customer" | "driver";

const PATH = "/admin/config/app-info";
const SYRIA_PREFIX = "+963";

const APP_TABS: { id: AppIdentity; label: string }[] = [
  { id: "customer", label: "تطبيق الزبون" },
  { id: "driver", label: "تطبيق السائق" },
];

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}

/** Local Syrian mobile digits after +963 (9xxxxxxxx). */
function syriaLocalDigits(value: string) {
  let digits = value
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/\D/g, "");
  if (digits.startsWith("963")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 9);
}

function toE164(local: string) {
  const digits = syriaLocalDigits(local);
  return digits ? `${SYRIA_PREFIX}${digits}` : "";
}

function fromStored(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed) || /wa\.me/i.test(trimmed)) {
    const match = trimmed.match(/(\d{8,15})/);
    return match ? syriaLocalDigits(match[1]) : "";
  }
  return syriaLocalDigits(trimmed);
}

function SyriaPhoneField({
  label,
  value,
  onChange,
  icon,
}: {
  label: string;
  value: string;
  onChange: (local: string) => void;
  icon: typeof Headphones;
}) {
  const local = fromStored(value);
  return (
    <label className="grid gap-1.5">
      <span className="sr-only">{label}</span>
      <div
        dir="ltr"
        className="flex overflow-hidden rounded-xl border border-line-strong bg-surface focus-within:border-teal/55 focus-within:ring-4 focus-within:ring-brand/15"
      >
        <span className="inline-flex items-center gap-1.5 border-e border-line bg-heading/[0.04] px-3 text-sm font-semibold tabular-nums text-heading">
          <Icon node={icon} size={14} className="text-muted" />
          {SYRIA_PREFIX}
        </span>
        <input
          className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-sm font-semibold tabular-nums text-heading outline-none placeholder:font-normal placeholder:text-muted"
          inputMode="tel"
          autoComplete="tel"
          placeholder="9xxxxxxxx"
          value={local}
          onChange={(event) => onChange(syriaLocalDigits(event.target.value))}
        />
      </div>
    </label>
  );
}

function Loaded({ app, children }: { app: AppIdentity; children: (data: Row) => ReactNode }) {
  const record = useGoRecord(PATH, true, { app });
  return (
    <StateView loading={record.isLoading} error={record.error}>
      {record.data ? children(record.data) : null}
    </StateView>
  );
}

function SupportSection({ app, data }: { app: AppIdentity; data: Row }) {
  const call = useGo();
  const draft = useDraft({
    support_phone: asText(data.support_phone),
    support_whatsapp: asText(data.support_whatsapp),
    support_email: asText(data.support_email),
    min_supported_version: asText(data.min_supported_version) || "1.0.0",
    latest_version: asText(data.latest_version) || "1.0.0",
    about_ar: asText(data.about_ar),
  });
  const saver = useSectionSave(async (changes) => {
    const body = Object.fromEntries(
      Object.entries(changes).map(([key, value]) => {
        if (key === "support_phone" || key === "support_whatsapp") {
          const e164 = typeof value === "string" ? toE164(value) : "";
          return [key, e164 || null];
        }
        if (typeof value === "string") return [key, value.trim() || null];
        return [key, value];
      }),
    );
    const saved = await call(PATH, { method: "PATCH", body, idempotent: true, query: { app } });
    if (isGoFailure(saved)) throw new Error("save failed");
  });
  const d = draft.draft;
  const emailError =
    d.support_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.support_email.trim())
      ? t("أدخل بريداً صالحاً")
      : null;
  const displayPhone = toE164(d.support_phone) || t("غير محدد");
  const appLabel = app === "customer" ? t("تطبيق الزبون") : t("تطبيق السائق");

  return (
    <SettingsSection
      id={`support-${app}`}
      icon={Headphones}
      title={`${t("رقم الدعم والتواصل")} · ${appLabel}`}
      description={t("أرقام وروابط هذا التطبيق فقط — لا تُشارك مع التطبيق الآخر.")}
      summary={
        <Summary>
          <p>
            {t("رقم الدعم الحالي")}:{" "}
            <b className="desk-ltr-num font-semibold text-accent" dir="ltr">
              {displayPhone}
            </b>
          </p>
        </Summary>
      }
      save={{
        dirty: draft.dirty,
        saving: saver.saving,
        blocked: !!emailError,
        onReset: draft.reset,
        onSave: () => void saver.run(draft.changes).catch(() => undefined),
      }}
    >
      <SettingLine label={t("رقم الدعم")} help={t("رمز الدولة +963 ثابت. أدخل رقم الجوال المحلي مثل 9xxxxxxxx.")}>
        <SyriaPhoneField
          label={t("رقم الدعم")}
          icon={Headphones}
          value={d.support_phone}
          onChange={(local) => draft.set("support_phone", toE164(local))}
        />
      </SettingLine>

      <SettingLine label={t("واتساب الدعم")} help={t("رمز الدولة +963 ثابت. أدخل رقم واتساب المحلي.")}>
        <SyriaPhoneField
          label={t("واتساب الدعم")}
          icon={MessageCircle}
          value={d.support_whatsapp}
          onChange={(local) => draft.set("support_whatsapp", toE164(local))}
        />
      </SettingLine>

      <SettingLine label={t("بريد الدعم")} help={t("يظهر في معلومات التطبيق العامة.")} error={emailError}>
        <label className="grid gap-1.5">
          <span className="sr-only">{t("بريد الدعم")}</span>
          <span className="relative">
            <span className="pointer-events-none absolute inset-y-0 start-3.5 grid place-items-center text-muted">
              <Icon node={Mail} size={15} />
            </span>
            <input
              className={`${inputClass} pe-3.5 ps-10 ${emailError ? "ring-danger/50" : ""}`}
              dir="ltr"
              type="email"
              autoComplete="email"
              placeholder="support@beroyaon.com"
              value={d.support_email}
              onChange={(event) => draft.set("support_email", event.target.value)}
            />
          </span>
        </label>
      </SettingLine>

      <SettingLine label={t("أدنى إصدار مدعوم")} help={t("التطبيقات الأقدم تُجبر على التحديث.")}>
        <input
          className={inputClass}
          dir="ltr"
          value={d.min_supported_version}
          onChange={(event) => draft.set("min_supported_version", event.target.value)}
          placeholder="1.0.0"
        />
      </SettingLine>

      <SettingLine label={t("أحدث إصدار")} help={t("يُعرض كتحديث متاح في المتجر.")}>
        <input
          className={inputClass}
          dir="ltr"
          value={d.latest_version}
          onChange={(event) => draft.set("latest_version", event.target.value)}
          placeholder="1.2.0"
        />
      </SettingLine>

      <SettingLine label={t("نبذة عربية")} help={t("نص «عن التطبيق» داخل نفس الهوية.")}>
        <textarea
          className={`${inputClass} min-h-24`}
          value={d.about_ar}
          onChange={(event) => draft.set("about_ar", event.target.value)}
        />
      </SettingLine>
    </SettingsSection>
  );
}

export function AppInfoSettings() {
  const [app, setApp] = useState<AppIdentity>("customer");
  return (
    <div className="grid gap-5">
      <PageTitle
        title={t("الدعم والتواصل")}
        hint={t("إعدادات منفصلة لتطبيق الزبون وتطبيق السائق (أرقام، إصدارات، نبذة).")}
      />
      <div className="flex flex-wrap gap-2">
        {APP_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={app === tab.id ? btnPrimary : btnGhost}
            onClick={() => setApp(tab.id)}
          >
            {t(tab.label)}
          </button>
        ))}
      </div>
      <Loaded key={app} app={app}>
        {(data) => <SupportSection app={app} data={data} />}
      </Loaded>
    </div>
  );
}
