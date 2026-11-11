"use client";

import { Calculator, Check, ChevronLeft, Fuel, Moon, Pencil, Plus, Tags, Trash2, TriangleAlert, Users, type IconNode } from "lucide";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { useConfirm } from "@/features/desk/confirm";
import { FormDialog, TimeField } from "@/features/desk/controls";
import { isGoFailure, useGo, useGoList, useGoRecord } from "@/features/desk/hooks";
import { listJoin, t } from "@/features/desk/i18n/t";
import { formatMoney, formatScalar, headline } from "@/features/desk/present";
import {
  asNumber,
  Choice,
  clockText,
  countText,
  formatCount,
  SectionNav,
  SettingLine,
  SettingsSection,
  Stepper,
  Summary,
  Switch,
  unitWord,
  useDraft,
  useSectionSave,
} from "@/features/desk/settings-kit";
import { btnGhost, btnGhostSm, btnPrimary, inputClass, StateView } from "@/features/desk/ui";
import { Icon } from "@/shared/ui/icon";

type Row = Record<string, unknown>;
type Example = { km: number | null; minutes: number | null };
type Rates = { base: number; km: number; minute: number; minimum: number };

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

function pricingOf(category: Row) {
  return category.pricing && typeof category.pricing === "object" ? (category.pricing as Row) : null;
}

function ratesOf(category: Row): Rates | null {
  const p = pricingOf(category);
  if (!p) return null;
  return {
    base: asNumber(p.base_fare) ?? 0,
    km: asNumber(p.price_per_km) ?? 0,
    minute: asNumber(p.price_per_minute) ?? 0,
    minimum: asNumber(p.minimum_fare) ?? 0,
  };
}

function fareOf(rates: Rates, example: Example) {
  const km = example.km ?? 0;
  const minutes = example.minutes ?? 0;
  const calculated = rates.base + km * rates.km + minutes * rates.minute;
  return { calculated: Math.round(calculated), final: Math.round(Math.max(calculated, rates.minimum)), usedMinimum: calculated < rates.minimum };
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function StatusPill({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${on ? "bg-success/12 text-success-ink" : "bg-heading/[0.06] text-muted"}`}>
      <span className={`size-1.5 rounded-full ${on ? "bg-success" : "bg-line-strong"}`} />
      {on ? onLabel : offLabel}
    </span>
  );
}

// ------------------------------------------------------------------ formula

function FormulaPart({ label, value, tone = "plain" }: { label: string; value?: string; tone?: "plain" | "accent" | "muted" }) {
  return (
    <span
      className={`grid min-w-[6.5rem] gap-0.5 rounded-xl px-3 py-2 text-center ring-1 ring-inset ${
        tone === "accent" ? "bg-brand/[0.08] ring-brand/25" : tone === "muted" ? "bg-heading/[0.03] ring-line" : "bg-surface ring-line-strong"
      }`}
    >
      <span className="text-xs font-semibold text-heading">{label}</span>
      {value ? <span className="text-[11px] text-muted">{value}</span> : null}
    </span>
  );
}

function Formula() {
  const op = "text-lg font-semibold text-muted";
  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <p className="text-sm font-semibold text-heading">{t("كيف تُحسب أجرة الرحلة؟")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <FormulaPart label={t("أجرة الأساس")} value={t("مبلغ ثابت")} />
        <span className={op}>+</span>
        <FormulaPart label={t("سعر الكيلو")} value={t("× المسافة")} />
        <span className={op}>+</span>
        <FormulaPart label={t("سعر الدقيقة")} value={t("× مدة الرحلة")} />
        <span className={op}>=</span>
        <FormulaPart label={t("الأجرة")} value={t("لا تقل عن الحد الأدنى")} tone="accent" />
        <span className={op}>+</span>
        <FormulaPart label={t("أجرة الليل")} value={t("نسبة في ساعات الليل")} tone="muted" />
      </div>
      <p className="text-xs leading-6 text-muted">{t("كل فئة لها أسعارها الخاصة. سعر الكيلو في الفئات «التلقائية» يتغير وحده عند تغيير سعر البنزين.")}</p>
    </div>
  );
}

// ------------------------------------------------------------------ categories

const categoryFileClass =
  "block w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm text-body file:me-3 file:rounded-md file:border-0 file:bg-teal file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-on-teal";

function categoryImageSrc(imageUrl: unknown) {
  const path = typeof imageUrl === "string" ? imageUrl.trim() : "";
  if (!path) return null;
  if (path.startsWith("http") || path.startsWith("blob:") || path.startsWith("data:")) return path;
  return `/api/proxy${path.startsWith("/") ? path : `/${path}`}`;
}

async function encodeCategoryImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function CategoryImageField({
  existingUrl,
  file,
  onFile,
  remove,
  onRemove,
  allowRemove = false,
}: {
  existingUrl?: string | null;
  file: File | null;
  onFile: (next: File | null) => void;
  remove?: boolean;
  onRemove?: (next: boolean) => void;
  allowRemove?: boolean;
}) {
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setLocalPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const preview = localPreview ?? (remove ? null : existingUrl ?? null);
  return (
    <div className="grid content-start gap-2 sm:col-span-2">
      <span className="text-sm font-semibold text-heading">{t("صورة الفئة")}</span>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="h-28 w-full max-w-xs rounded-xl border border-line object-cover bg-heading/[0.03]" />
      ) : (
        <div className="grid h-28 max-w-xs place-items-center rounded-xl border border-dashed border-line-strong bg-heading/[0.02] text-xs text-muted">
          {t("لا توجد صورة")}
        </div>
      )}
      <input
        className={categoryFileClass}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const next = event.target.files?.[0] ?? null;
          onFile(next);
          if (next && onRemove) onRemove(false);
        }}
      />
      <p className="text-xs text-muted">{t("JPEG أو PNG أو WebP. تظهر للزبون مع الفئة في التطبيق.")}</p>
      {allowRemove && existingUrl && !file ? (
        <label className="inline-flex items-center gap-2 text-sm text-body">
          <input type="checkbox" checked={!!remove} onChange={(event) => onRemove?.(event.target.checked)} className="size-4 accent-[var(--teal)]" />
          {t("إزالة الصورة الحالية")}
        </label>
      ) : null}
    </div>
  );
}

function CategoryCreator({ onDone }: { onDone: (id: string | null) => void }) {
  const call = useGo();
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [code, setCode] = useState("");
  const [passengers, setPassengers] = useState<number | null>(4);
  const [order, setOrder] = useState<number | null>(null);
  const [active, setActive] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const errors = {
    name: nameAr.trim() ? null : t("اكتب اسم الفئة"),
    code: /^[A-Z0-9_]{2,32}$/.test(code) ? null : t("الرمز: حرفان على الأقل، أحرف إنكليزية كبيرة أو أرقام أو _"),
    passengers: need(passengers, 1, 20),
  };
  const blocked = Object.values(errors).some(Boolean);

  async function save() {
    if (blocked) return;
    setSaving(true);
    let image: string | undefined;
    if (imageFile) {
      const encoded = await encodeCategoryImage(imageFile);
      if (!encoded) {
        setSaving(false);
        return;
      }
      image = encoded;
    }
    const saved = await call<Row>("/admin/ride-categories", {
      method: "POST",
      body: { code, name_ar: nameAr.trim(), name_en: nameEn.trim() || undefined, max_passengers: passengers, sort_order: order ?? undefined, is_active: active, image },
    });
    setSaving(false);
    if (!isGoFailure(saved)) onDone(text(saved.id) || null);
  }

  const label = "text-sm font-semibold text-heading";
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid content-start gap-1.5">
          <span className={label}>{t("اسم الفئة")}</span>
          <input className={inputClass} value={nameAr} onChange={(event) => setNameAr(event.target.value)} placeholder={t("مثلاً: عائلي")} />
          <span className="text-xs text-muted">{t("كما يراه الزبون في التطبيق.")}</span>
        </label>
        <label className="grid content-start gap-1.5">
          <span className={label}>{t("الاسم بالإنكليزية")}</span>
          <input className={inputClass} dir="ltr" value={nameEn} onChange={(event) => setNameEn(event.target.value)} placeholder="Family" />
          <span className="text-xs text-muted">{t("اختياري، لمن يستخدم التطبيق بالإنكليزية.")}</span>
        </label>
        <label className="grid content-start gap-1.5">
          <span className={label}>{t("الرمز")}</span>
          <input
            className={inputClass}
            dir="ltr"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
            placeholder="FAMILY"
          />
          <span className="text-xs text-muted">{t("اسم داخلي ثابت يستخدمه النظام. لا يتغير بعد الإنشاء.")}</span>
        </label>
        <div className="grid content-start gap-1.5">
          <span className={label}>{t("أقصى عدد ركاب")}</span>
          <Stepper label={t("أقصى عدد ركاب")} value={passengers} onChange={setPassengers} min={1} max={20} unit={unitWord(passengers ?? 0, "passenger")} invalid={!!errors.passengers} />
        </div>
        <div className="grid content-start gap-1.5">
          <span className={label}>{t("الترتيب في التطبيق")}</span>
          <Stepper label={t("الترتيب في التطبيق")} value={order} onChange={setOrder} min={0} placeholder={t("في الآخر")} />
          <span className="text-xs text-muted">{t("الرقم الأصغر يظهر أولاً.")}</span>
        </div>
        <div className="grid content-start gap-1.5">
          <span className={label}>{t("ظاهرة للزبائن")}</span>
          <div className="flex">
            <Switch checked={active} onChange={setActive} onLabel={t("ظاهرة")} offLabel={t("مخفية")} />
          </div>
        </div>
        <CategoryImageField file={imageFile} onFile={setImageFile} />
      </div>
      <p className="rounded-xl bg-brand/[0.07] px-4 py-3 text-[13px] leading-6 text-heading ring-1 ring-inset ring-brand/25">
        {t("بعد الإنشاء ستنتقل مباشرة لتحديد أسعار الفئة. الفئة بدون أسعار لا يمكن طلبها.")}
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {blocked ? <p className="me-auto text-xs font-medium text-muted">{Object.values(errors).find(Boolean)}</p> : null}
        <button className={btnGhost} type="button" onClick={() => onDone(null)}>{t("إلغاء")}</button>
        <button className={btnPrimary} type="button" onClick={() => void save()} disabled={blocked || saving}>
          <Icon node={Check} size={16} />
          {t("إنشاء الفئة")}
        </button>
      </div>
    </div>
  );
}

function CategoryEditor({ category, onDone }: { category: Row; onDone: () => void }) {
  const call = useGo();
  const id = text(category.id);
  const [nameAr, setNameAr] = useState(text(category.name_ar));
  const [nameEn, setNameEn] = useState(text(category.name_en));
  const [passengers, setPassengers] = useState<number | null>(asNumber(category.max_passengers) ?? 4);
  const [order, setOrder] = useState<number | null>(asNumber(category.sort_order));
  const [active, setActive] = useState(category.is_active !== false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const existingUrl = categoryImageSrc(category.image_url);
  const errors = {
    name: nameAr.trim() ? null : t("اكتب اسم الفئة"),
    passengers: need(passengers, 1, 20),
  };
  const blocked = Object.values(errors).some(Boolean);

  async function save() {
    if (blocked || !id) return;
    setSaving(true);
    let image: string | undefined;
    if (imageFile) {
      const encoded = await encodeCategoryImage(imageFile);
      if (!encoded) {
        setSaving(false);
        return;
      }
      image = encoded;
    }
    const saved = await call(`/admin/ride-categories/${id}`, {
      method: "PATCH",
      body: {
        name_ar: nameAr.trim(),
        name_en: nameEn.trim() || undefined,
        max_passengers: passengers,
        sort_order: order ?? 0,
        is_active: active,
        ...(image ? { image } : removeImage ? { remove_image: true } : {}),
      },
    });
    setSaving(false);
    if (!isGoFailure(saved)) onDone();
  }

  const label = "text-sm font-semibold text-heading";
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid content-start gap-1.5">
          <span className={label}>{t("اسم الفئة")}</span>
          <input className={inputClass} value={nameAr} onChange={(event) => setNameAr(event.target.value)} />
        </label>
        <label className="grid content-start gap-1.5">
          <span className={label}>{t("الاسم بالإنكليزية")}</span>
          <input className={inputClass} dir="ltr" value={nameEn} onChange={(event) => setNameEn(event.target.value)} />
        </label>
        <label className="grid content-start gap-1.5">
          <span className={label}>{t("الرمز")}</span>
          <input className={inputClass} dir="ltr" value={text(category.code)} disabled />
          <span className="text-xs text-muted">{t("الرمز ثابت بعد الإنشاء ولا يمكن تغييره.")}</span>
        </label>
        <div className="grid content-start gap-1.5">
          <span className={label}>{t("أقصى عدد ركاب")}</span>
          <Stepper label={t("أقصى عدد ركاب")} value={passengers} onChange={setPassengers} min={1} max={20} unit={unitWord(passengers ?? 0, "passenger")} invalid={!!errors.passengers} />
        </div>
        <div className="grid content-start gap-1.5">
          <span className={label}>{t("الترتيب في التطبيق")}</span>
          <Stepper label={t("الترتيب في التطبيق")} value={order} onChange={setOrder} min={0} placeholder={t("في الآخر")} />
        </div>
        <div className="grid content-start gap-1.5">
          <span className={label}>{t("ظاهرة للزبائن")}</span>
          <div className="flex">
            <Switch checked={active} onChange={setActive} onLabel={t("ظاهرة")} offLabel={t("مخفية")} />
          </div>
        </div>
        <CategoryImageField
          existingUrl={existingUrl}
          file={imageFile}
          onFile={setImageFile}
          remove={removeImage}
          onRemove={setRemoveImage}
          allowRemove
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {blocked ? <p className="me-auto text-xs font-medium text-muted">{Object.values(errors).find(Boolean)}</p> : null}
        <button className={btnGhost} type="button" onClick={onDone}>{t("إلغاء")}</button>
        <button className={btnPrimary} type="button" onClick={() => void save()} disabled={blocked || saving}>
          <Icon node={Check} size={16} />
          {t("حفظ الفئة")}
        </button>
      </div>
    </div>
  );
}

function CategoryCard({ category, onPrices }: { category: Row; onPrices: () => void }) {
  const call = useGo();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const rates = ratesOf(category);
  const active = category.is_active !== false;
  const id = text(category.id);
  const name = text(category.name_ar) || headline(category);

  function remove() {
    if (!id) return;
    void confirm({
      title: t("حذف الفئة"),
      body: t("تُحذف الفئة نهائياً إن لم تُستخدم في رحلات أو مركبات. إن كانت مستخدمة فأخفِها بدل الحذف."),
      confirm: t("حذف"),
      danger: true,
      perform: () => call(`/admin/ride-categories/${id}`, { method: "DELETE" }),
    });
  }

  const thumb = categoryImageSrc(category.image_url);
  return (
    <article className={`grid content-between gap-3 rounded-xl border p-4 ${active ? "border-line bg-surface" : "border-dashed border-line-strong bg-heading/[0.02]"}`}>
      <div className="grid gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-3">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="size-12 shrink-0 rounded-lg border border-line object-cover" />
            ) : (
              <span className="grid size-12 shrink-0 place-items-center rounded-lg border border-dashed border-line-strong bg-heading/[0.03] text-[10px] text-muted">
                {t("بدون صورة")}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-heading">{name}</p>
              <p className="mt-0.5 font-mono text-[11px] text-muted" dir="ltr">{text(category.code)}</p>
            </div>
          </div>
          <StatusPill on={active} onLabel={t("ظاهرة")} offLabel={t("مخفية")} />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Icon node={Users} size={13} />
          {countText(asNumber(category.max_passengers) ?? 4, "passenger")}
        </p>
        {rates ? (
          <>
            <p className="text-[13px] leading-6 text-body">
              <span className={`font-semibold ${rates.km ? "text-heading" : "text-danger-ink"}`}>{formatMoney(rates.km)}</span> {t("لكل كم")} · {t("الحد الأدنى")}{" "}
              <span className="font-semibold text-heading">{formatMoney(rates.minimum)}</span>
            </p>
            {rates.km === 0 ? (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-danger-ink">
                <Icon node={TriangleAlert} size={13} />
                {t("سعر الكيلو 0: المسافة لا تُحسب في الأجرة")}
              </p>
            ) : null}
          </>
        ) : (
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-warning-ink">
            <Icon node={TriangleAlert} size={14} />
            {t("لم تُحدد أسعارها بعد")}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
        <button className={btnGhostSm} type="button" onClick={() => setEditing(true)}>
          <Icon node={Pencil} size={13} />
          {t("تعديل")}
        </button>
        <button className={btnGhostSm} type="button" onClick={onPrices}>
          <Icon node={Calculator} size={13} />
          {rates ? t("تعديل الأسعار") : t("حدد الأسعار")}
        </button>
        <button
          className={btnGhostSm}
          type="button"
          onClick={() => void call(`/admin/ride-categories/${id}`, { method: "PATCH", body: { is_active: !active } })}
        >
          {active ? t("إخفاء") : t("إظهار")}
        </button>
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3 text-xs font-semibold text-danger-ink transition-colors hover:bg-danger/15"
          type="button"
          onClick={remove}
        >
          <Icon node={Trash2} size={13} />
          {t("حذف")}
        </button>
        <Link href={`/admin/categories/${id}`} className="ms-auto flex items-center gap-0.5 text-xs font-semibold text-accent hover:underline">
          {t("التفاصيل")}
          <Icon node={ChevronLeft} size={13} className="ltr:rotate-180" />
        </Link>
      </div>
      <FormDialog open={editing} title={t("تعديل الفئة")} onClose={() => setEditing(false)}>
        {editing ? <CategoryEditor category={category} onDone={() => setEditing(false)} /> : null}
      </FormDialog>
    </article>
  );
}

function CategoriesSection({ categories, onPrices }: { categories: Row[]; onPrices: (id: string) => void }) {
  const [creating, setCreating] = useState(false);
  const visible = categories.filter((row) => row.is_active !== false).length;
  const unpriced = categories.filter((row) => !ratesOf(row));
  return (
    <SettingsSection
      id="categories"
      icon={Tags}
      title={t("فئات الرحلات")}
      description={t("أضف أو عدّل أو احذف أنواع السيارات التي يختار منها الزبون عند طلب رحلة، مثل يومي وVIP وعائلي.")}
      summary={
        <Summary off={visible === 0}>
          <p>
            {t("يرى الزبون")} {strong(formatCount(visible))} {t("من أصل")} {strong(formatCount(categories.length))} {t("فئات.")}{" "}
            {t("الفئة المخفية لا تظهر في التطبيق، لكن رحلاتها السابقة تبقى كما هي.")}
          </p>
          {unpriced.length ? (
            <p className="text-warning-ink">
              {t("فئات بدون أسعار")}: {listJoin(unpriced.map((row) => text(row.name_ar)))}.
            </p>
          ) : null}
        </Summary>
      }
      extra={
        <div className="grid gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((row) => <CategoryCard key={text(row.id)} category={row} onPrices={() => onPrices(text(row.id))} />)}
          <button
            type="button"
            className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong text-sm font-semibold text-body transition-colors hover:border-teal/60 hover:bg-brand/[0.05] hover:text-accent"
            onClick={() => setCreating(true)}
          >
            <Icon node={Plus} size={20} />
            {t("إضافة فئة")}
          </button>
          <FormDialog open={creating} title={t("فئة جديدة")} onClose={() => setCreating(false)}>
            {creating ? (
              <CategoryCreator
                onDone={(id) => {
                  setCreating(false);
                  if (id) onPrices(id);
                }}
              />
            ) : null}
          </FormDialog>
        </div>
      }
    />
  );
}

// ------------------------------------------------------------------ prices

function ExampleTrip({ example, onChange }: { example: Example; onChange: (next: Example) => void }) {
  return (
    <div className="grid gap-3 rounded-xl border border-line bg-heading/[0.02] p-3 sm:grid-cols-[auto_1fr_1fr] sm:items-center">
      <p className="text-[13px] font-semibold text-heading">{t("احسب على رحلة مثال")}</p>
      <Stepper label={t("مسافة رحلة المثال")} value={example.km} onChange={(km) => onChange({ ...example, km })} min={0} max={500} unit={t("كم")} />
      <Stepper label={t("مدة رحلة المثال")} value={example.minutes} onChange={(minutes) => onChange({ ...example, minutes })} min={0} max={600} unit={unitWord(example.minutes ?? 0, "minute")} />
    </div>
  );
}

function PriceTable({ categories, selected, example, onSelect }: { categories: Row[]; selected: string; example: Example; onSelect: (id: string) => void }) {
  const head = [t("الفئة"), t("أجرة الأساس"), t("لكل كم"), t("لكل دقيقة"), t("الحد الأدنى"), t("رحلة المثال")];
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-sm">
        <thead className="bg-heading/[0.03] text-xs text-muted">
          <tr>{head.map((cell) => <th key={cell} className="whitespace-nowrap px-3 py-2.5 text-start font-medium">{cell}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {categories.map((row) => {
            const id = text(row.id);
            const rates = ratesOf(row);
            const picked = id === selected;
            return (
              <tr
                key={id}
                onClick={() => onSelect(id)}
                className={`cursor-pointer transition-colors ${picked ? "bg-brand/[0.09]" : "hover:bg-heading/[0.03]"}`}
                aria-selected={picked}
              >
                <td className="whitespace-nowrap px-3 py-2.5">
                  <span className="flex items-center gap-2 font-semibold text-heading">
                    <span className={`size-2 rounded-full ${picked ? "bg-teal" : "bg-transparent ring-1 ring-line-strong"}`} />
                    {text(row.name_ar)}
                  </span>
                </td>
                {rates ? (
                  <>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{formatMoney(rates.base)}</td>
                    <td className={`whitespace-nowrap px-3 py-2.5 tabular-nums ${rates.km ? "" : "font-semibold text-danger-ink"}`}>{formatMoney(rates.km)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{formatMoney(rates.minute)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{formatMoney(rates.minimum)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums text-accent">{formatMoney(fareOf(rates, example).final)}</td>
                  </>
                ) : (
                  <td colSpan={5} className="px-3 py-2.5 text-xs font-semibold text-warning-ink">{t("لم تُحدد أسعارها بعد")}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PricesSection({
  categories,
  selected,
  onSelect,
  example,
  onExample,
}: {
  categories: Row[];
  selected: string;
  onSelect: (id: string) => void;
  example: Example;
  onExample: (next: Example) => void;
}) {
  const call = useGo();
  const category = categories.find((row) => text(row.id) === selected) ?? null;
  const pricing = category ? pricingOf(category) : null;
  const draft = useDraft({
    base_fare: asNumber(pricing?.base_fare),
    price_per_km: asNumber(pricing?.price_per_km),
    price_per_minute: asNumber(pricing?.price_per_minute),
    minimum_fare: asNumber(pricing?.minimum_fare),
    per_km_mode: (text(pricing?.per_km_mode) || "AUTO") as "AUTO" | "MANUAL",
  });
  const saver = useSectionSave(async (changes) => {
    const body = pricing ? changes : draft.draft;
    const saved = await call(`/admin/pricing/${selected}`, { method: "PATCH", idempotent: true, body });
    if (isGoFailure(saved)) throw new Error("save failed");
  });
  const d = draft.draft;
  const errors = {
    base_fare: need(d.base_fare, 0),
    price_per_km: need(d.price_per_km, 0),
    price_per_minute: need(d.price_per_minute, 0),
    minimum_fare: need(d.minimum_fare, 0),
  };
  const ready = !Object.values(errors).some(Boolean);
  const rates: Rates = { base: d.base_fare ?? 0, km: d.price_per_km ?? 0, minute: d.price_per_minute ?? 0, minimum: d.minimum_fare ?? 0 };
  const fare = fareOf(rates, example);
  const name = category ? text(category.name_ar) : "";

  return (
    <SettingsSection
      id="prices"
      icon={Calculator}
      title={t("أسعار الرحلات")}
      description={t("اختر فئة من الجدول لتعديل أسعارها. عمود «رحلة المثال» يوضح كم يدفع الزبون في كل فئة.")}
      summary={
        <div className="grid gap-4">
          <ExampleTrip example={example} onChange={onExample} />
          <PriceTable categories={categories} selected={selected} example={example} onSelect={onSelect} />
          {category ? (
            <Summary title={`${t("رحلة المثال بفئة")} «${name}»`}>
              {ready ? (
                <>
                  <p dir="auto">
                    {formatMoney(rates.base)} + ({formatCount(example.km ?? 0)} {t("كم")} × {formatMoney(rates.km)}) + ({formatCount(example.minutes ?? 0)} {t("دقيقة")} × {formatMoney(rates.minute)}) ={" "}
                    {strong(formatMoney(fare.calculated))}
                  </p>
                  <p>
                    {fare.usedMinimum ? (
                      <>
                        {t("المبلغ أقل من الحد الأدنى، لذلك يدفع الزبون")} {strong(formatMoney(fare.final))}.
                      </>
                    ) : (
                      <>
                        {t("يدفع الزبون")} {strong(formatMoney(fare.final))} {t("(بدون أجرة الليل).")}
                      </>
                    )}
                  </p>
                  <p className="text-muted">
                    {d.per_km_mode === "AUTO" ? t("سعر الكيلو يتغير تلقائياً مع سعر البنزين.") : t("سعر الكيلو ثابت ولا يتأثر بسعر البنزين.")}
                  </p>
                </>
              ) : (
                <p>{t("أكمل الأسعار الأربعة لترى المثال.")}</p>
              )}
            </Summary>
          ) : null}
        </div>
      }
      save={
        category
          ? {
              dirty: draft.dirty || (!pricing && ready),
              saving: saver.saving,
              blocked: !ready,
              onReset: draft.reset,
              onSave: () => void saver.run(draft.changes).catch(() => undefined),
            }
          : undefined
      }
    >
      {category ? (
        <>
          <div className="flex items-center gap-2 pt-5">
            <span className="text-xs font-semibold text-muted">{t("تعديل أسعار")}</span>
            <span className="rounded-lg bg-teal px-2.5 py-1 text-sm font-semibold text-on-teal">{name}</span>
          </div>
          <SettingLine label={t("أجرة الأساس")} help={t("مبلغ ثابت يبدأ به حساب كل رحلة.")} error={errors.base_fare}>
            <Stepper label={t("أجرة الأساس")} value={d.base_fare} onChange={(v) => draft.set("base_fare", v)} min={0} step={500} unit={t("ل.س")} invalid={!!errors.base_fare} />
          </SettingLine>
          <SettingLine label={t("سعر الكيلو")} help={t("يُضرب في مسافة الرحلة بالكيلومتر.")} error={errors.price_per_km ?? (d.price_per_km === 0 ? t("سعر الكيلو 0: المسافة لا تُحسب في الأجرة") : null)}>
            <Stepper label={t("سعر الكيلو")} value={d.price_per_km} onChange={(v) => draft.set("price_per_km", v)} min={0} step={50} unit={t("ل.س")} invalid={!!errors.price_per_km} />
          </SettingLine>
          <SettingLine label={t("سعر الدقيقة")} help={t("يُضرب في مدة الرحلة بالدقائق. ويُحسب أيضاً انتظار السائق عند الزبون بعد أول دقيقتين مجانيتين.")} error={errors.price_per_minute}>
            <Stepper label={t("سعر الدقيقة")} value={d.price_per_minute} onChange={(v) => draft.set("price_per_minute", v)} min={0} step={10} unit={t("ل.س")} invalid={!!errors.price_per_minute} />
          </SettingLine>
          <SettingLine label={t("الحد الأدنى للأجرة")} help={t("أقل مبلغ يدفعه الزبون مهما كانت الرحلة قصيرة.")} error={errors.minimum_fare}>
            <Stepper label={t("الحد الأدنى للأجرة")} value={d.minimum_fare} onChange={(v) => draft.set("minimum_fare", v)} min={0} step={500} unit={t("ل.س")} invalid={!!errors.minimum_fare} />
          </SettingLine>
          <SettingLine label={t("سعر الكيلو وسعر البنزين")}>
            <Choice
              value={d.per_km_mode}
              onChange={(v) => draft.set("per_km_mode", v)}
              options={[
                { value: "AUTO", label: t("يتغير مع البنزين"), hint: t("عند تغيير سعر البنزين يتعدل سعر الكيلو لهذه الفئة تلقائياً.") },
                { value: "MANUAL", label: t("ثابت"), hint: t("لا يتغير إلا إذا عدلته بنفسك هنا.") },
              ]}
            />
          </SettingLine>
        </>
      ) : null}
    </SettingsSection>
  );
}

// ------------------------------------------------------------------ fuel

function roundTo(value: number, step: number) {
  return step > 0 ? Math.round(value / step) * step : Math.round(value * 100) / 100;
}

function FuelEditor({ fuel, categories }: { fuel: Row; categories: Row[] }) {
  const call = useGo();
  const confirm = useConfirm();
  const history = useGoList("/admin/pricing/fuel/history", { limit: 5 });
  const current = asNumber(fuel.current_price);
  const draft = useDraft<{ new_price: number | null; fuel_share_pct: number | null; rounding_step: number | null }>({
    new_price: current,
    fuel_share_pct: asNumber(fuel.fuel_share_pct) ?? 100,
    rounding_step: asNumber(fuel.rounding_step) ?? 50,
  });
  const [saving, setSaving] = useState(false);
  const d = draft.draft;
  const errors: Record<string, string | null> = {
    new_price: need(d.new_price, 1),
    fuel_share_pct: need(d.fuel_share_pct, 0, 100),
    rounding_step: need(d.rounding_step, 0),
  };
  const blocked = Object.values(errors).some(Boolean);
  const change = current && d.new_price ? (d.new_price - current) / current : 0;
  const kmChange = change * ((d.fuel_share_pct ?? 0) / 100);
  const rows = categories
    .filter((row) => ratesOf(row))
    .map((row) => {
      const pricing = pricingOf(row)!;
      const auto = text(pricing.per_km_mode) !== "MANUAL";
      const before = asNumber(pricing.price_per_km) ?? 0;
      const after = auto && current ? Math.max(0, roundTo(before * (1 + kmChange), d.rounding_step ?? 0)) : before;
      return { id: text(row.id), name: text(row.name_ar), auto, before, after };
    });
  const moved = rows.filter((row) => row.after !== row.before).length;
  const pct = (value: number) => `${value > 0 ? "+" : ""}${formatCount(Math.round(value * 10000) / 100)}%`;
  const priceChanged = d.new_price != null && d.new_price !== current;
  const zeroed = rows.filter((row) => row.before > 0 && row.after <= 0);
  const huge = priceChanged && Math.abs(change) > 0.5;
  if (zeroed.length) errors.new_price = `${t("هذا السعر يجعل سعر الكيلو 0 في")}: ${listJoin(zeroed.map((row) => row.name))}`;
  const blockedAll = blocked || zeroed.length > 0;

  function save() {
    void confirm({
      title: t("اعتماد سعر البنزين الجديد"),
      body: current
        ? `${huge ? `${t("تنبيه: تغيير كبير جداً")} (${pct(change)}). ` : ""}${t("سيتغير سعر الكيلو في")} ${formatCount(moved)} ${t("فئة من الفئات التلقائية. الرحلات الجارية لا تتأثر.")}`
        : t("هذا أول سعر بنزين يُدخل، لذلك لا يتغير أي سعر كيلو الآن. التغييرات القادمة تُحسب منه."),
      confirm: t("اعتماد"),
      danger: huge,
      perform: async () => {
        setSaving(true);
        await call("/admin/pricing/fuel", { method: "PUT", idempotent: true, body: d });
        setSaving(false);
      },
    });
  }

  return (
    <SettingsSection
      id="fuel"
      icon={Fuel}
      title={t("سعر البنزين")}
      description={t("عند تغيير سعر البنزين يتعدل سعر الكيلو تلقائياً في الفئات التي تتبع البنزين. الفئات الثابتة لا تتغير.")}
      summary={
        <div className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl bg-heading/[0.03] px-4 py-3 ring-1 ring-inset ring-line">
            <div>
              <p className="text-xs font-semibold text-muted">{t("سعر البنزين الحالي")}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-heading">{current ? formatMoney(current) : t("لم يُحدد بعد")}</p>
            </div>
            {fuel.updated_at ? <p className="text-xs text-muted">{t("آخر تحديث")}: {formatScalar("updated_at", fuel.updated_at)}</p> : null}
          </div>
          <Summary off={!priceChanged}>
            {!current ? (
              <p>{t("أدخل سعر البنزين الحالي. أول سعر لا يغيّر أي سعر كيلو، والتغييرات القادمة تُحسب منه.")}</p>
            ) : priceChanged ? (
              <>
                <p>
                  {t("البنزين من")} {strong(formatMoney(current))} {t("إلى")} {strong(formatMoney(d.new_price ?? 0))} ({strong(pct(change))}).
                </p>
                <p>
                  {t("سعر الكيلو في الفئات التلقائية يتغير")} {strong(pct(kmChange))}، {t("ويتغير فعلياً في")} {strong(formatCount(moved))} {t("فئة.")}
                </p>
                {huge ? (
                  <p className="flex items-start gap-1.5 font-semibold text-danger-ink">
                    <Icon node={TriangleAlert} size={16} className="mt-1 shrink-0" />
                    {t("تغيير كبير جداً. تأكد أن الرقم هو سعر لتر البنزين بالليرة السورية، بنفس طريقة السعر الحالي.")}
                  </p>
                ) : null}
              </>
            ) : (
              <p>{t("غيّر سعر البنزين بالأسفل لترى تأثيره على سعر الكيلو قبل الاعتماد.")}</p>
            )}
          </Summary>
        </div>
      }
      extra={
        <div className="grid gap-5">
          {priceChanged && current ? (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead className="bg-heading/[0.03] text-xs text-muted">
                  <tr>
                    {[t("الفئة"), t("سعر الكيلو الآن"), t("بعد الاعتماد"), t("الفرق")].map((cell) => (
                      <th key={cell} className="whitespace-nowrap px-3 py-2.5 text-start font-medium">{cell}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => {
                    const diff = row.after - row.before;
                    return (
                      <tr key={row.id}>
                        <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-heading">
                          {row.name}
                          {!row.auto ? <span className="ms-2 rounded bg-heading/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-muted">{t("ثابت")}</span> : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{formatMoney(row.before)}</td>
                        <td className={`whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums ${diff ? "text-accent" : "text-muted"}`}>{formatMoney(row.after)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted" dir="ltr">{diff ? `${diff > 0 ? "+" : ""}${formatCount(diff)}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="grid gap-2">
            <p className="text-sm font-semibold text-heading">{t("آخر تغييرات البنزين")}</p>
            <StateView bare loading={history.isLoading} error={history.error}>
              {(history.data ?? []).length === 0 ? (
                <p className="rounded-xl bg-heading/[0.03] px-4 py-3 text-sm text-muted">{t("لا توجد تغييرات بعد.")}</p>
              ) : (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {(history.data ?? []).map((row) => {
                    const affected = Array.isArray(row.affected) ? (row.affected as Row[]) : [];
                    return (
                      <li key={text(row.id)} className="grid gap-1.5 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="font-semibold text-heading">
                            {row.old_price != null ? `${formatMoney(asNumber(row.old_price) ?? 0)} ← ` : ""}
                            {formatMoney(asNumber(row.new_price) ?? 0)}
                          </span>
                          <span className="text-xs text-muted">
                            {formatScalar("created_at", row.created_at)}
                            {row.changed_by && typeof row.changed_by === "object" ? ` · ${headline(row.changed_by as Row)}` : ""}
                          </span>
                        </div>
                        <p className="text-xs leading-5 text-muted">
                          {affected.length
                            ? affected.map((item) => `${text(item.name_ar)}: ${formatMoney(asNumber(item.old_per_km) ?? 0)} ← ${formatMoney(asNumber(item.new_per_km) ?? 0)}`).join(" · ")
                            : t("لم يتغير أي سعر كيلو.")}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </StateView>
          </div>
        </div>
      }
      save={{ dirty: draft.dirty, saving, blocked: blockedAll, onReset: draft.reset, onSave: save }}
    >
      <SettingLine label={t("سعر البنزين الجديد")} help={t("سعر اللتر بالليرة السورية.")} error={errors.new_price}>
        <Stepper label={t("سعر البنزين الجديد")} value={d.new_price} onChange={(v) => draft.set("new_price", v)} min={1} step={500} unit={t("ل.س")} invalid={!!errors.new_price} />
      </SettingLine>
      <SettingLine
        label={t("تأثير البنزين على سعر الكيلو")}
        help={t("100% تعني إذا زاد البنزين 10% يزيد الكيلو 10%. و50% تعني يزيد 5% فقط. و0% تعني لا يتأثر.")}
        error={errors.fuel_share_pct}
      >
        <Stepper label={t("تأثير البنزين على سعر الكيلو")} value={d.fuel_share_pct} onChange={(v) => draft.set("fuel_share_pct", v)} min={0} max={100} step={5} unit="%" invalid={!!errors.fuel_share_pct} />
      </SettingLine>
      <SettingLine label={t("تقريب سعر الكيلو الجديد")} help={t("لأقرب مضاعف لهذا الرقم حتى تبقى الأسعار سهلة. مثلاً 50 تجعل 437 تصبح 450. و0 بدون تقريب.")} error={errors.rounding_step}>
        <Stepper label={t("تقريب سعر الكيلو الجديد")} value={d.rounding_step} onChange={(v) => draft.set("rounding_step", v)} min={0} step={10} unit={t("ل.س")} invalid={!!errors.rounding_step} />
      </SettingLine>
    </SettingsSection>
  );
}

// ------------------------------------------------------------------ night fare

function CategoryChips({ categories, value, onChange }: { categories: Row[]; value: string[]; onChange: (next: string[]) => void }) {
  const all = value.length === 0;
  function toggle(id: string) {
    const next = value.includes(id) ? value.filter((item) => item !== id) : [...value, id];
    onChange(next.length === categories.length ? [] : next);
  }
  const chip = (active: boolean) =>
    `inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold transition-colors ${
      active ? "border-teal bg-teal text-on-teal shadow-glow" : "border-line-strong bg-surface text-body hover:border-teal/45 hover:text-heading"
    }`;
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" aria-pressed={all} className={chip(all)} onClick={() => onChange([])}>
        {all ? <Icon node={Check} size={14} strokeWidth={3} /> : null}
        {t("كل الفئات")}
      </button>
      {categories.map((row) => {
        const id = text(row.id);
        const picked = value.includes(id);
        return (
          <button key={id} type="button" aria-pressed={picked} className={chip(picked)} onClick={() => toggle(id)}>
            {picked ? <Icon node={Check} size={14} strokeWidth={3} /> : null}
            {text(row.name_ar)}
          </button>
        );
      })}
    </div>
  );
}

function NightEditor({ config, categories, exampleFare }: { config: Row; categories: Row[]; exampleFare: number | null }) {
  const call = useGo();
  const draft = useDraft({
    night_fare_enabled: config.night_fare_enabled === true,
    night_start: text(config.night_start).slice(0, 5) || "00:00",
    night_end: text(config.night_end).slice(0, 5) || "07:00",
    night_fare_pct: asNumber(config.night_fare_pct) ?? (20 as number | null),
    night_category_ids: Array.isArray(config.night_category_ids) ? (config.night_category_ids as string[]) : [],
  });
  const saver = useSectionSave(async (changes) => {
    const saved = await call("/admin/incentives/config", { method: "PATCH", body: changes });
    if (isGoFailure(saved)) throw new Error("save failed");
  });
  const d = draft.draft;
  const errors = {
    night_fare_pct: need(d.night_fare_pct, 0, 200),
    time: d.night_start === d.night_end ? t("وقت البداية والنهاية متساويان") : null,
  };
  const names = d.night_category_ids.map((id) => text(categories.find((row) => text(row.id) === id)?.name_ar)).filter(Boolean);
  const pct = d.night_fare_pct ?? 0;
  return (
    <SettingsSection
      id="night"
      icon={Moon}
      title={t("أجرة الليل")}
      description={t("زيادة على سعر الزبون للرحلات المطلوبة في ساعات الليل.")}
      enabled={d.night_fare_enabled}
      onToggle={(v) => draft.set("night_fare_enabled", v)}
      summary={
        <Summary off={!d.night_fare_enabled}>
          {d.night_fare_enabled ? (
            <>
              <p>
                {t("الرحلات المطلوبة من")} {strong(clockText(d.night_start))} {t("حتى")} {strong(clockText(d.night_end))} {t("تزيد أجرتها")} {strong(`${formatCount(pct)}%`)}{" "}
                {names.length ? <>{t("في فئات")} {strong(listJoin(names))}</> : t("في كل الفئات")}.
              </p>
              {exampleFare ? (
                <p>
                  {t("مثال: رحلة بـ")}
                  {formatMoney(exampleFare)} {t("نهاراً تصبح")} {strong(formatMoney(Math.round(exampleFare * (1 + pct / 100))))} {t("ليلاً.")}
                </p>
              ) : null}
              <p className="text-muted">{t("للرحلة المجدولة يُعتمد وقت الموعد. العمولة والمكافآت تُحسب على الأجرة بعد الزيادة.")}</p>
            </>
          ) : (
            <p>{t("أجرة الليل متوقفة: السعر نفسه في كل الأوقات.")}</p>
          )}
        </Summary>
      }
      save={{
        dirty: draft.dirty,
        saving: saver.saving,
        blocked: Object.values(errors).some(Boolean),
        onReset: draft.reset,
        onSave: () => void saver.run(draft.changes).catch(() => undefined),
      }}
    >
      <SettingLine label={t("من الساعة")} help={t("إذا كانت النهاية قبل البداية فالفترة تعبر منتصف الليل، مثل 10 مساءً حتى 6 صباحاً.")} error={errors.time}>
        <TimeField value={d.night_start} onValueChange={(v) => draft.set("night_start", v)} presets={["22:00", "23:00", "00:00", "01:00"]} />
      </SettingLine>
      <SettingLine label={t("حتى الساعة")}>
        <TimeField value={d.night_end} onValueChange={(v) => draft.set("night_end", v)} presets={["05:00", "06:00", "07:00", "08:00"]} />
      </SettingLine>
      <SettingLine label={t("نسبة الزيادة")} help={t("تُضاف بعد الحد الأدنى للأجرة.")} error={errors.night_fare_pct}>
        <Stepper label={t("نسبة الزيادة")} value={d.night_fare_pct} onChange={(v) => draft.set("night_fare_pct", v)} min={0} max={200} step={5} unit="%" invalid={!!errors.night_fare_pct} />
      </SettingLine>
      <SettingLine stacked label={t("الفئات التي تُطبق عليها")}>
        <CategoryChips categories={categories} value={d.night_category_ids} onChange={(v) => draft.set("night_category_ids", v)} />
      </SettingLine>
    </SettingsSection>
  );
}

// ------------------------------------------------------------------ page

function Loaded({ path, children }: { path: string; children: (data: Row) => ReactNode }) {
  const query = useGoRecord(path);
  return (
    <StateView loading={query.isLoading} error={query.error}>
      {query.data ? children(query.data) : null}
    </StateView>
  );
}

export function CategoriesScreen() {
  const categories = useGoList("/admin/ride-categories", { limit: 100 });
  const night = useGoRecord("/admin/incentives/config");
  const rows = categories.data ?? [];
  const [picked, setPicked] = useState("");
  const [example, setExample] = useState<Example>({ km: 5, minutes: 15 });
  const selected = picked || text(rows[0]?.id);
  const selectedRates = rows.find((row) => text(row.id) === selected);
  const exampleFare = selectedRates && ratesOf(selectedRates) ? fareOf(ratesOf(selectedRates)!, example).final : null;
  const nav: { id: string; label: string; icon: IconNode; on?: boolean }[] = [
    { id: "categories", label: t("الفئات"), icon: Tags },
    { id: "prices", label: t("الأسعار"), icon: Calculator },
    { id: "fuel", label: t("سعر البنزين"), icon: Fuel },
    { id: "night", label: t("أجرة الليل"), icon: Moon, on: night.data?.night_fare_enabled === true },
  ];

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6">
      <header className="grid gap-2">
        <h1 className="text-[26px] font-semibold tracking-tight text-heading">{t("الفئات والتسعير")}</h1>
        <p className="max-w-3xl text-sm leading-7 text-muted">
          {t("هنا تحدد أنواع السيارات التي يختار منها الزبون، وكم يدفع في كل رحلة. غيّر ما تريد ثم اضغط «حفظ التغييرات» أسفل القسم. لا يتغير شيء قبل الحفظ، والرحلات الجارية لا تتأثر.")}
        </p>
      </header>
      <Formula />
      <SectionNav items={nav} />
      <StateView loading={categories.isLoading} error={categories.error}>
        <div className="grid gap-6">
          <CategoriesSection
            categories={rows}
            onPrices={(id) => {
              setPicked(id);
              requestAnimationFrame(() => scrollTo("prices"));
            }}
          />
          <PricesSection key={selected} categories={rows} selected={selected} onSelect={setPicked} example={example} onExample={setExample} />
          <Loaded path="/admin/pricing/fuel">{(fuel) => <FuelEditor fuel={fuel} categories={rows} />}</Loaded>
          <Loaded path="/admin/incentives/config">{(config) => <NightEditor config={config} categories={rows} exampleFare={exampleFare} />}</Loaded>
        </div>
      </StateView>
    </div>
  );
}
