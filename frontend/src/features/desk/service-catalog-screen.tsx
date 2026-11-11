"use client";

import { localeTag, t } from "@/features/desk/i18n/t";
import { CalendarDays, Pencil, Plus, Tag, Trash2 } from "lucide";
import { useMemo, useState } from "react";

import { useConfirm } from "@/features/desk/confirm";
import { DateField, FormDialog } from "@/features/desk/controls";
import { useGo, useGoList } from "@/features/desk/hooks";
import {
  btnDark,
  btnGhostSm,
  btnPrimarySm,
  DeskForm,
  Field,
  FormCard,
  inputClass,
  PageTitle,
  Panel,
  StateView,
  StatusBadge,
} from "@/features/desk/ui";
import { Icon } from "@/shared/ui/icon";

type ServiceRow = {
  code: string;
  name_ar: string;
  name_en: string | null;
  image_url: string | null;
  is_available: boolean;
  is_visible: boolean;
  sort_order: number;
  promotion_label_ar: string | null;
  promotion_percentage: number | null;
  promotion_expires_at: string | null;
  active_discount_codes: number;
  updated_at: string;
};

function asService(row: Record<string, unknown>): ServiceRow | null {
  if (typeof row.code !== "string" || typeof row.name_ar !== "string") return null;
  const pct = row.promotion_percentage;
  return {
    code: row.code,
    name_ar: row.name_ar,
    name_en: typeof row.name_en === "string" ? row.name_en : null,
    image_url: typeof row.image_url === "string" ? row.image_url : null,
    is_available: row.is_available === true,
    is_visible: row.is_visible !== false,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
    promotion_label_ar: typeof row.promotion_label_ar === "string" ? row.promotion_label_ar : null,
    promotion_percentage: typeof pct === "number" ? pct : pct == null ? null : Number(pct) || null,
    promotion_expires_at: typeof row.promotion_expires_at === "string" ? row.promotion_expires_at : null,
    active_discount_codes: typeof row.active_discount_codes === "number" ? row.active_discount_codes : 0,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : "",
  };
}

function imageSrc(url: string | null) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/api/")) return `/api/proxy${url}`;
  return url;
}

function whenLabel(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(localeTag(), { dateStyle: "medium" }).format(date);
}

function promotionActive(service: ServiceRow, now = new Date()) {
  if (!service.promotion_label_ar) return false;
  if (!service.promotion_expires_at) return true;
  return new Date(service.promotion_expires_at) > now;
}

function BadgePreview({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-[#e11d48] px-1.5 py-0.5 text-[11px] font-bold leading-none text-white shadow-sm">
      <Icon node={Tag} size={10} className="opacity-90" />
      {label}
    </span>
  );
}

function ServiceImage({ service }: { service: ServiceRow }) {
  const src = imageSrc(service.image_url);
  return (
    <div className="relative grid size-14 place-items-center overflow-visible rounded-full bg-heading/[0.06] ring-1 ring-inset ring-line">
      {src ? (
        <img src={src} alt="" className="size-14 rounded-full object-cover" />
      ) : (
        <span className="text-sm font-semibold text-muted">{service.name_ar.slice(0, 1)}</span>
      )}
      {promotionActive(service) && service.promotion_label_ar ? (
        <span className="absolute -end-1 -top-1">
          <BadgePreview label={service.promotion_label_ar} />
        </span>
      ) : null}
    </div>
  );
}

function PromotionForm({ service }: { service: ServiceRow }) {
  const call = useGo();
  const [issue, setIssue] = useState<string | null>(null);
  const defaultPct = service.promotion_percentage != null ? String(service.promotion_percentage) : "";
  const defaultLabel = service.promotion_label_ar ?? (defaultPct ? `${defaultPct}%` : "");
  return (
    <DeskForm
      className="grid gap-5"
      action={async (form) => {
        const rawPct = String(form.get("promotion_percentage") || "").trim().replace("%", "");
        const pct = rawPct ? Number(rawPct) : NaN;
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
          setIssue(t("أدخل نسبة خصم بين 0.01 و 100."));
          return { ok: false as const };
        }
        let label = String(form.get("promotion_label_ar") || "").trim();
        if (!label) label = `${pct}%`;
        if (label.length > 40) {
          setIssue(t("نص الشارة يجب ألا يتجاوز 40 حرفاً."));
          return { ok: false as const };
        }
        const until = String(form.get("promotion_expires_at") || "").trim();
        setIssue(null);
        return call(`/admin/services/${service.code}`, {
          method: "PATCH",
          body: {
            promotion_label_ar: label,
            promotion_percentage: pct,
            promotion_expires_at: until ? new Date(until).toISOString() : null,
          },
        });
      }}
    >
      <FormCard
        title={t("شارة الترويج")}
        hint={t("الزبون يدفع أقل. فرق الخصم يُضاف تلقائياً لمحفظة السائق على حساب الشركة.")}
      >
        <div className="grid gap-4">
          <div className="rounded-xl border border-line bg-heading/[0.03] px-4 py-3 text-sm text-body">
            <span className="font-semibold text-heading">{service.name_ar}</span>
            <span className="ms-2 font-mono text-xs text-muted">{service.code}</span>
          </div>
          <div className="grid content-start gap-1">
            <Field label={t("نسبة الخصم على أجرة الزبون")}>
              <input
                className={inputClass}
                name="promotion_percentage"
                inputMode="decimal"
                placeholder="15"
                defaultValue={defaultPct}
                autoFocus
              />
            </Field>
            {issue ? <p className="text-xs font-medium text-danger-ink">{issue}</p> : null}
          </div>
          <Field label={t("نص الشارة (اختياري)")}>
            <input
              className={inputClass}
              name="promotion_label_ar"
              maxLength={40}
              placeholder="15%"
              defaultValue={defaultLabel}
            />
          </Field>
          <DateField
            name="promotion_expires_at"
            label={t("ينتهي (اختياري)")}
            defaultValue={service.promotion_expires_at ?? ""}
          />
          <div className="flex justify-end">
            <button className={btnDark} type="submit">
              {t("حفظ الشارة")}
            </button>
          </div>
        </div>
      </FormCard>
    </DeskForm>
  );
}

function ServiceCard({
  service,
  onEdit,
}: {
  service: ServiceRow;
  onEdit: () => void;
}) {
  const call = useGo();
  const confirm = useConfirm();
  const active = promotionActive(service);
  const expired =
    !!service.promotion_label_ar &&
    !!service.promotion_expires_at &&
    !active;

  return (
    <Panel className="grid gap-4">
      <div className="flex items-start gap-3">
        <ServiceImage service={service} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-heading">{service.name_ar}</h3>
            <span className="rounded-md bg-heading/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-muted">
              {service.code}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusBadge
              value={service.is_visible ? "ACTIVE" : "INACTIVE"}
              label={service.is_visible ? t("ظاهرة") : t("مخفية")}
            />
            <StatusBadge
              value={service.is_available ? "AVAILABLE" : "PENDING"}
              label={service.is_available ? t("متاحة") : t("قريباً")}
            />
            {service.active_discount_codes > 0 ? (
              <StatusBadge
                value="ACTIVE"
                label={`${t("أكواد خصم")}: ${service.active_discount_codes}`}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-line bg-heading/[0.02] px-3 py-3">
        {active && service.promotion_label_ar ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <p className="text-[11px] font-medium text-muted">{t("الشارة الحالية")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <BadgePreview label={service.promotion_label_ar} />
                {service.promotion_percentage != null ? (
                  <span className="text-xs font-semibold text-heading">
                    −{service.promotion_percentage}% {t("زبون أقل · تعويض لمحفظة السائق من الشركة")}
                  </span>
                ) : (
                  <span className="text-xs text-muted">{t("شارة فقط — بلا خصم")}</span>
                )}
                {service.promotion_expires_at ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted">
                    <Icon node={CalendarDays} size={12} />
                    {t("حتى")} {whenLabel(service.promotion_expires_at)}
                  </span>
                ) : (
                  <span className="text-xs text-muted">{t("بدون تاريخ انتهاء")}</span>
                )}
              </div>
            </div>
          </div>
        ) : expired ? (
          <p className="text-sm text-muted">
            {t("شارة منتهية")}: <span className="font-semibold text-heading">{service.promotion_label_ar}</span>
            {service.promotion_expires_at ? ` · ${whenLabel(service.promotion_expires_at)}` : ""}
          </p>
        ) : (
          <p className="text-sm text-muted">{t("لا شارة ترويج على هذه الخدمة.")}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={active || expired ? btnGhostSm : btnPrimarySm} type="button" onClick={onEdit}>
          <Icon node={active || expired ? Pencil : Plus} size={14} />
          {active || expired ? t("تعديل الشارة") : t("إضافة شارة")}
        </button>
        {service.promotion_label_ar ? (
          <button
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3 text-xs font-semibold text-danger-ink transition-colors hover:bg-danger/15"
            type="button"
            onClick={() =>
              void confirm({
                title: t("حذف الشارة"),
                body: `${service.name_ar} · ${service.promotion_label_ar}. ${t("ستُزال الشارة الحمراء من تطبيق العميل فوراً.")}`,
                confirm: t("حذف"),
                danger: true,
                perform: () =>
                  call(`/admin/services/${service.code}`, {
                    method: "PATCH",
                    body: {
                      promotion_label_ar: null,
                      promotion_percentage: null,
                      promotion_expires_at: null,
                    },
                  }),
              })
            }
          >
            <Icon node={Trash2} size={14} />
            {t("حذف الشارة")}
          </button>
        ) : null}
      </div>
    </Panel>
  );
}

export function ServicesScreen() {
  const list = useGoList("/admin/services");
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const services = useMemo(
    () => (list.data ?? []).map(asService).filter((row): row is ServiceRow => !!row),
    [list.data],
  );

  return (
    <div className="grid gap-4">
      <PageTitle
        title={t("شارات الخدمات")}
        hint={t("التحكم بالشارة الحمراء فوق أيقونات خدماتنا في الرئيسية (مثل 15% على يومي).")}
      />
      <StateView loading={list.isLoading} error={list.error}>
        {services.length === 0 ? (
          <Panel className="p-6 text-sm text-muted">{t("لا توجد خدمات.")}</Panel>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {services.map((service) => (
              <ServiceCard key={service.code} service={service} onEdit={() => setEditing(service)} />
            ))}
          </div>
        )}
      </StateView>
      <FormDialog
        open={!!editing}
        title={editing?.promotion_label_ar ? t("تعديل الشارة") : t("إضافة شارة")}
        onClose={() => setEditing(null)}
        narrow
      >
        {editing ? <PromotionForm key={editing.code + editing.updated_at} service={editing} /> : null}
      </FormDialog>
    </div>
  );
}
