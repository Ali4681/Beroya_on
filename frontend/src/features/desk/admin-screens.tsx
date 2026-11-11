"use client";

import { grantDecision, grantRewardTitle, grantStreakLine, localeTag, t } from "@/features/desk/i18n/t";

import { CalendarDays, Check, ChevronLeft, Flame, Gift, Globe, Hourglass, MapPin, PartyPopper, Pencil, Percent, Plus, Sparkles, Stamp, UserPlus, Users, X } from "lucide";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/shared/ui/icon";

import { auditActionLabel, auditEntityHref, auditEntityLabel } from "@/features/desk/audit-labels";
import { useDesk } from "@/features/desk/desk-context";
import { goFailure, isGoFailure, useGo, useGoList, useGoRecord } from "@/features/desk/hooks";
import { StreakRewards } from "@/features/desk/passport-rewards";
import { enumLabel, entityName, formatMoney, formatScalar, headline, labelOf } from "@/features/desk/present";
import { DetailScreen, ListScreen, NamedSelect } from "@/features/desk/resource";
import { ChoiceSelect, EnumSelect, SearchMultiSelect, SearchSelect } from "@/features/desk/select";
import { STAFF_ENUMS } from "@/features/desk/enums";
import { Choice } from "@/features/desk/settings-kit";
import { isWorldLanguageCode, languageLabel, normalizeLanguageCode, worldLanguageOptions } from "@/features/desk/world-languages";
import { useConfirm } from "@/features/desk/confirm";
import {
  CheckField,
  DateField,
  FormDialog,
  isValidPlateNumber,
  PlateInput,
  sanitizePlateNumber,
  TimeField,
} from "@/features/desk/controls";
import { readSession } from "@/features/desk/session";
import { BranchCenterField, ServiceAreaField } from "@/features/desk/service-area-map";
import { DriverScoreCard } from "@/features/desk/driver-scores-screens";
import { DriverGrantsCard } from "@/features/desk/incentive-grants-screens";
import { BusyMark, btnDark, btnGhost, btnGhostSm, btnPrimary, ChipCount, chipActive, chipClass, chipGroup, DeskForm, EmptyState, Field, FormCard, FormGrid, FormSpan, inputClass, Notice, PageTitle, Panel, PanelHeader, StateView, StatusBadge } from "@/features/desk/ui";

type DriverKind = "EXTERNAL" | "BEROYA";

function serviceArea(form: FormData) {
  const raw = String(form.get("service_area") ?? "").trim();
  if (!raw) return { value: undefined as Record<string, unknown> | null | undefined };
  if (raw === "incomplete") return { error: t("أضف ثلاث نقاط على الأقل على الخريطة.") };
  if (raw === "null") return { value: null };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: t("أضف ثلاث نقاط على الأقل على الخريطة.") };
    return { value: parsed as Record<string, unknown> };
  } catch {
    return { error: t("أضف ثلاث نقاط على الأقل على الخريطة.") };
  }
}

function relatedId(row: Record<string, unknown>, key: string) {
  if (typeof row[key] === "string") return row[key];
  const nested = row[key.replace(/_id$/, "")];
  if (nested && typeof nested === "object" && "id" in nested && typeof nested.id === "string") return nested.id;
  return "";
}

export function BranchesScreen() {
  const call = useGo();
  const [areaError, setAreaError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <ListScreen
        title={t("الفروع")}
        hint={t("الرمز أحرف كبيرة أو أرقام أو شرطة سفلية. حدود الخدمة تُرسم بالنقر على الخريطة داخل صفحة الفرع.")}
        path="/admin/branches"
        flags={[{ name: "active_only", label: t("النشطة فقط") }]}
        rowHref={(row) => (typeof row.id === "string" ? `/admin/branches/${row.id}` : null)}
        action={<button className={btnPrimary} type="button" onClick={() => setCreating(true)}>{t("إضافة فرع")}</button>}
      />
      <FormDialog open={creating} title={t("فرع جديد")} onClose={() => setCreating(false)}>
        <DeskForm className="grid gap-3 md:grid-cols-2" action={async (form) => {
          const area = serviceArea(form);
          if (area.error) {
            setAreaError(area.error);
            return;
          }
          setAreaError(null);
          const saved = await call("/admin/branches", { method: "POST", body: { code: String(form.get("code")), name_ar: String(form.get("name_ar")), name_en: textOrUndefined(form.get("name_en")), is_active: form.get("is_active") === "on", service_area: area.value } });
          if (!isGoFailure(saved)) setCreating(false);
        }}>
          <Field label={t("الرمز")}><input className={inputClass} name="code" required /></Field>
          <Field label={t("الاسم العربي")}><input className={inputClass} name="name_ar" required /></Field>
          <Field label={t("الاسم بالإنكليزية")}><input className={inputClass} name="name_en" /></Field>
          <CheckField name="is_active" label={t("نشط")} defaultChecked />
          <div className="md:col-span-2">
            <p className="mb-1.5 text-[13px] font-medium text-body">{t("منطقة الخدمة")}</p>
            <ServiceAreaField />
          </div>
          {areaError ? <Notice>{areaError}</Notice> : null}
          <button className={btnDark} type="submit">{t("حفظ الفرع")}</button>
        </DeskForm>
      </FormDialog>
    </>
  );
}

export function BranchDetail({ branchId }: { branchId: string }) {
  const call = useGo();
  const [areaError, setAreaError] = useState<string | null>(null);
  return (
    <DetailScreen title={t("فرع")} path={`/admin/branches/${branchId}`}>
      {(branch) => (
        <DeskForm key={String(branch.updated_at ?? branch.id ?? branchId)} action={(form) => {
          const area = serviceArea(form);
          if (area.error) {
            setAreaError(area.error);
            return;
          }
          setAreaError(null);
          const centerLat = String(form.get("center_lat") ?? "").trim();
          const centerLng = String(form.get("center_lng") ?? "").trim();
          return call(`/admin/branches/${branchId}`, {
            method: "PATCH",
            body: {
              name_ar: textOrUndefined(form.get("name_ar")),
              name_en: textOrUndefined(form.get("name_en")),
              is_active: form.get("is_active") === "on",
              service_area: area.value,
              center_lat: centerLat ? Number(centerLat) : null,
              center_lng: centerLng ? Number(centerLng) : null,
            },
          });
        }}>
          <FormCard title={t("بيانات الفرع")} footer={<button className={btnDark} type="submit">{t("تحديث الفرع")}</button>}>
            <FormGrid>
              <Field label={t("الاسم العربي")}><input className={inputClass} name="name_ar" defaultValue={typeof branch.name_ar === "string" ? branch.name_ar : ""} /></Field>
              <Field label={t("الاسم بالإنكليزية")}><input className={inputClass} name="name_en" defaultValue={typeof branch.name_en === "string" ? branch.name_en : ""} /></Field>
              <CheckField name="is_active" label={t("نشط")} defaultChecked={branch.is_active !== false} />
              <FormSpan>
                <p className="mb-1.5 text-[13px] font-medium text-body">{t("منطقة الخدمة")}</p>
                <ServiceAreaField value={branch.service_area} />
              </FormSpan>
              <FormSpan>
                <p className="mb-1.5 text-[13px] font-medium text-body">{t("مركز المحافظة")}</p>
                <BranchCenterField area={branch.service_area} center={{ lat: branch.center_lat, lng: branch.center_lng }} fallback={branch.service_area_center} />
              </FormSpan>
            </FormGrid>
            {areaError ? <Notice>{areaError}</Notice> : null}
          </FormCard>
        </DeskForm>
      )}
    </DetailScreen>
  );
}

export function CategoryDetail({ categoryId }: { categoryId: string }) {
  const call = useGo();
  const confirm = useConfirm();
  const router = useRouter();
  return (
    <DetailScreen title={t("فئة")} path={`/admin/ride-categories/${categoryId}`} facts="none">
      {(picked) => {
        const imagePath = typeof picked.image_url === "string" && picked.image_url.trim()
          ? `/api/proxy${picked.image_url.startsWith("/") ? picked.image_url : `/${picked.image_url}`}`
          : null;
        return (
        <div className="grid gap-4">
          <DeskForm
            key={String(picked.updated_at ?? picked.id ?? categoryId)}
            action={async (form) => {
              const uploaded = await optionalImage(form, "image");
              if (!uploaded.ok) return;
              return call(`/admin/ride-categories/${categoryId}`, {
                method: "PATCH",
                body: {
                  name_ar: String(form.get("name_ar") || "") || undefined,
                  name_en: String(form.get("name_en") || "") || undefined,
                  sort_order: form.get("sort_order") ? Number(form.get("sort_order")) : undefined,
                  max_passengers: form.get("max_passengers") ? Number(form.get("max_passengers")) : undefined,
                  is_active: form.get("is_active") === "on",
                  ...(uploaded.image ? { image: uploaded.image } : form.get("remove_image") === "on" ? { remove_image: true } : {}),
                },
              });
            }}
          >
            <FormCard
              title={t("بيانات الفئة")}
              hint={typeof picked.code === "string" ? `${t("الرمز")}: ${picked.code}` : undefined}
              footer={<button className={btnDark} type="submit">{t("حفظ الفئة")}</button>}
            >
              <FormGrid>
                <Field label={t("الاسم")}><input className={inputClass} name="name_ar" defaultValue={typeof picked.name_ar === "string" ? picked.name_ar : ""} /></Field>
                <Field label={t("الاسم بالإنكليزية")}><input className={inputClass} name="name_en" defaultValue={typeof picked.name_en === "string" ? picked.name_en : ""} /></Field>
                <Field label={t("الترتيب")}><input className={inputClass} name="sort_order" defaultValue={picked.sort_order == null ? "" : String(picked.sort_order)} /></Field>
                <Field label={t("أقصى عدد ركاب")}><input className={inputClass} name="max_passengers" inputMode="numeric" defaultValue={picked.max_passengers == null ? "4" : String(picked.max_passengers)} /></Field>
                <CheckField name="is_active" label={t("نشطة")} defaultChecked={picked.is_active !== false} />
                <FormSpan>
                  <Field label={t("صورة الفئة")}>
                    <div className="grid gap-2">
                      {imagePath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imagePath} alt="" className="h-28 w-full max-w-xs rounded-xl border border-line object-cover" />
                      ) : null}
                      <input className={fileClass} type="file" accept="image/jpeg,image/png,image/webp" name="image" />
                      <p className="text-xs text-muted">{t("اترك الحقل فارغاً للإبقاء على الصورة الحالية.")}</p>
                      {imagePath ? <CheckField name="remove_image" label={t("إزالة الصورة الحالية")} /> : null}
                    </div>
                  </Field>
                </FormSpan>
              </FormGrid>
            </FormCard>
          </DeskForm>
          <FormCard
            title={t("حذف الفئة")}
            hint={t("تُحذف الفئة نهائياً إن لم تُستخدم في رحلات أو مركبات. إن كانت مستخدمة فأخفِها بدل الحذف.")}
            footer={
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 text-sm font-semibold text-danger-ink transition-colors hover:bg-danger/15"
                type="button"
                onClick={() =>
                  void confirm({
                    title: t("حذف الفئة"),
                    body: t("تُحذف الفئة نهائياً إن لم تُستخدم في رحلات أو مركبات. إن كانت مستخدمة فأخفِها بدل الحذف."),
                    confirm: t("حذف"),
                    danger: true,
                    perform: async () => {
                      const result = await call(`/admin/ride-categories/${categoryId}`, { method: "DELETE" });
                      if (!isGoFailure(result)) router.push("/admin/categories");
                    },
                  })
                }
              >
                {t("حذف الفئة")}
              </button>
            }
          >
            <p className="text-sm text-muted">{t("الحذف لا يمكن التراجع عنه.")}</p>
          </FormCard>
        </div>
        );
      }}
    </DetailScreen>
  );
}

const DRIVER_DOCUMENTS = [
  { type: "LICENSE", expires: true },
  { type: "VEHICLE_REGISTRATION", expires: true },
  { type: "INSURANCE", expires: true },
  { type: "IDENTITY", expires: false },
] as const;

const VEHICLE_DOCUMENT_TYPES = new Set(["VEHICLE_REGISTRATION", "INSURANCE"]);

const VEHICLE_ONBOARDING_DOCUMENTS = [
  { type: "VEHICLE_REGISTRATION", expires: true },
  { type: "INSURANCE", expires: true },
] as const;

function documentsForKind(kind: DriverKind) {
  return kind === "BEROYA"
    ? DRIVER_DOCUMENTS.filter((doc) => !VEHICLE_DOCUMENT_TYPES.has(doc.type))
    : [...DRIVER_DOCUMENTS];
}

const fileClass =
  "block w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm text-body file:me-3 file:rounded-md file:border-0 file:bg-teal file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-on-teal";

function loginPhone(raw: string) {
  let phone = raw.trim();
  phone = phone.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  phone = phone.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  phone = phone.replace(/[^\d+]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  else if (phone.startsWith("0")) phone = `+963${phone.slice(1)}`;
  else if (phone.startsWith("963")) phone = `+${phone}`;
  else if (phone && !phone.startsWith("+")) phone = `+${phone}`;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

async function documentImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function textOrUndefined(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function localPhone(phone: string) {
  return phone.startsWith("+963") ? `0${phone.slice(4)}` : phone;
}

function DriverEditor({ driver }: { driver: Record<string, unknown> }) {
  const call = useGo();
  const [editing, setEditing] = useState(false);
  const [photoRev, setPhotoRev] = useState(0);
  const initialMother = driverMotherTongue(driver);
  const [motherTongue, setMotherTongue] = useState(initialMother);
  const [otherLanguages, setOtherLanguages] = useState(() => driverOtherLanguages(driver, initialMother));
  const id = String(driver.id);
  const user = driver.user && typeof driver.user === "object" ? driver.user as Record<string, unknown> : null;
  const accountOn = !user || user.is_active !== false;
  const loginPhone = typeof user?.phone === "string" ? localPhone(user.phone) : "";
  return (
    <div className="grid gap-5">
      {editing ? (
        <DeskForm
          key={`${id}-edit`}
          action={async (form) => {
            const phone = textOrUndefined(form.get("phone"));
            const saved = await call(`/admin/drivers/${id}`, {
              method: "PATCH",
              body: {
                phone: phone && phone !== loginPhone ? phone : undefined,
                full_name: textOrUndefined(form.get("full_name")),
                branch_id: textOrUndefined(form.get("branch_id")) ?? null,
                gender: textOrUndefined(form.get("gender")),
                date_of_birth: (() => {
                  const raw = textOrUndefined(form.get("date_of_birth"));
                  return raw ? raw.slice(0, 10) : null;
                })(),
                mother_tongue: motherTongue,
                languages: otherLanguages,
                is_suspended: form.get("is_suspended") === "on",
                suspended_reason: textOrUndefined(form.get("suspended_reason")) ?? null,
                operational_blocked: form.get("operational_blocked") === "on",
                operational_reason: textOrUndefined(form.get("operational_reason")) ?? null,
                active_vehicle_id: textOrUndefined(form.get("active_vehicle_id")) ?? null,
                user_is_active: form.get("user_is_active") === "on",
              },
            });
            if (!isGoFailure(saved)) setEditing(false);
          }}
        >
          <FormCard
            title={`${t("ملف السائق")} · ${headline(driver)}`}
            footer={
              <>
                <button className={btnGhost} type="button" onClick={() => setEditing(false)}>{t("إلغاء")}</button>
                <button className={btnDark} type="submit">{t("حفظ ملف السائق")}</button>
              </>
            }
          >
            <FormGrid>
              <Field label={t("الاسم")}><input className={inputClass} name="full_name" defaultValue={typeof driver.full_name === "string" ? driver.full_name : headline(driver)} /></Field>
              <Field label={t("رقم الدخول (الهاتف)")}>
                <input className={inputClass} name="phone" dir="ltr" inputMode="tel" autoComplete="off" placeholder="09XXXXXXXX" defaultValue={loginPhone} />
                <span className="text-xs leading-5 text-muted">{t("تغيير الرقم يسجّل خروج السائق من كل الأجهزة، ويدخل بعدها برمز يصل إلى الرقم الجديد.")}</span>
              </Field>
              <NamedSelect path="/erp/branches" name="branch_id" label={t("الفرع")} placeholder={t("بدون فرع")} defaultValue={relatedId(driver, "branch_id")} />
              <Field label={t("الجنس")}><EnumSelect kind="driverGender" name="gender" defaultValue={typeof driver.gender === "string" ? driver.gender : ""} allowEmpty emptyLabel={t("بدون تغيير")} /></Field>
              <DateField
                name="date_of_birth"
                label={t("تاريخ الميلاد")}
                defaultValue={typeof driver.date_of_birth === "string" ? driver.date_of_birth.slice(0, 10) : ""}
              />
              <Field label={t("لغة الأم")}>
                <SearchSelect
                  name="mother_tongue"
                  required
                  value={motherTongue}
                  placeholder={t("اختر لغة الأم")}
                  searchPlaceholder={t("ابحث عن لغة")}
                  options={worldLanguageOptions()}
                  onValueChange={(next) => {
                    setMotherTongue(next);
                    setOtherLanguages((current) => current.filter((item) => item !== next));
                  }}
                />
              </Field>
              <FormSpan>
                <p className="mb-1.5 text-[13px] font-medium text-body">{t("لغات أخرى")}</p>
                <SearchMultiSelect
                  name="languages"
                  value={otherLanguages}
                  onValueChange={setOtherLanguages}
                  placeholder={t("اختر لغات إضافية")}
                  searchPlaceholder={t("ابحث عن لغة")}
                  options={worldLanguageOptions(motherTongue)}
                />
              </FormSpan>
              <NamedSelect path="/erp/vehicles" name="active_vehicle_id" label={t("المركبة الحالية")} placeholder={t("بدون مركبة")} defaultValue={relatedId(driver, "active_vehicle_id")} />
              <Field label={t("سبب الإيقاف")}><input className={inputClass} name="suspended_reason" defaultValue={typeof driver.suspended_reason === "string" ? driver.suspended_reason : ""} /></Field>
              <Field label={t("سبب الحظر التشغيلي")}><input className={inputClass} name="operational_reason" defaultValue={typeof driver.operational_reason === "string" ? driver.operational_reason : ""} /></Field>
              <CheckField name="is_suspended" label={t("موقوف")} defaultChecked={driver.is_suspended === true} />
              <CheckField name="operational_blocked" label={t("حظر تشغيلي")} defaultChecked={driver.operational_blocked === true} />
              <CheckField name="user_is_active" label={t("الحساب نشط")} defaultChecked={accountOn} />
            </FormGrid>
          </FormCard>
        </DeskForm>
      ) : (
        <FormCard
          title={`${t("ملف السائق")} · ${headline(driver)}`}
          action={<button className={btnPrimary} type="button" onClick={() => {
            const mother = driverMotherTongue(driver);
            setMotherTongue(mother);
            setOtherLanguages(driverOtherLanguages(driver, mother));
            setEditing(true);
          }}><Icon node={Pencil} size={16} />{t("تعديل")}</button>}
        >
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DriverReadField label={t("الاسم")} value={typeof driver.full_name === "string" ? driver.full_name : headline(driver)} />
            <DriverReadField
              label={t("نوع السائق")}
              value={driver.kind === "BEROYA" ? t("سائق بيرويا") : t("سائق خارجي")}
            />
            <DriverReadField label={t("رقم الدخول (الهاتف)")} value={loginPhone} ltr />
            <DriverReadField label={t("الفرع")} value={entityName(driver.branch) ?? t("بدون فرع")} />
            <DriverReadField label={t("الجنس")} value={typeof driver.gender === "string" && driver.gender ? enumLabel(driver.gender) : "—"} />
            <DriverReadField
              label={t("تاريخ الميلاد")}
              value={typeof driver.date_of_birth === "string" && driver.date_of_birth ? driver.date_of_birth.slice(0, 10) : "—"}
            />
            <DriverReadField label={t("لغة الأم")} value={languageLabel(driverMotherTongue(driver))} />
            <DriverReadField
              label={t("لغات أخرى")}
              value={(() => {
                const others = driverOtherLanguages(driver, driverMotherTongue(driver));
                return others.length ? languageLabelList(others) : t("لا يوجد");
              })()}
            />
            <DriverReadField label={t("المركبة الحالية")} value={entityName(driver.active_vehicle) ?? t("بدون مركبة")} />
            <DriverReadField label={t("فئات الخدمة")} value={vehicleCategoryName(driver.active_vehicle) ?? t("بدون فئة")} />
            <DriverReadField label={t("سبب الإيقاف")} value={typeof driver.suspended_reason === "string" ? driver.suspended_reason : "—"} />
            <DriverReadField label={t("سبب الحظر التشغيلي")} value={typeof driver.operational_reason === "string" ? driver.operational_reason : "—"} />
            <DriverReadField label={t("موقوف")} badge={driver.is_suspended === true ? "INACTIVE" : "ACTIVE"} badgeLabel={driver.is_suspended === true ? t("نعم") : t("لا")} />
            <DriverReadField label={t("حظر تشغيلي")} badge={driver.operational_blocked === true ? "INACTIVE" : "ACTIVE"} badgeLabel={driver.operational_blocked === true ? t("نعم") : t("لا")} />
            <DriverReadField label={t("الحساب نشط")} badge={accountOn ? "ACTIVE" : "INACTIVE"} badgeLabel={accountOn ? t("نعم") : t("لا")} />
          </dl>
        </FormCard>
      )}
      <ProfileWalletCard
        title={t("محفظة السائق")}
        wallet={driver.wallet}
        outstanding
        href={`/erp/wallets/driver/${id}`}
      />
      <FormCard title={t("الوثائق")} action={<DocumentForm driverId={id} onSaved={() => setPhotoRev((value) => value + 1)} />}>
        <DriverFacts driverId={id} driver={driver} photoRev={photoRev} onDocumentSaved={() => setPhotoRev((value) => value + 1)} />
      </FormCard>
      <FormCard title={t("صور السيارة")} hint={t("الصور المرفوعة عند إنشاء الحساب.")}>
        <DriverVehiclePhotos driverId={id} driver={driver} rev={photoRev} />
      </FormCard>
      <DriverScoreCard driverId={id} />
      <DriverGrantsCard driverId={id} />
    </div>
  );
}

function DriverVehiclePhotos({ driverId, driver, rev = 0 }: { driverId: string; driver: Record<string, unknown>; rev?: number }) {
  const photos = Array.isArray(driver.vehicle_photos)
    ? driver.vehicle_photos.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && typeof item.id === "string")
    : [];
  if (!photos.length) {
    return <p className="text-sm text-muted">{t("لا توجد صور سيارة لهذا السائق.")}</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((photo) => (
        <DriverVehiclePhoto key={String(photo.id)} driverId={driverId} photoId={String(photo.id)} rev={rev} />
      ))}
    </div>
  );
}

function DriverReadField({ label, value, badge, badgeLabel, ltr }: { label: string; value?: string; badge?: string; badgeLabel?: string; ltr?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-heading">
        {badge ? <StatusBadge value={badge} label={badgeLabel} /> : ltr && value ? <bdi className="phone-ltr" dir="ltr" data-phone="">{value}</bdi> : (value || "—")}
      </dd>
    </div>
  );
}

function walletAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function ProfileWalletCard({
  title,
  wallet,
  outstanding = false,
  href,
}: {
  title: string;
  wallet: unknown;
  outstanding?: boolean;
  href?: string;
}) {
  const row = wallet && typeof wallet === "object" ? (wallet as Record<string, unknown>) : null;
  const balance = walletAmount(row?.balance);
  const due = outstanding ? walletAmount(row?.outstanding_due) : null;
  return (
    <FormCard
      title={title}
      action={
        href ? (
          <Link className={btnGhostSm} href={href}>
            {t("فتح المحفظة")}
          </Link>
        ) : null
      }
    >
      {row && balance != null ? (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DriverReadField label={t("الرصيد")} value={formatMoney(balance)} />
          {due != null ? <DriverReadField label={t("المبلغ المستحق")} value={formatMoney(due)} /> : null}
        </dl>
      ) : (
        <Notice>{t("لا توجد محفظة بعد. أول إيداع ينشئها.")}</Notice>
      )}
    </FormCard>
  );
}

function documentActive(expiresAt: unknown) {
  if (typeof expiresAt !== "string" || !expiresAt) return true;
  const match = expiresAt.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return true;
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return day.getTime() >= today.getTime();
}

function DriverFacts({ driverId, driver, photoRev = 0, onDocumentSaved }: { driverId: string; driver: Record<string, unknown>; photoRev?: number; onDocumentSaved?: () => void }) {
  const eligibility = useGoRecord(`/erp/drivers/${driverId}/eligibility`);
  const documents = Array.isArray(driver.documents) ? driver.documents.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
  const reasons = Array.isArray(eligibility.data?.reasons) ? eligibility.data.reasons.filter((item): item is string => typeof item === "string") : [];
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2 text-sm">
        {eligibility.data?.eligible === true ? <StatusBadge value="ACTIVE" label={t("مؤهل")} /> : <StatusBadge value="REJECTED" label={t("غير مؤهل")} />}
        {reasons.map((reason) => <span key={reason} className="text-xs text-muted">{enumLabel(reason)}</span>)}
      </div>
      {eligibility.data?.eligible === true ? null : (
        <p className="text-sm leading-6 text-muted">{t("للتأهيل يلزم رخصة قيادة وتسجيل مركبة ساريان، ومركبة حالية، ورصيد كاف في المحفظة.")}</p>
      )}
      {documents.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-sm font-semibold">{t("الوثائق")}</p>
          {documents.map((document) => {
            const type = typeof document.type === "string" ? document.type : "";
            const expires = type !== "IDENTITY" && typeof document.expires_at === "string" ? document.expires_at : "";
            const active = type === "IDENTITY" ? true : documentActive(document.expires_at);
            return (
              <div key={String(document.id ?? type)} className="grid gap-3 rounded-xl border border-line p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {type && typeof document.image_key === "string" ? (
                    <div className="grid content-start gap-1.5">
                      <p className="text-xs font-medium text-muted">{t("الوجه الأمامي")}</p>
                      <DocumentPhoto driverId={driverId} type={type} side="front" rev={photoRev} />
                    </div>
                  ) : null}
                  {type && typeof document.image_back_key === "string" ? (
                    <div className="grid content-start gap-1.5">
                      <p className="text-xs font-medium text-muted">{t("الوجه الخلفي")}</p>
                      <DocumentPhoto driverId={driverId} type={type} side="back" rev={photoRev} />
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-heading">{type ? enumLabel(type) : t("وثيقة")}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge value={active ? "ACTIVE" : "INACTIVE"} label={active ? t("مفعّلة") : t("غير مفعّلة")} />
                    {expires ? <span className="text-muted">{expires.slice(0, 10)}</span> : null}
                    <DocumentForm driverId={driverId} document={document} onSaved={onDocumentSaved} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : <Notice>{t("لا توجد وثائق مسجلة بعد.")}</Notice>}
    </div>
  );
}

function categoryDisplayName(category: unknown) {
  if (!category || typeof category !== "object") return null;
  const row = category as Record<string, unknown>;
  if (typeof row.name_ar === "string" && row.name_ar) return row.name_ar;
  if (typeof row.name_en === "string" && row.name_en) return row.name_en;
  if (typeof row.code === "string" && row.code) return row.code;
  return null;
}

function vehicleCategoryName(vehicle: unknown) {
  if (!vehicle || typeof vehicle !== "object") return null;
  const row = vehicle as Record<string, unknown>;
  const names: string[] = [];
  if (Array.isArray(row.ride_categories)) {
    for (const link of row.ride_categories) {
      if (!link || typeof link !== "object") continue;
      const name = categoryDisplayName((link as Record<string, unknown>).ride_category);
      if (name && !names.includes(name)) names.push(name);
    }
  }
  if (!names.length) {
    const singular = categoryDisplayName(row.ride_category);
    if (singular) names.push(singular);
  }
  return names.length ? names.join(" · ") : null;
}

function selectedVehicleCategoryIds(row: Record<string, unknown>) {
  const ids = new Set<string>();
  if (Array.isArray(row.ride_categories)) {
    for (const link of row.ride_categories) {
      if (!link || typeof link !== "object") continue;
      const item = link as Record<string, unknown>;
      if (typeof item.ride_category_id === "string" && item.ride_category_id) ids.add(item.ride_category_id);
      else if (item.ride_category && typeof item.ride_category === "object") {
        const id = (item.ride_category as Record<string, unknown>).id;
        if (typeof id === "string" && id) ids.add(id);
      }
    }
  }
  const singular = relatedId(row, "ride_category_id");
  if (singular) ids.add(singular);
  return ids;
}

function VehicleCategoriesField({
  selected,
  required = false,
  disabled = false,
}: {
  selected?: Set<string>;
  required?: boolean;
  disabled?: boolean;
}) {
  const categories = useGoList("/admin/ride-categories", { limit: 100 });
  const items = (categories.data ?? []).filter((item) => item.is_active !== false);
  const [picked, setPicked] = useState(() => new Set(selected ?? []));
  return (
    <FormSpan>
      <p className="mb-1.5 text-[13px] font-medium text-body">{t("فئات الخدمة")}</p>
      {Array.from(picked).map((id) => (
        <input key={id} type="hidden" name="ride_category_ids" value={id} />
      ))}
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const id = String(item.id);
          const active = picked.has(id);
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              className={`inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
                active ? "bg-teal text-on-teal shadow-glow" : "border border-line bg-heading/[0.03] text-heading hover:border-teal/45"
              }`}
              onClick={() =>
                setPicked((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
            >
              {headline(item)}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs leading-5 text-muted">
        {required
          ? t("اختر فئة واحدة أو أكثر. السائق يظهر لطلبات أي فئة مختارة.")
          : t("اختر فئة واحدة أو أكثر.")}
      </p>
    </FormSpan>
  );
}

function driverMotherTongue(driver: Record<string, unknown>) {
  if (typeof driver.mother_tongue === "string") {
    const code = normalizeLanguageCode(driver.mother_tongue);
    if (isWorldLanguageCode(code)) return code;
  }
  if (Array.isArray(driver.languages)) {
    const first = driver.languages.find((item): item is string => typeof item === "string" && isWorldLanguageCode(normalizeLanguageCode(item)));
    if (first) return normalizeLanguageCode(first);
  }
  return "ar";
}

function driverOtherLanguages(driver: Record<string, unknown>, motherTongue: string) {
  if (!Array.isArray(driver.languages)) return [] as string[];
  return driver.languages
    .filter((item): item is string => typeof item === "string")
    .map(normalizeLanguageCode)
    .filter((code) => code !== motherTongue && isWorldLanguageCode(code));
}

function languageLabelList(codes: string[]) {
  return codes.map((code) => languageLabel(code)).join(" · ");
}

function capabilityValues(form: FormData) {
  return form.getAll("capabilities").map(String).filter((value) => STAFF_ENUMS.vehicleCapability.includes(value as (typeof STAFF_ENUMS.vehicleCapability)[number]));
}

function selectedCapabilities(row: Record<string, unknown>) {
  if (!Array.isArray(row.capabilities)) return new Set<string>();
  return new Set(row.capabilities.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object" && "type" in item && typeof item.type === "string") return item.type;
    return "";
  }).filter(Boolean));
}

/** Passport stamp icons: strip near-black bg and keep PNG alpha (no opaque rectangle). */
async function stampIconImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  const threshold = 28;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] <= threshold && pixels[index + 1] <= threshold && pixels[index + 2] <= threshold) {
      pixels[index + 3] = 0;
    }
  }
  ctx.putImageData(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

async function readIcon(form: FormData) {
  const file = form.get("icon");
  if (!(file instanceof File) || file.size === 0) return { ok: true as const, icon: undefined };
  try {
    const icon = await stampIconImage(file);
    return icon ? { ok: true as const, icon } : { ok: false as const };
  } catch {
    return { ok: false as const };
  }
}

function LevelIcon({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const session = readSession();
    if (!session) return;
    let url: string | null = null;
    let cancelled = false;
    void fetch(`/api/proxy${path}`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
      .then(async (response) => {
        if (!response.ok) return;
        url = URL.createObjectURL(await response.blob());
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);
  if (!src) return null;
  return <img src={src} alt="" className="h-16 w-16 rounded-lg border border-line bg-transparent object-contain" />;
}

function IconField({ previewPath }: { previewPath?: string | null }) {
  return (
    <Field label={t("الأيقونة")}>
      <div className="grid gap-2">
        {previewPath ? <LevelIcon path={previewPath} /> : null}
        <input className={fileClass} type="file" accept="image/jpeg,image/png,image/webp" name="icon" />
        <p className="text-xs text-muted">{t("اترك الحقل فارغاً للإبقاء على الأيقونة الحالية.")}</p>
      </div>
    </Field>
  );
}

function DocumentPhoto({ driverId, type, side = "front", rev = 0 }: { driverId: string; type: string; side?: "front" | "back"; rev?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const session = readSession();
    if (!session) return;
    let url: string | null = null;
    let cancelled = false;
    const query = side === "back" ? "?side=back" : "";
    void fetch(`/api/proxy/api/v1/go/admin/drivers/${driverId}/documents/${type}/image${query}`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
      .then(async (response) => {
        if (!response.ok) return;
        url = URL.createObjectURL(await response.blob());
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [driverId, type, side, rev]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!src) return null;
  return (
    <>
      <button
        type="button"
        className="block w-full overflow-hidden rounded-lg border border-line text-start transition hover:ring-2 hover:ring-brand/40"
        aria-label={t("فتح الصورة")}
        onClick={() => setOpen(true)}
      >
        <img src={src} alt="" className="h-32 w-full object-cover" />
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div className="desk-fade fixed inset-0 z-[90] grid place-items-center bg-ink/75 p-6" onClick={() => setOpen(false)}>
          <div className="relative" onClick={(event) => event.stopPropagation()}>
            <button
              className="absolute top-3 end-3 z-10 grid size-10 place-items-center rounded-full bg-black text-white shadow-float ring-2 ring-white transition hover:bg-neutral-800"
              type="button"
              aria-label={t("إغلاق")}
              onClick={() => setOpen(false)}
            >
              <Icon node={X} size={20} strokeWidth={2.4} />
            </button>
            <img src={src} alt="" className="max-h-[90vh] max-w-[90vw] rounded-xl bg-canvas object-contain shadow-float" />
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

async function optionalImage(form: FormData, name: string) {
  const file = form.get(name);
  if (!(file instanceof File) || file.size === 0) return { ok: true as const, image: undefined };
  try {
    const image = await documentImage(file);
    return image ? { ok: true as const, image } : { ok: false as const };
  } catch {
    return { ok: false as const };
  }
}

const VEHICLE_PHOTO_MIN = 2;
const VEHICLE_PHOTO_MAX = 6;

function VehiclePhotosPicker({
  files,
  onChange,
  disabled = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [files]);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {previews.map((src, index) => (
          <div key={`${files[index]?.name}-${index}`} className="relative overflow-hidden rounded-xl border border-line bg-canvas">
            <img src={src} alt="" className="aspect-[4/3] w-full object-cover" />
            <button
              type="button"
              className="absolute top-2 end-2 grid size-8 place-items-center rounded-full bg-ink/75 text-white shadow-float transition hover:bg-ink"
              aria-label={t("حذف الصورة")}
              disabled={disabled}
              onClick={() => onChange(files.filter((_, item) => item !== index))}
            >
              <Icon node={X} size={16} strokeWidth={2.4} />
            </button>
            <span className="absolute bottom-2 start-2 rounded-md bg-ink/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
              {index + 1}
            </span>
          </div>
        ))}
        {files.length < VEHICLE_PHOTO_MAX ? (
          <label className={`grid aspect-[4/3] cursor-pointer place-items-center gap-1.5 rounded-xl border border-dashed border-line-strong bg-heading/[0.02] text-muted transition hover:border-teal/50 hover:bg-brand/[0.04] hover:text-accent ${disabled ? "pointer-events-none opacity-55" : ""}`}>
            <Icon node={Plus} size={22} />
            <span className="text-xs font-semibold">{t("إضافة صورة")}</span>
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={disabled}
              onChange={(event) => {
                const picked = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (!picked.length) return;
                onChange([...files, ...picked].slice(0, VEHICLE_PHOTO_MAX));
              }}
            />
          </label>
        ) : null}
      </div>
      <p className="text-xs leading-5 text-muted">
        {t("الصور")}: {files.length} / {VEHICLE_PHOTO_MAX} · {t("الحد الأدنى")} {VEHICLE_PHOTO_MIN}
      </p>
    </div>
  );
}

function DriverVehiclePhoto({ driverId, photoId, rev = 0 }: { driverId: string; photoId: string; rev?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const session = readSession();
    if (!session) return;
    let url: string | null = null;
    let cancelled = false;
    void fetch(`/api/proxy/api/v1/go/admin/drivers/${driverId}/vehicle-photos/${photoId}/image`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
      .then(async (response) => {
        if (!response.ok) return;
        url = URL.createObjectURL(await response.blob());
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [driverId, photoId, rev]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!src) return null;
  return (
    <>
      <button
        type="button"
        className="block w-full overflow-hidden rounded-lg border border-line text-start transition hover:ring-2 hover:ring-brand/40"
        aria-label={t("فتح الصورة")}
        onClick={() => setOpen(true)}
      >
        <img src={src} alt="" className="aspect-[4/3] w-full object-cover" />
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div className="desk-fade fixed inset-0 z-[90] grid place-items-center bg-ink/75 p-6" onClick={() => setOpen(false)}>
          <div className="relative" onClick={(event) => event.stopPropagation()}>
            <button
              className="absolute top-3 end-3 z-10 grid size-10 place-items-center rounded-full bg-black text-white shadow-float ring-2 ring-white transition hover:bg-neutral-800"
              type="button"
              aria-label={t("إغلاق")}
              onClick={() => setOpen(false)}
            >
              <Icon node={X} size={20} strokeWidth={2.4} />
            </button>
            <img src={src} alt="" className="max-h-[90vh] max-w-[90vw] rounded-xl bg-canvas object-contain shadow-float" />
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function DocumentPhotos({
  frontName,
  backName,
  driverId,
  type,
  frontRequired = true,
  rev = 0,
}: {
  frontName: string;
  backName: string;
  driverId?: string;
  type?: string;
  frontRequired?: boolean;
  rev?: number;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t("الوجه الأمامي")}>
        <div className="grid gap-2">
          {driverId && type ? <DocumentPhoto driverId={driverId} type={type} side="front" rev={rev} /> : null}
          <input className={fileClass} type="file" accept="image/jpeg,image/png,image/webp" name={frontName} required={frontRequired} />
          <p className="text-xs text-muted">{frontRequired ? t("مطلوب") : t("اترك الحقل فارغاً للإبقاء على الصورة الحالية.")}</p>
        </div>
      </Field>
      <Field label={t("الوجه الخلفي")}>
        <div className="grid gap-2">
          {driverId && type ? <DocumentPhoto driverId={driverId} type={type} side="back" rev={rev} /> : null}
          <input className={fileClass} type="file" accept="image/jpeg,image/png,image/webp" name={backName} />
          <p className="text-xs text-muted">{t("اختياري")}</p>
        </div>
      </Field>
    </div>
  );
}

function DocumentForm({
  driverId,
  document,
  onSaved,
}: {
  driverId: string;
  document?: Record<string, unknown>;
  onSaved?: () => void;
}) {
  const call = useGo();
  const editing = document != null;
  const initialType = typeof document?.type === "string" ? document.type : "LICENSE";
  const hasFront = typeof document?.image_key === "string" && document.image_key.length > 0;
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(initialType);
  const [fault, setFault] = useState<string | null>(null);
  return (
    <>
      <button
        className={editing ? btnGhostSm : btnPrimary}
        type="button"
        onClick={() => {
          setType(initialType);
          setFault(null);
          setOpen(true);
        }}
      >
        {editing ? t("تعديل") : t("إضافة وثيقة")}
      </button>
      <FormDialog open={open} title={editing ? t("تعديل الوثيقة") : t("وثيقة السائق")} onClose={() => setOpen(false)}>
        <DeskForm className="grid gap-3" action={async (form) => {
          setFault(null);
          const front = await optionalImage(form, "image_front");
          const back = await optionalImage(form, "image_back");
          if (!front.ok || !back.ok) {
            setFault(t("تعذّر قراءة صورة الوثيقة."));
            return;
          }
          if (!front.image && !hasFront) {
            setFault(t("صورة الوجه الأمامي مطلوبة."));
            return;
          }
          const expires = type === "IDENTITY" ? "" : String(form.get("expires_at") || "");
          if (type !== "IDENTITY" && !expires) {
            setFault(t("تاريخ الصلاحية مطلوب لهذه الوثيقة."));
            return;
          }
          const saved = await call(`/admin/drivers/${driverId}/documents`, {
            method: "POST",
            body: {
              type,
              image: front.image,
              image_back: back.image,
              expires_at: expires ? new Date(expires).toISOString() : undefined,
            },
          });
          if (!isGoFailure(saved)) {
            setOpen(false);
            onSaved?.();
          }
        }}>
          {editing ? (
            <p className="text-sm font-semibold text-heading">{enumLabel(type)}</p>
          ) : (
            <Field label={t("نوع الوثيقة")}><EnumSelect kind="documentType" name="type" value={type} onValueChange={setType} required /></Field>
          )}
          <DocumentPhotos
            frontName="image_front"
            backName="image_back"
            driverId={editing ? driverId : undefined}
            type={editing ? type : undefined}
            frontRequired={!hasFront}
          />
          {type === "IDENTITY" ? null : <DateField name="expires_at" label={t("انتهاء الصلاحية")} required defaultValue={typeof document?.expires_at === "string" ? document.expires_at : ""} />}
          {fault ? <Notice>{fault}</Notice> : null}
          <button className={btnDark} type="submit">{editing ? t("حفظ الوثيقة") : t("حفظ الوثيقة")}</button>
        </DeskForm>
      </FormDialog>
    </>
  );
}

export function VehiclesScreen() {
  return (
    <ListScreen
      title={t("المركبات")}
      hint={t("اضغط مركبة لفتح صفحة التفاصيل والتعديل. إضافة مركبة تشمل تسجيل المركبة والتأمين والفئات وصور السيارة.")}
      path="/erp/vehicles"
      lookups={[{ name: "branch_id", label: t("الفرع"), path: "/erp/branches" }]}
      rowHref={(row) => (typeof row.id === "string" ? `/admin/vehicles/${row.id}` : null)}
      action={<Link href="/admin/vehicles/new" className={btnPrimary}>{t("إضافة مركبة")}</Link>}
    />
  );
}

export function VehicleCreateScreen() {
  const router = useRouter();
  const call = useGo();
  const [fault, setFault] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [vehicleFiles, setVehicleFiles] = useState<File[]>([]);
  const docCount = VEHICLE_ONBOARDING_DOCUMENTS.length;
  const vehicleStep = docCount + 1;
  const photoStep = vehicleStep + 1;
  const last = photoStep;
  const labels = [
    t("البيانات"),
    ...VEHICLE_ONBOARDING_DOCUMENTS.map((doc) => enumLabel(doc.type)),
    t("المركبة والفئة"),
    t("صور السيارة"),
  ];
  const hints = [
    t("اربط المركبة بسائق، ثم أكمل وثائقها وصورها."),
    ...VEHICLE_ONBOARDING_DOCUMENTS.map((doc) =>
      doc.expires
        ? t("الوجه الأمامي وتاريخ الصلاحية مطلوبان. الوجه الخلفي اختياري.")
        : t("الوجه الأمامي مطلوب. الوجه الخلفي اختياري."),
    ),
    t("اختر فئة خدمة واحدة أو أكثر. السائق يظهر لطلبات أي فئة مختارة."),
    t("ارفع من صورتين إلى ست صور واضحة للسيارة."),
  ];
  const progress = saving ? 100 : (step / labels.length) * 100;

  return (
    <div className="relative grid gap-5">
      <header className="grid gap-3">
        <Link href="/admin/vehicles" className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-accent transition-colors hover:text-brand-strong">
          <Icon node={ChevronLeft} size={15} className="rtl:rotate-180" />
          {t("العودة إلى القائمة")}
        </Link>
        <PageTitle
          title={t("مركبة جديدة")}
          hint={t("أكمل تسجيل المركبة والتأمين والفئات وصور السيارة خطوة بخطوة، واربطها بسائق.")}
        />
      </header>

      <nav aria-label={t("خطوات إضافة المركبة")} className="grid gap-3">
        <div className="relative h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className="absolute inset-y-0 start-0 rounded-full bg-gradient-to-l from-brand to-teal transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <ol className="flex flex-wrap gap-2">
          {labels.map((label, index) => {
            const active = !saving && index === step;
            const done = saving || index < step;
            return (
              <li key={label}>
                <button
                  type="button"
                  disabled={saving || (!done && !active)}
                  aria-current={active ? "step" : undefined}
                  onClick={() => {
                    if (saving || !done) return;
                    setFault(null);
                    setStep(index);
                  }}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-brand/12 font-semibold text-accent ring-1 ring-inset ring-brand/30"
                      : done
                        ? "bg-teal/10 font-medium text-teal hover:bg-teal/15"
                        : "bg-heading/[0.03] text-muted"
                  }`}
                >
                  <span
                    className={`grid size-6 place-items-center rounded-full text-[11px] font-bold ${
                      active
                        ? "bg-brand text-on-brand"
                        : done
                          ? "bg-teal text-on-teal"
                          : "bg-surface text-muted ring-1 ring-inset ring-line"
                    }`}
                  >
                    {done ? <Icon node={Check} size={13} strokeWidth={2.6} /> : index + 1}
                  </span>
                  {label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <DeskForm
        className="grid gap-5"
        action={async (form) => {
          setFault(null);
          if (step === 0) {
            if (!String(form.get("driver_id") || "").trim()) {
              setFault(t("اختر السائق المرتبط بالمركبة."));
              return;
            }
            const plate = String(form.get("plate_number") || "").trim();
            if (!plate) {
              setFault(t("أدخل رقم لوحة المركبة."));
              return;
            }
            if (!isValidPlateNumber(plate)) {
              setFault(t("رقم اللوحة يقبل أرقاماً و / و \\ فقط."));
              return;
            }
            setStep(1);
            return;
          }
          if (step >= 1 && step <= docCount) {
            const doc = VEHICLE_ONBOARDING_DOCUMENTS[step - 1];
            const front = await optionalImage(form, `image_front_${doc.type}`);
            const back = await optionalImage(form, `image_back_${doc.type}`);
            if (!front.ok || !back.ok) {
              setFault(t("تعذّر قراءة صورة الوثيقة."));
              return;
            }
            if (!front.image) {
              setFault(t("صورة الوجه الأمامي مطلوبة."));
              return;
            }
            if (doc.expires && !String(form.get(`expires_${doc.type}`) || "").trim()) {
              setFault(t("تاريخ الصلاحية مطلوب لهذه الوثيقة."));
              return;
            }
            setStep(step + 1);
            return;
          }
          if (step === vehicleStep) {
            if (!categoryIds(form)?.length) {
              setFault(t("اختر فئة خدمة واحدة على الأقل للمركبة."));
              return;
            }
            setStep(photoStep);
            return;
          }
          if (vehicleFiles.length < VEHICLE_PHOTO_MIN) {
            setFault(t("ارفع صورتين للسيارة على الأقل."));
            return;
          }
          if (vehicleFiles.length > VEHICLE_PHOTO_MAX) {
            setFault(t("الحد الأقصى لصور السيارة ست صور."));
            return;
          }

          const documents = [];
          for (const doc of VEHICLE_ONBOARDING_DOCUMENTS) {
            const front = await optionalImage(form, `image_front_${doc.type}`);
            const back = await optionalImage(form, `image_back_${doc.type}`);
            if (!front.ok || !back.ok || !front.image) {
              setFault(t("تعذّر قراءة صورة الوثيقة."));
              return;
            }
            const expires = String(form.get(`expires_${doc.type}`) || "");
            if (!expires.trim()) {
              setFault(t("تاريخ الصلاحية مطلوب لهذه الوثيقة."));
              return;
            }
            documents.push({
              type: doc.type,
              image: front.image,
              image_back: back.image,
              expires_at: new Date(expires).toISOString(),
            });
          }

          const ride_category_ids = categoryIds(form);
          const plate_number = sanitizePlateNumber(String(form.get("plate_number") || "")).trim();
          const driver_id = String(form.get("driver_id") || "").trim();
          if (!driver_id || !plate_number || !ride_category_ids?.length) {
            setFault(t("أكمل بيانات المركبة والفئة."));
            setStep(0);
            return;
          }

          const vehicle_photos: string[] = [];
          for (const file of vehicleFiles) {
            try {
              const image = await documentImage(file);
              if (!image) {
                setFault(t("تعذّر قراءة إحدى صور السيارة."));
                return;
              }
              vehicle_photos.push(image);
            } catch {
              setFault(t("تعذّر قراءة إحدى صور السيارة."));
              return;
            }
          }

          const caps = capabilityValues(form);
          setSaving(true);
          const saved = await call<Record<string, unknown>>("/admin/vehicles", {
            method: "POST",
            body: {
              plate_number,
              driver_id,
              branch_id: textOrUndefined(form.get("branch_id")),
              ride_category_ids,
              make: textOrUndefined(form.get("make")),
              model: textOrUndefined(form.get("model")),
              color: textOrUndefined(form.get("color")),
              year: form.get("year") ? Number(form.get("year")) : undefined,
              capabilities: caps.length ? caps : undefined,
              set_as_active: form.get("set_as_active") === "on",
              documents,
              vehicle_photos,
            },
          });
          if (isGoFailure(saved)) {
            setSaving(false);
            return;
          }
          router.push(typeof saved.id === "string" ? `/admin/vehicles/${saved.id}` : "/admin/vehicles");
        }}
      >
        <FormCard title={labels[step]} hint={hints[step]}>
          <div className={step === 0 ? "" : "hidden"} aria-hidden={step !== 0}>
            <FormGrid>
              <NamedSelect
                path="/erp/drivers"
                name="driver_id"
                label={t("السائق")}
                placeholder={t("اختر السائق")}
                searchable
                searchPlaceholder={t("ابحث عن سائق")}
                limit={100}
                required={step === 0}
              />
              <NamedSelect path="/erp/branches" name="branch_id" label={t("الفرع")} placeholder={t("بدون فرع")} />
              <Field label={t("اللوحة")}>
                <PlateInput name="plate_number" required={step === 0} disabled={saving} />
              </Field>
              <CheckField name="set_as_active" label={t("اجعلها المركبة الحالية")} defaultChecked />
            </FormGrid>
          </div>

          {VEHICLE_ONBOARDING_DOCUMENTS.map((doc, index) => {
            const active = step === index + 1;
            return (
              <div key={doc.type} className={active ? "grid gap-4" : "hidden"} aria-hidden={!active}>
                <DocumentPhotos
                  frontName={`image_front_${doc.type}`}
                  backName={`image_back_${doc.type}`}
                  frontRequired={active}
                />
                {doc.expires ? (
                  <FormGrid>
                    <DateField name={`expires_${doc.type}`} label={t("انتهاء الصلاحية")} required={active} />
                  </FormGrid>
                ) : null}
              </div>
            );
          })}

          <div className={step === vehicleStep ? "" : "hidden"} aria-hidden={step !== vehicleStep}>
            <FormGrid>
              <VehicleCategoriesField required disabled={saving} />
              <Field label={t("الشركة")}><input className={inputClass} name="make" disabled={saving} /></Field>
              <Field label={t("الطراز")}><input className={inputClass} name="model" disabled={saving} /></Field>
              <Field label={t("اللون")}><input className={inputClass} name="color" disabled={saving} /></Field>
              <Field label={t("السنة")}><input className={inputClass} name="year" inputMode="numeric" disabled={saving} /></Field>
              <FormSpan>
                <p className="mb-2 text-[13px] font-medium text-body">{t("قدرات المركبة")}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {STAFF_ENUMS.vehicleCapability.map((capability) => (
                    <CheckField key={capability} name="capabilities" value={capability} label={enumLabel(capability)} />
                  ))}
                </div>
              </FormSpan>
            </FormGrid>
          </div>

          <div className={step === photoStep ? "grid gap-4" : "hidden"} aria-hidden={step !== photoStep}>
            <VehiclePhotosPicker files={vehicleFiles} onChange={setVehicleFiles} disabled={saving} />
          </div>

          {fault ? <Notice>{fault}</Notice> : null}
        </FormCard>

        <div className={`sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-card backdrop-blur ${step === 0 ? "justify-end" : "justify-between"}`}>
          {step > 0 ? (
            <button
              className={btnGhost}
              type="button"
              disabled={saving}
              onClick={() => {
                setFault(null);
                setStep((current) => Math.max(0, current - 1));
              }}
            >
              {t("السابق")}
            </button>
          ) : null}
          <button className={btnDark} type="submit" disabled={saving}>
            {saving ? (
              <>
                <BusyMark />
                {t("جارٍ الحفظ…")}
              </>
            ) : step < last ? (
              t("التالي")
            ) : (
              t("حفظ المركبة")
            )}
          </button>
        </div>
      </DeskForm>

      {saving ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-ink/45 p-4 backdrop-blur-[2px]" aria-live="polite" aria-busy="true">
          <div className="desk-pop flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-6 py-8 text-center shadow-float">
            <span className="grid size-12 place-items-center rounded-full bg-brand/12 text-accent">
              <span aria-hidden className="size-6 animate-spin rounded-full border-2 border-accent/25 border-t-accent motion-reduce:animate-none" />
            </span>
            <p className="text-base font-semibold text-heading">{t("جارٍ حفظ المركبة")}</p>
            <p className="text-sm leading-6 text-muted">{t("يتم رفع الوثائق وصور السيارة وإنشاء المركبة. انتظر لحظة…")}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function VehicleDetail({ vehicleId }: { vehicleId: string }) {
  const call = useGo();
  return (
    <DetailScreen title={t("مركبة")} path={`/erp/vehicles/${vehicleId}`} facts="none">
      {(picked) => (
        <DeskForm key={String(picked.updated_at ?? picked.id ?? vehicleId)} action={(form) => {
          const ride_category_ids = categoryIds(form);
          if (!ride_category_ids?.length) return;
          return call(`/admin/vehicles/${vehicleId}`, { method: "PATCH", body: { driver_id: textOrUndefined(form.get("driver_id")) ?? null, branch_id: textOrUndefined(form.get("branch_id")) ?? null, ride_category_ids, make: textOrUndefined(form.get("make")), model: textOrUndefined(form.get("model")), color: textOrUndefined(form.get("color")), year: form.get("year") ? Number(form.get("year")) : undefined, is_active: form.get("is_active") === "on", capabilities: capabilityValues(form) } });
        }}>
          <FormCard title={t("بيانات المركبة")} hint={t("السائق يظهر لطلبات أي فئة مختارة لهذه المركبة.")} footer={<button className={btnDark} type="submit">{t("حفظ المركبة")}</button>}>
            <FormGrid>
              <NamedSelect path="/erp/drivers" name="driver_id" label={t("السائق")} placeholder={t("بدون سائق")} searchable searchPlaceholder={t("ابحث عن سائق")} limit={100} defaultValue={relatedId(picked, "driver_id")} />
              <NamedSelect path="/erp/branches" name="branch_id" label={t("الفرع")} placeholder={t("بدون فرع")} defaultValue={relatedId(picked, "branch_id")} />
              <VehicleCategoriesField selected={selectedVehicleCategoryIds(picked)} required />
              <Field label={t("الشركة")}><input className={inputClass} name="make" defaultValue={typeof picked.make === "string" ? picked.make : ""} /></Field>
              <Field label={t("الطراز")}><input className={inputClass} name="model" defaultValue={typeof picked.model === "string" ? picked.model : ""} /></Field>
              <Field label={t("اللون")}><input className={inputClass} name="color" defaultValue={typeof picked.color === "string" ? picked.color : ""} /></Field>
              <Field label={t("السنة")}><input className={inputClass} name="year" defaultValue={picked.year == null ? "" : String(picked.year)} /></Field>
              <CheckField name="is_active" label={t("نشطة")} defaultChecked={picked.is_active !== false} />
              <FormSpan>
                <div className="grid gap-2 sm:grid-cols-2">
                  {STAFF_ENUMS.vehicleCapability.map((capability) => (
                    <CheckField key={capability} name="capabilities" value={capability} label={enumLabel(capability)} defaultChecked={selectedCapabilities(picked).has(capability)} />
                  ))}
                </div>
              </FormSpan>
            </FormGrid>
          </FormCard>
        </DeskForm>
      )}
    </DetailScreen>
  );
}

export function DriversScreen() {
  return (
    <ListScreen
      title={t("السائقون")}
      hint={t("اضغط السائق لفتح صفحة التعديل. إضافة السائق تتطلب الوجه الأمامي لكل وثيقة. الوجه الخلفي اختياري.")}
      path="/erp/drivers"
      lookups={[{ name: "branch_id", label: t("الفرع"), path: "/erp/branches" }]}
      search={{
        param: "q",
        placeholder: t("ابحث بالاسم أو رقم الهاتف أو رقم اللوحة"),
        hint: t("البحث يشمل كل السائقين وليس الصفحة الحالية فقط. يقبل الرقم بأي صيغة (09… أو 963…) أو جزءاً منه، ولا يفرّق بين أ وإ وا أو ة وه."),
      }}
      segments={{
        param: "state",
        options: [
          { value: "active", label: t("نشط") },
          { value: "suspended", label: t("موقوف") },
          { value: "blocked", label: t("محظور تشغيلياً") },
          { value: "disabled", label: t("حساب معطّل") },
        ],
      }}
      rowHref={(row) => (typeof row.id === "string" ? `/admin/drivers/${row.id}` : null)}
      action={<Link href="/admin/drivers/new" className={btnPrimary}>{t("إضافة سائق")}</Link>}
    />
  );
}

export function DriverCreateScreen() {
  const router = useRouter();
  const call = useGo();
  const [fault, setFault] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<DriverKind>("EXTERNAL");
  const [vehicleFiles, setVehicleFiles] = useState<File[]>([]);
  const [motherTongue, setMotherTongue] = useState("ar");
  const [otherLanguages, setOtherLanguages] = useState<string[]>([]);
  const docs = documentsForKind(kind);
  const includeVehicle = kind === "EXTERNAL";
  const docCount = docs.length;
  const vehicleStep = includeVehicle ? docCount + 1 : -1;
  const photoStep = includeVehicle ? vehicleStep + 1 : -1;
  const last = includeVehicle ? photoStep : docCount;
  const labels = [
    t("البيانات"),
    ...docs.map((doc) => enumLabel(doc.type)),
    ...(includeVehicle ? [t("المركبة والفئة"), t("صور السيارة")] : []),
  ];
  const hints = [
    kind === "BEROYA"
      ? t("سائق بيرويا: أدخل بياناته الشخصية. المركبة تُضاف لاحقاً من صفحة المركبات وتُربط به.")
      : t("سائق خارجي: أكمل البيانات والوثائق والمركبة وصور السيارة. يسجّل دخوله برقم الجوال عبر رمز التحقق."),
    ...docs.map((doc) =>
      doc.expires
        ? t("الوجه الأمامي وتاريخ الصلاحية مطلوبان. الوجه الخلفي اختياري.")
        : t("الوجه الأمامي مطلوب. الوجه الخلفي اختياري."),
    ),
    ...(includeVehicle
      ? [
          t("اختر فئة خدمة واحدة أو أكثر. السائق يظهر لطلبات أي فئة مختارة."),
          t("ارفع من صورتين إلى ست صور واضحة للسيارة."),
        ]
      : []),
  ];
  const progress = saving ? 100 : (step / labels.length) * 100;

  return (
    <div className="relative grid gap-5">
      <header className="grid gap-3">
        <Link href="/admin/drivers" className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-accent transition-colors hover:text-brand-strong">
          <Icon node={ChevronLeft} size={15} className="rtl:rotate-180" />
          {t("العودة إلى القائمة")}
        </Link>
        <PageTitle
          title={t("سائق جديد")}
          hint={
            kind === "BEROYA"
              ? t("سائق بيرويا بدون مركبة في هذا النموذج — أضف المركبة من صفحة المركبات واربط السائق بها.")
              : t("أكمل البيانات والوثائق والمركبة وصور السيارة خطوة بخطوة. الفئة تحدد الطلبات التي يظهر لها السائق.")
          }
        />
      </header>

      <nav aria-label={t("خطوات إضافة السائق")} className="grid gap-3">
        <div className="relative h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className="absolute inset-y-0 start-0 rounded-full bg-gradient-to-l from-brand to-teal transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <ol className="flex flex-wrap gap-2">
          {labels.map((label, index) => {
            const active = !saving && index === step;
            const done = saving || index < step;
            return (
              <li key={`${kind}-${label}`}>
                <button
                  type="button"
                  disabled={saving || (!done && !active)}
                  aria-current={active ? "step" : undefined}
                  onClick={() => {
                    if (saving || !done) return;
                    setFault(null);
                    setStep(index);
                  }}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-brand/12 font-semibold text-accent ring-1 ring-inset ring-brand/30"
                      : done
                        ? "bg-teal/10 font-medium text-teal hover:bg-teal/15"
                        : "bg-heading/[0.03] text-muted"
                  }`}
                >
                  <span
                    className={`grid size-6 place-items-center rounded-full text-[11px] font-bold ${
                      active
                        ? "bg-brand text-on-brand"
                        : done
                          ? "bg-teal text-on-teal"
                          : "bg-surface text-muted ring-1 ring-inset ring-line"
                    }`}
                  >
                    {done ? <Icon node={Check} size={13} strokeWidth={2.6} /> : index + 1}
                  </span>
                  {label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <DeskForm
        className="grid gap-5"
        action={async (form) => {
          setFault(null);
          if (step === 0) {
            const phone = loginPhone(String(form.get("phone") || ""));
            if (!phone) {
              setFault(t("أدخل رقم الجوال الذي يدخل به السائق، مثل 0991234567."));
              return;
            }
            if (!motherTongue) {
              setFault(t("اختر لغة الأم."));
              return;
            }
            setStep(1);
            return;
          }
          if (step >= 1 && step <= docCount) {
            const doc = docs[step - 1];
            const front = await optionalImage(form, `image_front_${doc.type}`);
            const back = await optionalImage(form, `image_back_${doc.type}`);
            if (!front.ok || !back.ok) {
              setFault(t("تعذّر قراءة صورة الوثيقة."));
              return;
            }
            if (!front.image) {
              setFault(t("صورة الوجه الأمامي مطلوبة."));
              return;
            }
            if (doc.expires && !String(form.get(`expires_${doc.type}`) || "").trim()) {
              setFault(t("تاريخ الصلاحية مطلوب لهذه الوثيقة."));
              return;
            }
            if (step < docCount || includeVehicle) {
              setStep(step + 1);
              return;
            }
          } else if (includeVehicle && step === vehicleStep) {
            const plate = String(form.get("plate_number") || "").trim();
            if (!plate) {
              setFault(t("أدخل رقم لوحة المركبة."));
              return;
            }
            if (!isValidPlateNumber(plate)) {
              setFault(t("رقم اللوحة يقبل أرقاماً و / و \\ فقط."));
              return;
            }
            if (!categoryIds(form)?.length) {
              setFault(t("اختر فئة خدمة واحدة على الأقل للمركبة."));
              return;
            }
            setStep(photoStep);
            return;
          } else if (includeVehicle && step === photoStep) {
            if (vehicleFiles.length < VEHICLE_PHOTO_MIN) {
              setFault(t("ارفع صورتين للسيارة على الأقل."));
              return;
            }
            if (vehicleFiles.length > VEHICLE_PHOTO_MAX) {
              setFault(t("الحد الأقصى لصور السيارة ست صور."));
              return;
            }
          } else if (step < last) {
            setStep(step + 1);
            return;
          }

          const documents = [];
          for (const doc of docs) {
            const front = await optionalImage(form, `image_front_${doc.type}`);
            const back = await optionalImage(form, `image_back_${doc.type}`);
            if (!front.ok || !back.ok) {
              setFault(t("تعذّر قراءة صورة الوثيقة."));
              return;
            }
            if (!front.image) {
              setFault(t("صورة الوجه الأمامي مطلوبة."));
              return;
            }
            const expires = doc.expires ? String(form.get(`expires_${doc.type}`) || "") : "";
            if (doc.expires && !expires) {
              setFault(t("تاريخ الصلاحية مطلوب لهذه الوثيقة."));
              return;
            }
            documents.push({
              type: doc.type,
              image: front.image,
              image_back: back.image,
              expires_at: doc.expires ? new Date(expires).toISOString() : undefined,
            });
          }

          const phone = loginPhone(String(form.get("phone") || ""));
          if (!phone) {
            setFault(t("أدخل رقم الجوال الذي يدخل به السائق، مثل 0991234567."));
            setStep(0);
            return;
          }

          const body: Record<string, unknown> = {
            kind,
            phone,
            full_name: String(form.get("full_name")),
            branch_id: String(form.get("branch_id") || "") || undefined,
            gender: String(form.get("gender") || "") || undefined,
            mother_tongue: motherTongue,
            languages: otherLanguages,
            documents,
          };

          if (includeVehicle) {
            const ride_category_ids = categoryIds(form);
            const plate_number = sanitizePlateNumber(String(form.get("plate_number") || "")).trim();
            if (!plate_number || !ride_category_ids?.length) {
              setFault(t("أكمل بيانات المركبة والفئة."));
              setStep(vehicleStep);
              return;
            }
            if (!isValidPlateNumber(plate_number)) {
              setFault(t("رقم اللوحة يقبل أرقاماً و / و \\ فقط."));
              setStep(vehicleStep);
              return;
            }
            if (vehicleFiles.length < VEHICLE_PHOTO_MIN) {
              setFault(t("ارفع صورتين للسيارة على الأقل."));
              setStep(photoStep);
              return;
            }
            if (vehicleFiles.length > VEHICLE_PHOTO_MAX) {
              setFault(t("الحد الأقصى لصور السيارة ست صور."));
              setStep(photoStep);
              return;
            }
            const vehicle_photos: string[] = [];
            for (const file of vehicleFiles) {
              try {
                const image = await documentImage(file);
                if (!image) {
                  setFault(t("تعذّر قراءة إحدى صور السيارة."));
                  return;
                }
                vehicle_photos.push(image);
              } catch {
                setFault(t("تعذّر قراءة إحدى صور السيارة."));
                return;
              }
            }
            const caps = capabilityValues(form);
            body.vehicle = {
              plate_number,
              ride_category_ids,
              make: textOrUndefined(form.get("make")),
              model: textOrUndefined(form.get("model")),
              color: textOrUndefined(form.get("color")),
              year: form.get("year") ? Number(form.get("year")) : undefined,
              capabilities: caps.length ? caps : undefined,
            };
            body.vehicle_photos = vehicle_photos;
          }

          setSaving(true);
          const saved = await call<Record<string, unknown>>("/admin/drivers", {
            method: "POST",
            body,
          });
          if (isGoFailure(saved)) {
            setSaving(false);
            return;
          }
          router.push(typeof saved.id === "string" ? `/admin/drivers/${saved.id}` : "/admin/drivers");
        }}
      >
        <FormCard title={labels[step]} hint={hints[step]}>
          <div className={step === 0 ? "" : "hidden"} aria-hidden={step !== 0}>
            <FormGrid>
              <FormSpan>
                <p className="mb-1.5 text-[13px] font-medium text-body">{t("نوع السائق")}</p>
                <Choice
                  value={kind}
                  onChange={(next) => {
                    setKind(next);
                    setFault(null);
                    setStep(0);
                    if (next === "BEROYA") setVehicleFiles([]);
                  }}
                  options={[
                    {
                      value: "EXTERNAL",
                      label: t("سائق خارجي"),
                      hint: t("يُدخل مركبته ووثائقها وصورها ضمن هذا النموذج."),
                    },
                    {
                      value: "BEROYA",
                      label: t("سائق بيرويا"),
                      hint: t("بدون مركبة هنا — أضفها من صفحة المركبات واربط السائق بها."),
                    },
                  ]}
                />
              </FormSpan>
              <Field label={t("رقم الدخول")}>
                <input className={inputClass} name="phone" inputMode="tel" dir="ltr" placeholder="0991234567" required={step === 0} disabled={saving} />
                <span className="text-xs leading-5 text-muted">{t("يسجّل السائق دخوله بهذا الرقم عبر رمز التحقق.")}</span>
              </Field>
              <Field label={t("الاسم")}><input className={inputClass} name="full_name" required={step === 0} disabled={saving} /></Field>
              <Field label={t("الجنس")}><EnumSelect kind="driverGender" name="gender" allowEmpty emptyLabel={t("بدون تحديد")} /></Field>
              <NamedSelect path="/erp/branches" name="branch_id" label={t("الفرع")} placeholder={t("بدون فرع")} />
              <Field label={t("لغة الأم")}>
                <SearchSelect
                  name="mother_tongue"
                  required={step === 0}
                  value={motherTongue}
                  placeholder={t("اختر لغة الأم")}
                  searchPlaceholder={t("ابحث عن لغة")}
                  options={worldLanguageOptions()}
                  onValueChange={(next) => {
                    setMotherTongue(next);
                    setOtherLanguages((current) => current.filter((item) => item !== next));
                  }}
                />
              </Field>
              <FormSpan>
                <p className="mb-1.5 text-[13px] font-medium text-body">{t("لغات أخرى")}</p>
                <SearchMultiSelect
                  name="languages"
                  value={otherLanguages}
                  onValueChange={setOtherLanguages}
                  placeholder={t("اختر لغات إضافية")}
                  searchPlaceholder={t("ابحث عن لغة")}
                  options={worldLanguageOptions(motherTongue)}
                />
              </FormSpan>
            </FormGrid>
          </div>

          {docs.map((doc, index) => {
            const active = step === index + 1;
            return (
              <div key={doc.type} className={active ? "grid gap-4" : "hidden"} aria-hidden={!active}>
                <DocumentPhotos
                  frontName={`image_front_${doc.type}`}
                  backName={`image_back_${doc.type}`}
                  frontRequired={active}
                />
                {doc.expires ? (
                  <FormGrid>
                    <DateField name={`expires_${doc.type}`} label={t("انتهاء الصلاحية")} required={active} />
                  </FormGrid>
                ) : null}
              </div>
            );
          })}

          {includeVehicle ? (
            <>
              <div className={step === vehicleStep ? "" : "hidden"} aria-hidden={step !== vehicleStep}>
                <FormGrid>
                  <Field label={t("اللوحة")}>
                    <PlateInput name="plate_number" required={step === vehicleStep} disabled={saving} />
                  </Field>
                  <VehicleCategoriesField required disabled={saving} />
                  <Field label={t("الشركة")}><input className={inputClass} name="make" disabled={saving} /></Field>
                  <Field label={t("الطراز")}><input className={inputClass} name="model" disabled={saving} /></Field>
                  <Field label={t("اللون")}><input className={inputClass} name="color" disabled={saving} /></Field>
                  <Field label={t("السنة")}><input className={inputClass} name="year" inputMode="numeric" disabled={saving} /></Field>
                  <FormSpan>
                    <p className="mb-2 text-[13px] font-medium text-body">{t("قدرات المركبة")}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {STAFF_ENUMS.vehicleCapability.map((capability) => (
                        <CheckField key={capability} name="capabilities" value={capability} label={enumLabel(capability)} />
                      ))}
                    </div>
                  </FormSpan>
                </FormGrid>
              </div>

              <div className={step === photoStep ? "grid gap-4" : "hidden"} aria-hidden={step !== photoStep}>
                <VehiclePhotosPicker files={vehicleFiles} onChange={setVehicleFiles} disabled={saving} />
              </div>
            </>
          ) : null}

          {fault ? <Notice>{fault}</Notice> : null}
        </FormCard>

        <div className={`sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-card backdrop-blur ${step === 0 ? "justify-end" : "justify-between"}`}>
          {step > 0 ? (
            <button
              className={btnGhost}
              type="button"
              disabled={saving}
              onClick={() => {
                setFault(null);
                setStep((current) => Math.max(0, current - 1));
              }}
            >
              {t("السابق")}
            </button>
          ) : null}
          <button className={btnDark} type="submit" disabled={saving}>
            {saving ? (
              <>
                <BusyMark />
                {t("جارٍ الحفظ…")}
              </>
            ) : step < last ? (
              t("التالي")
            ) : (
              t("حفظ السائق")
            )}
          </button>
        </div>
      </DeskForm>

      {saving ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-ink/45 p-4 backdrop-blur-[2px]" aria-live="polite" aria-busy="true">
          <div className="desk-pop flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-6 py-8 text-center shadow-float">
            <span className="grid size-12 place-items-center rounded-full bg-brand/12 text-accent">
              <span aria-hidden className="size-6 animate-spin rounded-full border-2 border-accent/25 border-t-accent motion-reduce:animate-none" />
            </span>
            <p className="text-base font-semibold text-heading">{t("جارٍ حفظ السائق")}</p>
            <p className="text-sm leading-6 text-muted">
              {includeVehicle
                ? t("يتم رفع الوثائق وصور السيارة وإنشاء الحساب. انتظر لحظة…")
                : t("يتم رفع الوثائق وإنشاء الحساب. انتظر لحظة…")}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DriverDetail({ driverId }: { driverId: string }) {
  return (
    <DetailScreen title={t("سائق")} path={`/erp/drivers/${driverId}`} facts="none">
      {(driver) => <DriverEditor driver={{ ...driver, id: driver.id ?? driverId }} />}
    </DetailScreen>
  );
}

const PASSPORT_TABS = [
  { id: "levels", label: "المستويات", hint: "اضغط مستوى لفتح صفحة التفاصيل والتعديل." },
  { id: "rules", label: "قواعد النقاط", hint: "اضغط قاعدة لفتح صفحة التفاصيل وتعديل النقاط والحالة." },
  { id: "rewards", label: "مكافآت السلسلة", hint: "أضف مكافأة لكل عدد رحلات متتالية تريده (مثلاً 5 ثم 10 ثم 20)، كل واحدة على حدة." },
  { id: "grants", label: "المنح", hint: "اضغط منحة لفتح التفاصيل. وافق ليصل النقاط أو كود الخصم، أو ارفضها." },
] as const;

type PassportTab = (typeof PASSPORT_TABS)[number]["id"];

export function PassportScreen() {
  const [tab, setTab] = useState<PassportTab>("levels");
  const current = PASSPORT_TABS.find((item) => item.id === tab) ?? PASSPORT_TABS[0];
  return (
    <div className="grid gap-4">
      <PageTitle title={t("جواز العميل")} hint={t(current.hint)} />
      <div className={chipGroup}>
        {PASSPORT_TABS.map((item) => (
          <button key={item.id} type="button" className={tab === item.id ? chipActive : chipClass} onClick={() => setTab(item.id)}>{t(item.label)}</button>
        ))}
      </div>
      {tab === "levels" ? <PassportLevels /> : null}
      {tab === "rules" ? <PassportRules /> : null}
      {tab === "rewards" ? <StreakRewards /> : null}
      {tab === "grants" ? <PassportGrants /> : null}
    </div>
  );
}

const RIDE_COUNT_OPTIONS = Array.from({ length: 100 }, (_, index) => {
  const value = String(index + 1);
  return { value, label: value };
});

function dayValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseClock(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function durationDefaults(days: number, hours: number) {
  const safeDays = Math.max(0, Math.trunc(days));
  const safeHours = Math.max(0, Math.min(23, Math.trunc(hours)));
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + safeDays);
  return {
    fromDate: safeDays > 0 ? dayValue(from) : "",
    toDate: safeDays > 0 ? dayValue(to) : "",
    fromTime: safeHours > 0 ? "00:00" : "",
    toTime: safeHours > 0 ? `${String(safeHours).padStart(2, "0")}:00` : "",
  };
}

function durationFields(form: FormData): { ok: true; duration_days: number; duration_hours: number } | { ok: false; error: string } {
  const fromDateRaw = String(form.get("duration_from_date") ?? "").trim();
  const toDateRaw = String(form.get("duration_to_date") ?? "").trim();
  const fromTimeRaw = String(form.get("duration_from_time") ?? "").trim();
  const toTimeRaw = String(form.get("duration_to_time") ?? "").trim();

  let duration_days = 0;
  let duration_hours = 0;

  if (fromDateRaw || toDateRaw) {
    if (!fromDateRaw || !toDateRaw) {
      return { ok: false, error: t("حدد تاريخ البداية والنهاية للمدة.") };
    }
    const from = parseDay(fromDateRaw);
    const to = parseDay(toDateRaw);
    if (!from || !to) return { ok: false, error: t("تاريخ المدة غير صالح.") };
    const diff = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    if (diff < 0) return { ok: false, error: t("تاريخ النهاية يجب أن يكون بعد البداية أو يساويها.") };
    duration_days = diff;
  }

  if (fromTimeRaw || toTimeRaw) {
    if (!fromTimeRaw || !toTimeRaw) {
      return { ok: false, error: t("حدد وقت البداية والنهاية للمدة.") };
    }
    const from = parseClock(fromTimeRaw);
    const to = parseClock(toTimeRaw);
    if (from == null || to == null) return { ok: false, error: t("وقت المدة غير صالح.") };
    let diffMin = to - from;
    if (diffMin < 0) diffMin += 24 * 60;
    duration_hours = Math.min(23, Math.round(diffMin / 60));
  }

  return { ok: true, duration_days, duration_hours };
}

function PassportLevels() {
  const call = useGo();
  const [creating, setCreating] = useState(false);
  const [createFault, setCreateFault] = useState<string | null>(null);
  return (
    <>
      <ListScreen
        heading={false}
        title={t("المستويات")}
        hint={t("اضغط مستوى لفتح التعديل. يمكنك تحديد مدة للختم بالأيام أو الساعات أو الاثنين معاً.")}
        path="/admin/passport/levels"
        rowHref={(row) => (typeof row.id === "string" ? `/admin/passport/levels/${row.id}` : null)}
        action={
          <button
            className={btnPrimary}
            type="button"
            onClick={() => {
              setCreateFault(null);
              setCreating(true);
            }}
          >
            {t("إضافة مستوى")}
          </button>
        }
      />
      <FormDialog open={creating} title={t("مستوى جديد")} onClose={() => setCreating(false)}>
        <DeskForm
          className="grid gap-3 md:grid-cols-2"
          action={async (form) => {
            setCreateFault(null);
            const icon = await readIcon(form);
            if (!icon.ok) {
              setCreateFault(t("تعذّر قراءة الأيقونة."));
              return;
            }
            const duration = durationFields(form);
            if (!duration.ok) {
              setCreateFault(duration.error);
              return;
            }
            const saved = await call("/admin/passport/levels", {
              method: "POST",
              body: {
                level_order: Number(form.get("level_order")),
                name_ar: String(form.get("name_ar")),
                name_en: textOrUndefined(form.get("name_en")),
                stamp_name_ar: textOrUndefined(form.get("stamp_name_ar")) ?? null,
                stamp_name_en: textOrUndefined(form.get("stamp_name_en")) ?? null,
                minimum_score: form.get("minimum_score") ? Number(form.get("minimum_score")) : 0,
                minimum_completed_rides: form.get("minimum_completed_rides")
                  ? Number(form.get("minimum_completed_rides"))
                  : 1,
                duration_days: duration.duration_days,
                duration_hours: duration.duration_hours,
                icon: icon.icon,
                is_active: form.get("is_active") === "on",
              },
            });
            if (!isGoFailure(saved)) setCreating(false);
          }}
        >
          <Field label={t("الترتيب")}>
            <input className={inputClass} name="level_order" inputMode="numeric" required />
          </Field>
          <Field label={t("الاسم")}>
            <input className={inputClass} name="name_ar" required />
          </Field>
          <Field label={t("الاسم بالإنكليزية")}>
            <input className={inputClass} name="name_en" />
          </Field>
          <Field label={t("اسم الختم")}>
            <input className={inputClass} name="stamp_name_ar" />
          </Field>
          <Field label={t("اسم الختم بالإنكليزية")}>
            <input className={inputClass} name="stamp_name_en" />
          </Field>
          <Field label={t("حد النقاط")}>
            <input className={inputClass} name="minimum_score" inputMode="numeric" defaultValue="0" />
          </Field>
          <Field label={t("حد الرحلات المكتملة")}>
            <ChoiceSelect name="minimum_completed_rides" defaultValue="1" options={RIDE_COUNT_OPTIONS} required placeholder={t("اختر")} />
          </Field>
          <FormSpan>
            <div className="grid gap-3 sm:grid-cols-2">
              <DateField name="duration_from_date" label={t("المدة · من تاريخ")} />
              <DateField name="duration_to_date" label={t("المدة · إلى تاريخ")} />
            </div>
          </FormSpan>
          <FormSpan>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("المدة · من ساعة")}>
                <TimeField name="duration_from_time" />
              </Field>
              <Field label={t("المدة · إلى ساعة")}>
                <TimeField name="duration_to_time" />
              </Field>
            </div>
          </FormSpan>
          <FormSpan>
            <p className="text-xs leading-5 text-muted">{t("اترك التواريخ والأوقات فارغة لختم دائم، أو حدد من–إلى لأيام و/أو ساعات.")}</p>
          </FormSpan>
          <FormSpan>
            <IconField />
          </FormSpan>
          <CheckField name="is_active" label={t("نشط")} defaultChecked />
          {createFault ? (
            <FormSpan>
              <Notice>{createFault}</Notice>
            </FormSpan>
          ) : null}
          <button className={btnDark} type="submit">
            {t("حفظ المستوى")}
          </button>
        </DeskForm>
      </FormDialog>
    </>
  );
}

export function PassportLevelDetail({ levelId }: { levelId: string }) {
  const call = useGo();
  const [fault, setFault] = useState<string | null>(null);
  const [iconRev, setIconRev] = useState(0);
  return (
    <DetailScreen title={t("مستوى")} path={`/admin/passport/levels/${levelId}`} facts="none">
      {(level) => {
        const storedIcon = typeof level.icon_storage_key === "string" && level.icon_storage_key.length > 0;
        const rides = typeof level.minimum_completed_rides === "number" ? level.minimum_completed_rides : Number(level.minimum_completed_rides);
        const ridesValue = Number.isFinite(rides) && rides >= 1 && rides <= 100 ? String(rides) : "1";
        const duration = durationDefaults(
          typeof level.duration_days === "number" ? level.duration_days : Number(level.duration_days) || 0,
          typeof level.duration_hours === "number" ? level.duration_hours : Number(level.duration_hours) || 0,
        );
        return (
          <DeskForm
            key={String(level.updated_at ?? level.id ?? levelId)}
            action={async (form) => {
              setFault(null);
              const icon = await readIcon(form);
              if (!icon.ok) {
                setFault(t("تعذّر قراءة الأيقونة."));
                return;
              }
              const nextDuration = durationFields(form);
              if (!nextDuration.ok) {
                setFault(nextDuration.error);
                return;
              }
              const saved = await call(`/admin/passport/levels/${levelId}`, {
                method: "PATCH",
                body: {
                  name_ar: textOrUndefined(form.get("name_ar")),
                  name_en: textOrUndefined(form.get("name_en")),
                  stamp_name_ar: textOrUndefined(form.get("stamp_name_ar")) ?? null,
                  stamp_name_en: textOrUndefined(form.get("stamp_name_en")) ?? null,
                  minimum_score: form.get("minimum_score") ? Number(form.get("minimum_score")) : undefined,
                  minimum_completed_rides: form.get("minimum_completed_rides")
                    ? Number(form.get("minimum_completed_rides"))
                    : undefined,
                  duration_days: nextDuration.duration_days,
                  duration_hours: nextDuration.duration_hours,
                  icon: icon.icon,
                  is_active: form.get("is_active") === "on",
                },
              });
              if (isGoFailure(saved)) return;
              if (icon.icon) setIconRev((value) => value + 1);
            }}
          >
            <FormCard title={t("بيانات المستوى")} footer={<button className={btnDark} type="submit">{t("حفظ المستوى")}</button>}>
              <FormGrid>
                <Field label={t("الاسم")}>
                  <input className={inputClass} name="name_ar" defaultValue={typeof level.name_ar === "string" ? level.name_ar : ""} />
                </Field>
                <Field label={t("الاسم بالإنكليزية")}>
                  <input className={inputClass} name="name_en" defaultValue={typeof level.name_en === "string" ? level.name_en : ""} />
                </Field>
                <Field label={t("اسم الختم")}>
                  <input className={inputClass} name="stamp_name_ar" defaultValue={typeof level.stamp_name_ar === "string" ? level.stamp_name_ar : ""} />
                </Field>
                <Field label={t("اسم الختم بالإنكليزية")}>
                  <input className={inputClass} name="stamp_name_en" defaultValue={typeof level.stamp_name_en === "string" ? level.stamp_name_en : ""} />
                </Field>
                <Field label={t("حد النقاط")}>
                  <input className={inputClass} name="minimum_score" defaultValue={level.minimum_score == null ? "" : String(level.minimum_score)} />
                </Field>
                <Field label={t("حد الرحلات المكتملة")}>
                  <ChoiceSelect
                    name="minimum_completed_rides"
                    defaultValue={ridesValue}
                    options={RIDE_COUNT_OPTIONS}
                    required
                    placeholder={t("اختر")}
                  />
                </Field>
                <FormSpan>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DateField name="duration_from_date" label={t("المدة · من تاريخ")} defaultValue={duration.fromDate} />
                    <DateField name="duration_to_date" label={t("المدة · إلى تاريخ")} defaultValue={duration.toDate} />
                  </div>
                </FormSpan>
                <FormSpan>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t("المدة · من ساعة")}>
                      <TimeField name="duration_from_time" defaultValue={duration.fromTime} />
                    </Field>
                    <Field label={t("المدة · إلى ساعة")}>
                      <TimeField name="duration_to_time" defaultValue={duration.toTime} />
                    </Field>
                  </div>
                </FormSpan>
                <FormSpan>
                  <p className="text-xs leading-5 text-muted">{t("اترك التواريخ والأوقات فارغة لختم دائم، أو حدد من–إلى لأيام و/أو ساعات.")}</p>
                </FormSpan>
                <FormSpan>
                  <IconField previewPath={storedIcon || iconRev > 0 ? `/api/v1/go/admin/passport/levels/${levelId}/icon?v=${iconRev}` : null} />
                </FormSpan>
                <CheckField name="is_active" label={t("نشط")} defaultChecked={level.is_active !== false} />
                {fault ? (
                  <FormSpan>
                    <Notice>{fault}</Notice>
                  </FormSpan>
                ) : null}
              </FormGrid>
            </FormCard>
          </DeskForm>
        );
      }}
    </DetailScreen>
  );
}

function PassportRules() {
  return <ListScreen heading={false} title={t("قواعد النقاط")} path="/admin/passport/score-rules" rowHref={(row) => (typeof row.id === "string" ? `/admin/passport/rules/${row.id}` : null)} />;
}

export function PassportRuleDetail({ ruleId }: { ruleId: string }) {
  const call = useGo();
  return (
    <DetailScreen title={t("قاعدة نقاط")} path={`/admin/passport/score-rules/${ruleId}`} facts="none">
      {(rule) => (
        <DeskForm key={String(rule.updated_at ?? rule.id ?? ruleId)} action={(form) => call(`/admin/passport/score-rules/${ruleId}`, { method: "PATCH", body: { score_delta: form.get("score_delta") ? Number(form.get("score_delta")) : undefined, is_active: form.get("is_active") === "on" } })}>
          <FormCard title={t("بيانات القاعدة")} footer={<button className={btnDark} type="submit">{t("حفظ القاعدة")}</button>}>
            <FormGrid>
              <Field label={headline(rule)}><input className={inputClass} name="score_delta" defaultValue={rule.score_delta == null ? "" : String(rule.score_delta)} /></Field>
              <CheckField name="is_active" label={t("نشطة")} defaultChecked={rule.is_active !== false} />
            </FormGrid>
          </FormCard>
        </DeskForm>
      )}
    </DetailScreen>
  );
}

export function PassportRewardDetail({ rewardId }: { rewardId: string }) {
  const call = useGo();
  return (
    <DetailScreen title={t("مكافأة سلسلة")} path={`/admin/passport/milestone-rewards/${rewardId}`} facts="none">
      {(picked) => (
        <DeskForm key={String(picked.updated_at ?? picked.id ?? rewardId)} action={(form) => call(`/admin/passport/milestone-rewards/${rewardId}`, { method: "PATCH", body: { reward_type: String(form.get("reward_type")), score_bonus: form.get("score_bonus") ? Number(form.get("score_bonus")) : undefined, discount_percentage: form.get("discount_percentage") ? Number(form.get("discount_percentage")) : undefined, requires_admin_approval: form.get("requires_admin_approval") === "on", is_active: form.get("is_active") === "on" } })}>
          <FormCard title={t("بيانات المكافأة")} footer={<button className={btnDark} type="submit">{t("حفظ المكافأة")}</button>}>
            <FormGrid>
              <Field label={t("نوع المكافأة")}><EnumSelect kind="rewardType" name="reward_type" defaultValue={typeof picked.reward_type === "string" ? picked.reward_type : "SCORE"} /></Field>
              <Field label={t("نقاط إضافية")}><input className={inputClass} name="score_bonus" defaultValue={picked.score_bonus == null ? "" : String(picked.score_bonus)} /></Field>
              <Field label={t("نسبة الخصم")}><input className={inputClass} name="discount_percentage" defaultValue={picked.discount_percentage == null ? "" : String(picked.discount_percentage)} /></Field>
              <CheckField name="requires_admin_approval" label={t("تحتاج موافقة")} defaultChecked={picked.requires_admin_approval !== false} />
              <CheckField name="is_active" label={t("نشطة")} defaultChecked={picked.is_active !== false} />
            </FormGrid>
          </FormCard>
        </DeskForm>
      )}
    </DetailScreen>
  );
}

const GRANT_FILTERS = [
  { id: "PENDING", label: "بانتظار", title: "لا طلبات بانتظار الموافقة", hint: "عندما يكمل عميل سلسلة رحلات ومكافأتها تحتاج موافقة، تظهر هنا.", other: "جرّب موافق عليها أو مرفوضة. الطلبات الجديدة التي تحتاج قرارك تبقى في بانتظار." },
  { id: "APPROVED", label: "موافق عليها", title: "لا مكافآت موافق عليها", hint: "المكافآت التي وافقت عليها تظهر في هذه القائمة.", other: "" },
  { id: "REJECTED", label: "مرفوضة", title: "لا مكافآت مرفوضة", hint: "المكافآت التي رفضتها تظهر في هذه القائمة.", other: "" },
] as const;

function PassportGrants() {
  const grants = useGoRecord("/admin/passport/reward-grants");
  const rewards = useGoRecord("/admin/passport/milestone-rewards");
  const [status, setStatus] = useState<(typeof GRANT_FILTERS)[number]["id"]>("PENDING");
  const rows = asRecords(grants.data);
  const configs = asRecords(rewards.data);
  const current = GRANT_FILTERS.find((item) => item.id === status) ?? GRANT_FILTERS[0];
  const visible = rows.filter((row) => row.status === status);
  const others = rows.length - visible.length;

  return (
    <Panel flush>
      <PanelHeader
        title={t("طلبات المكافأة")}
        action={
          <div className={chipGroup} role="tablist">
            {GRANT_FILTERS.map((item) => {
              const active = item.id === status;
              const count = rows.filter((row) => row.status === item.id).length;
              return (
                <button key={item.id} type="button" role="tab" aria-selected={active} className={active ? chipActive : chipClass} onClick={() => setStatus(item.id)}>
                  {t(item.label)}
                  <ChipCount value={count} active={active} />
                </button>
              );
            })}
          </div>
        }
      />
      <div className="grid gap-3 p-5">
        {grants.isPending ? <StateView loading bare>{null}</StateView> : null}
        {grants.isError ? <StateView error={grants.error} bare>{null}</StateView> : null}
        {!grants.isPending && !grants.isError && visible.length === 0 ? (
          <EmptyState bare icon={Gift} title={t(current.title)} hint={t(others > 0 && current.other ? current.other : current.hint)} />
        ) : null}
        {!grants.isPending && !grants.isError ? visible.map((row) => (
          <GrantCard key={String(row.id)} row={row} href={typeof row.id === "string" ? `/admin/passport/grants/${row.id}` : undefined} offer={offerOf(row, configs)} />
        )) : null}
      </div>
    </Panel>
  );
}

function GrantCard({ row, offer, href, onAct }: { row: Record<string, unknown>; offer: GrantOffer; href?: string; onAct?: (action: "approve" | "reject") => void }) {
  const person = customerOf(row);
  const pending = row.status === "PENDING";
  const status = typeof row.status === "string" ? row.status : "";
  const title = grantRewardTitle(offer.points, offer.discount) || (typeof row.reward_type === "string" ? enumLabel(row.reward_type) : t("مكافأة"));
  const streak = finiteNumber(row.streak_value);
  const decided = whenLabel(row.approved_at);
  const body = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex min-w-0 gap-3.5">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand/12 text-accent ring-1 ring-inset ring-brand/25">
            <Icon node={Gift} size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">{t("ما سيصله العميل")}</p>
            <h3 className="mt-0.5 text-lg font-semibold tracking-tight text-heading">{title}</h3>
            {streak != null ? <p className="mt-1 text-sm text-muted">{grantStreakLine(streak)}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {offer.points != null ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand/10 px-2.5 py-1 text-xs font-semibold text-accent ring-1 ring-inset ring-brand/20">
                  <Icon node={Sparkles} size={14} />
                  +{formatCount(offer.points)} {t("نقاط")}
                </span>
              ) : null}
              {offer.discount != null ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-heading/[0.04] px-2.5 py-1 text-xs font-semibold text-heading ring-1 ring-inset ring-line">
                  <Icon node={Percent} size={14} />
                  {formatCount(offer.discount)}%
                </span>
              ) : null}
              {streak != null ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-heading/[0.04] px-2.5 py-1 text-xs font-semibold text-heading ring-1 ring-inset ring-line">
                  <Icon node={Flame} size={14} />
                  {formatCount(streak)} {t("رحلات متتالية")}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {status ? <StatusBadge value={status} label={enumLabel(status)} /> : null}
      </div>
      <div className="grid border-t border-line sm:grid-cols-2">
        <div className="min-w-0 px-5 py-3.5 sm:border-e sm:border-line">
          <p className="text-xs font-medium text-muted">{t("العميل")}</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-heading">{person.name}</p>
          {person.phone ? <p className="phone-ltr mt-0.5 text-xs text-muted" dir="ltr" data-phone="">{person.phone}</p> : null}
        </div>
        <div className="min-w-0 border-t border-line px-5 py-3.5 sm:border-t-0">
          <p className="text-xs font-medium text-muted">{t("تاريخ الطلب")}</p>
          <p className="mt-0.5 text-sm font-semibold text-heading">{whenLabel(row.created_at) || "—"}</p>
          {decided && status === "APPROVED" ? <p className="mt-0.5 text-xs text-muted">{t("وُوفق عليها")} · {decided}</p> : null}
          {decided && status === "REJECTED" ? <p className="mt-0.5 text-xs text-muted">{t("رُفضت")} · {decided}</p> : null}
          {status === "APPROVED" ? <p className="mt-0.5 text-xs font-medium text-success-ink">{t("صُرفت للعميل")}</p> : null}
          {status === "REJECTED" ? <p className="mt-0.5 text-xs font-medium text-danger-ink">{t("لم تُصرف")}</p> : null}
        </div>
      </div>
    </>
  );
  return (
    <article className={`overflow-hidden rounded-xl border border-line bg-surface ${href ? "transition-colors hover:border-teal/40 hover:bg-heading/[0.02]" : ""}`}>
      {href ? <Link href={href} className="block">{body}</Link> : body}
      {pending && onAct ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-heading/[0.02] px-5 py-3.5">
          <p className="text-sm text-muted">{t("لا تُصرف المكافأة قبل موافقتك.")}</p>
          <div className="flex gap-2">
            <button className="inline-flex h-10 items-center rounded-lg border border-danger/30 bg-danger/10 px-4 text-sm font-semibold text-danger-ink transition-colors hover:bg-danger/15" type="button" onClick={() => onAct("reject")}>{t("رفض")}</button>
            <button className={btnPrimary} type="button" onClick={() => onAct("approve")}>{t("موافقة")}</button>
          </div>
        </div>
      ) : pending && href ? (
        <div className="border-t border-line bg-heading/[0.02] px-5 py-3.5">
          <p className="text-sm text-muted">{t("افتح التفاصيل للموافقة أو الرفض.")}</p>
        </div>
      ) : null}
    </article>
  );
}

export function PassportGrantDetail({ grantId }: { grantId: string }) {
  const call = useGo();
  const confirm = useConfirm();
  const grants = useGoRecord("/admin/passport/reward-grants");
  const rewards = useGoRecord("/admin/passport/milestone-rewards");
  const configs = asRecords(rewards.data);
  const row = asRecords(grants.data).find((item) => String(item.id) === grantId);
  const offer = row ? offerOf(row, configs) : { points: null, discount: null };

  function act(action: "approve" | "reject") {
    if (!row) return;
    const approve = action === "approve";
    const person = customerOf(row);
    void confirm({
      title: approve ? t("موافقة على المكافأة") : t("رفض المكافأة"),
      body: grantDecision(approve, person.name, offer.points, offer.discount),
      confirm: approve ? t("موافقة") : t("رفض"),
      danger: !approve,
      perform: () => call(`/admin/passport/reward-grants/${grantId}/${action}`, { method: "POST" }),
    });
  }

  return (
    <div className="grid gap-5">
      <Link href="/admin/passport" className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-accent transition-colors hover:text-brand-strong">
        {t("العودة إلى القائمة")}
      </Link>
      <StateView loading={grants.isPending} error={grants.error} empty={!grants.isPending && !row}>
        {row ? <GrantCard row={row} offer={offer} onAct={act} /> : null}
      </StateView>
    </div>
  );
}

type GrantOffer = { points: number | null; discount: number | null };

function offerOf(row: Record<string, unknown>, configs: Record<string, unknown>[]): GrantOffer {
  const type = typeof row.reward_type === "string" ? row.reward_type : "";
  const streak = finiteNumber(row.streak_value);
  const matched = streak == null ? null : configs.find((item) => finiteNumber(item.milestone_multiple) === streak) ?? null;
  const score = type === "SCORE" || type === "SCORE_AND_DISCOUNT";
  const discount = type === "DISCOUNT_CODE" || type === "SCORE_AND_DISCOUNT";
  return {
    points: score ? finiteNumber(matched?.score_bonus) : null,
    discount: discount ? finiteNumber(matched?.discount_percentage) : null,
  };
}

function customerOf(row: Record<string, unknown>) {
  const user = isRecord(row.customer) && isRecord(row.customer.user) ? row.customer.user : null;
  const named = typeof user?.full_name === "string" ? user.full_name.trim() : "";
  const phone = typeof user?.phone === "string" ? user.phone.trim() : "";
  return { name: named || headline(row), phone };
}

function asRecords(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function formatCount(value: number) {
  return new Intl.NumberFormat(localeTag(), { maximumFractionDigits: 2 }).format(value);
}

function whenLabel(value: unknown) {
  if (typeof value !== "string") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(localeTag(), { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function DriverPassportScreen() {
  const call = useGo();
  const [creating, setCreating] = useState(false);
  const [createFault, setCreateFault] = useState<string | null>(null);
  return (
    <div className="grid gap-4">
      <PageTitle title={t("جواز السائق")} />
      <ListScreen title={t("سجلات الجواز")} hint={t("النقاط ما زالت إطاراً. الرحلات المكتملة تُحدَّث من الخادم عند إكمال الرحلة.")} path="/admin/driver-passport/records" />
      <ListScreen
        title={t("المستويات")}
        hint={t("اضغط مستوى لفتح صفحة التفاصيل والتعديل.")}
        path="/admin/driver-passport/levels"
        rowHref={(row) => (typeof row.id === "string" ? `/admin/driver-passport/levels/${row.id}` : null)}
        action={<button className={btnPrimary} type="button" onClick={() => { setCreateFault(null); setCreating(true); }}>{t("إضافة مستوى")}</button>}
      />
      <FormDialog open={creating} title={t("مستوى جديد")} onClose={() => setCreating(false)}>
        <DeskForm className="grid gap-3 md:grid-cols-2" action={async (form) => {
          setCreateFault(null);
          const icon = await readIcon(form);
          if (!icon.ok) {
            setCreateFault(t("تعذّر قراءة الأيقونة."));
            return;
          }
          const saved = await call("/admin/driver-passport/levels", { method: "POST", body: { level_order: Number(form.get("level_order")), name_ar: String(form.get("name_ar")), name_en: textOrUndefined(form.get("name_en")), icon: icon.icon, minimum_score: form.get("minimum_score") ? Number(form.get("minimum_score")) : undefined, is_active: form.get("is_active") === "on" } });
          if (!isGoFailure(saved)) setCreating(false);
        }}>
          <Field label={t("الترتيب")}><input className={inputClass} name="level_order" inputMode="numeric" required /></Field>
          <Field label={t("الاسم")}><input className={inputClass} name="name_ar" required /></Field>
          <Field label={t("الاسم بالإنكليزية")}><input className={inputClass} name="name_en" /></Field>
          <Field label={t("حد النقاط")}><input className={inputClass} name="minimum_score" inputMode="numeric" /></Field>
          <FormSpan><IconField /></FormSpan>
          <CheckField name="is_active" label={t("نشط")} defaultChecked />
          {createFault ? <FormSpan><Notice>{createFault}</Notice></FormSpan> : null}
          <button className={btnDark} type="submit">{t("حفظ المستوى")}</button>
        </DeskForm>
      </FormDialog>
    </div>
  );
}

export function DriverPassportLevelDetail({ levelId }: { levelId: string }) {
  const call = useGo();
  const [editFault, setEditFault] = useState<string | null>(null);
  const [iconRev, setIconRev] = useState(0);
  return (
    <DetailScreen title={t("مستوى")} path={`/admin/driver-passport/levels/${levelId}`} facts="none">
      {(picked) => {
        const storedIcon = typeof picked.icon_storage_key === "string" && picked.icon_storage_key.length > 0;
        return (
          <DeskForm key={String(picked.updated_at ?? picked.id ?? levelId)} action={async (form) => {
            setEditFault(null);
            const icon = await readIcon(form);
            if (!icon.ok) {
              setEditFault(t("تعذّر قراءة الأيقونة."));
              return;
            }
            const saved = await call(`/admin/driver-passport/levels/${levelId}`, { method: "PATCH", body: { name_ar: textOrUndefined(form.get("name_ar")), name_en: textOrUndefined(form.get("name_en")), icon: icon.icon, minimum_score: form.get("minimum_score") ? Number(form.get("minimum_score")) : undefined, is_active: form.get("is_active") === "on" } });
            if (isGoFailure(saved)) return;
            if (icon.icon) setIconRev((value) => value + 1);
          }}>
            <FormCard title={t("بيانات المستوى")} footer={<button className={btnDark} type="submit">{t("حفظ المستوى")}</button>}>
              <FormGrid>
                <Field label={t("الاسم")}><input className={inputClass} name="name_ar" defaultValue={typeof picked.name_ar === "string" ? picked.name_ar : ""} /></Field>
                <Field label={t("الاسم بالإنكليزية")}><input className={inputClass} name="name_en" defaultValue={typeof picked.name_en === "string" ? picked.name_en : ""} /></Field>
                <Field label={t("حد النقاط")}><input className={inputClass} name="minimum_score" defaultValue={picked.minimum_score == null ? "" : String(picked.minimum_score)} /></Field>
                <FormSpan><IconField previewPath={storedIcon || iconRev > 0 ? `/api/v1/go/admin/driver-passport/levels/${levelId}/icon?v=${iconRev}` : null} /></FormSpan>
                <CheckField name="is_active" label={t("نشط")} defaultChecked={picked.is_active !== false} />
                {editFault ? <FormSpan><Notice>{editFault}</Notice></FormSpan> : null}
              </FormGrid>
            </FormCard>
          </DeskForm>
        );
      }}
    </DetailScreen>
  );
}

function selectedCategoryIds(row: Record<string, unknown>) {
  if (!Array.isArray(row.categories)) return new Set<string>();
  return new Set(row.categories.map((item) => {
    if (item && typeof item === "object" && "ride_category_id" in item && typeof item.ride_category_id === "string") return item.ride_category_id;
    return "";
  }).filter(Boolean));
}

function categoryIds(form: FormData) {
  const ids = form.getAll("ride_category_ids").map(String).filter(Boolean);
  return ids.length ? ids : undefined;
}

const DISCOUNT_AUDIENCES = [
  { value: "ALL", label: "للكل", hint: "أي عميل يستخدم الكود.", icon: Globe },
  { value: "CUSTOMERS", label: "عملاء", hint: "عميل واحد أو أكثر.", icon: Users },
  { value: "STAMP", label: "ختم", hint: "حاملو هذا الختم الآن.", icon: Stamp },
  { value: "FIRST_N", label: "أول عدد من الأشخاص", hint: "بعد اكتمال العدد: انتهت المدة.", icon: Hourglass },
  { value: "NEW_USERS", label: "مستخدمون جدد", hint: "من لم يكمل أي رحلة بعد.", icon: UserPlus },
  { value: "BRANCH", label: "محافظة", hint: "الانطلاق داخل محافظة واحدة.", icon: MapPin },
  { value: "EVENT", label: "فعالية", hint: "رحلات من مكان الفعالية أو إليه.", icon: PartyPopper },
] as const;

/** Offer cards are public codes (audience ALL) with one extra rule. */
const OFFER_KINDS = new Set(["FIRST_N", "NEW_USERS", "BRANCH", "EVENT"]);

function discountKind(row?: Record<string, unknown>) {
  if (!row) return "ALL";
  if (typeof row.event_name === "string" && row.event_name) return "EVENT";
  if (typeof row.branch_id === "string" && row.branch_id) return "BRANCH";
  if (row.new_users_only === true) return "NEW_USERS";
  if (row.max_customers != null) return "FIRST_N";
  return typeof row.audience === "string" ? row.audience : "ALL";
}

function idsOf(row: Record<string, unknown>, key: string) {
  return Array.isArray(row[key]) ? row[key].map(String) : [];
}

function DiscountCategories({ items, selected }: { items: Record<string, unknown>[]; selected: Set<string> }) {
  const [picked, setPicked] = useState(() => new Set(selected));
  return (
    <div className="grid gap-2">
      {Array.from(picked).map((id) => <input key={id} type="hidden" name="ride_category_ids" value={id} />)}
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const id = String(item.id);
          const active = picked.has(id);
          return (
            <button
              key={id}
              type="button"
              className={`inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold transition-colors ${active ? "bg-teal text-on-teal shadow-glow" : "border border-line bg-heading/[0.03] text-heading hover:border-teal/45"}`}
              onClick={() => setPicked((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })}
            >
              {headline(item)}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted">{picked.size ? t("الكود لهذه الفئات فقط.") : t("اتركها فارغة إذا كان الكود لكل الفئات.")}</p>
    </div>
  );
}

function RideKindField({ name, label, hint, defaultChecked }: { name: string; label: string; hint: string; defaultChecked: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line-strong bg-heading/[0.02] px-4 py-3.5 transition-colors hover:border-teal/45 has-[:checked]:border-teal/55 has-[:checked]:bg-brand/[0.07]">
      <input className="peer sr-only" type="checkbox" name={name} defaultChecked={defaultChecked} />
      <span className="mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-line-strong bg-surface text-transparent transition peer-checked:border-teal peer-checked:bg-teal peer-checked:text-on-teal">
        <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
          <path d="M3.2 8.2 6.4 11.4 12.8 4.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-heading">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted">{hint}</span>
      </span>
    </label>
  );
}

function SuffixField({ label, suffix, children }: { label: string; suffix: string; children: ReactNode }) {
  return (
    <label className="grid content-start gap-1.5 text-sm">
      <span className="text-[13px] font-medium text-body">{label}</span>
      <span className="relative block">
        {children}
        <span className="pointer-events-none absolute inset-y-0 end-3 grid place-items-center text-xs font-semibold text-muted">{suffix}</span>
      </span>
    </label>
  );
}

const MAX_USES = 1_000_000;

function wholeNumber(value: FormDataEntryValue | null) {
  const number = deskNumber(value);
  return number != null && Number.isInteger(number) ? number : null;
}

function eventAreaOf(form: FormData) {
  const raw = String(form.get("event_area") ?? "");
  if (!raw.startsWith("{")) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function deskNumber(value: FormDataEntryValue | null) {
  let text = String(value ?? "").trim();
  text = text.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  text = text.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  text = text.replace(/٫/g, ".").replace(/[^\d.]/g, "");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function discountProblems(form: FormData, audience: string, mode: "create" | "edit") {
  const problems: Record<string, string> = {};
  if (!String(form.get("name") ?? "").trim()) problems.name = t("أدخل اسم الكود.");
  if (mode === "create") {
    const code = String(form.get("code") ?? "").trim();
    if (code.length < 3 || code.length > 32) problems.code = t("الكود من 3 إلى 32 حرفاً.");
    const from = String(form.get("valid_from") ?? "");
    const until = String(form.get("expires_at") ?? "");
    if (!from) problems.valid_from = t("اختر بداية الصلاحية.");
    if (!until) problems.expires_at = t("اختر نهاية الصلاحية.");
    if (from && until && new Date(until) <= new Date(from)) problems.expires_at = t("تاريخ النهاية بعد البداية.");
  }
  const percentage = deskNumber(form.get("percentage"));
  if (percentage == null || percentage <= 0 || percentage > 100) problems.percentage = t("النسبة بين 1 و 100.");
  if (audience === "FIRST_N") {
    const people = wholeNumber(form.get("max_customers"));
    if (people == null || people < 1 || people > MAX_USES) problems.max_customers = t("عدد الأشخاص رقم صحيح أكبر من صفر.");
  }
  const perRaw = String(form.get("per_customer_limit") ?? "").trim();
  const per = wholeNumber(form.get("per_customer_limit"));
  if (perRaw && (per == null || per < 1 || per > 100)) problems.per_customer_limit = t("مرات الاستخدام لكل شخص من 1 إلى 100.");
  if (audience === "BRANCH" && !String(form.get("branch_id") || "")) problems.branch = t("اختر المحافظة.");
  if (audience === "EVENT") {
    if (!String(form.get("event_name") ?? "").trim()) problems.event_name = t("أدخل اسم الفعالية.");
    if (!eventAreaOf(form)) problems.event_area = t("ارسم مكان الفعالية على الخريطة بثلاث نقاط على الأقل.");
  }
  const capRaw = String(form.get("maximum_discount_amount") ?? "").trim();
  if (capRaw && deskNumber(form.get("maximum_discount_amount")) == null) problems.maximum_discount_amount = t("سقف الخصم مبلغ بالليرة السورية.");
  if (audience === "CUSTOMERS" && !form.getAll("customer_ids").map(String).filter(Boolean).length) problems.customers = t("اختر عميلاً واحداً على الأقل.");
  if (audience === "STAMP" && !String(form.get("passport_level_id") || "")) problems.stamp = t("اختر الختم.");
  return problems;
}

function DiscountIssue({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-danger-ink">{message}</p>;
}

function DiscountAudienceFields({
  audience,
  onAudience,
  selectedCustomers = [],
  stampId = "",
  row,
  problems = {},
}: {
  audience: string;
  onAudience: (value: string) => void;
  selectedCustomers?: string[];
  stampId?: string;
  row?: Record<string, unknown>;
  problems?: Record<string, string>;
}) {
  const customers = useGoList("/erp/customers", { limit: 100 });
  const [customerIds, setCustomerIds] = useState(selectedCustomers);
  return (
    <section className="@container grid gap-4">
      <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
        {DISCOUNT_AUDIENCES.map((item) => {
          const active = audience === item.value;
          return (
            <button
              key={item.value}
              type="button"
              className={`grid gap-2 rounded-2xl border px-4 py-4 text-start transition-colors ${active ? "border-teal bg-brand/10 shadow-glow" : "border-line bg-heading/[0.02] hover:border-teal/40"}`}
              onClick={() => onAudience(item.value)}
            >
              <span className={`grid size-9 place-items-center rounded-xl ${active ? "bg-teal text-on-teal" : "bg-heading/[0.05] text-accent"}`}>
                <Icon node={item.icon} size={18} />
              </span>
              <span>
                <span className="block text-sm font-semibold text-heading">{t(item.label)}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted">{t(item.hint)}</span>
              </span>
            </button>
          );
        })}
      </div>
      {audience === "CUSTOMERS" ? (
        <div className="grid content-start gap-1.5">
          <p className="text-[13px] font-medium text-body">{t("العملاء")}</p>
          <SearchMultiSelect
            name="customer_ids"
            value={customerIds}
            onValueChange={setCustomerIds}
            placeholder={t("اختر العملاء")}
            searchPlaceholder={t("ابحث عن عميل")}
            options={(customers.data ?? []).map((row) => ({ value: String(row.id), label: headline(row) }))}
          />
          <DiscountIssue message={problems.customers} />
        </div>
      ) : null}
      {audience === "STAMP" ? (
        <div className="grid content-start gap-1.5">
          <NamedSelect key={stampId || "stamp"} path="/admin/passport/levels" name="passport_level_id" label={t("الختم")} placeholder={t("اختر الختم")} defaultValue={stampId} />
          <DiscountIssue message={problems.stamp} />
        </div>
      ) : null}
      {OFFER_KINDS.has(audience) ? <DiscountOfferFields kind={audience} row={row} problems={problems} /> : null}
    </section>
  );
}

function DiscountOfferFields({ kind, row, problems }: { kind: string; row?: Record<string, unknown>; problems: Record<string, string> }) {
  if (kind === "FIRST_N") {
    return (
      <div className="grid content-start gap-1 sm:max-w-sm">
        <SuffixField label={t("عدد الأشخاص")} suffix={t("شخص")}>
          <input className={`${inputClass} pe-12`} name="max_customers" inputMode="numeric" placeholder="100" defaultValue={row?.max_customers == null ? "" : String(row.max_customers)} />
        </SuffixField>
        <p className="text-xs leading-5 text-muted">{t("بعد اكتمال العدد يظهر لمن يستخدم الكود: انتهت المدة.")}</p>
        <DiscountIssue message={problems.max_customers} />
      </div>
    );
  }
  if (kind === "BRANCH") {
    return (
      <div className="grid content-start gap-1 sm:max-w-sm">
        <NamedSelect path="/erp/branches" name="branch_id" label={t("المحافظة")} placeholder={t("اختر المحافظة")} defaultValue={typeof row?.branch_id === "string" ? row.branch_id : ""} />
        <p className="text-xs leading-5 text-muted">{t("يُقبل الكود فقط إذا كان مكان الانطلاق داخل هذه المحافظة.")}</p>
        <DiscountIssue message={problems.branch} />
      </div>
    );
  }
  if (kind === "EVENT") {
    return (
      <div className="grid gap-4">
        <div className="grid content-start gap-1 sm:max-w-sm">
          <Field label={t("اسم الفعالية")}><input className={inputClass} name="event_name" maxLength={120} defaultValue={typeof row?.event_name === "string" ? row.event_name : ""} /></Field>
          <DiscountIssue message={problems.event_name} />
        </div>
        <div className="grid content-start gap-1.5">
          <p className="text-[13px] font-medium text-body">{t("مكان الفعالية")}</p>
          <ServiceAreaField name="event_area" value={row?.event_area} />
          <p className="text-xs leading-5 text-muted">{t("يُقبل الكود للرحلات من مكان الفعالية أو إليه.")}</p>
          <DiscountIssue message={problems.event_area} />
        </div>
      </div>
    );
  }
  return null;
}

const PER_CUSTOMER_CHOICES = Array.from({ length: 10 }, (_, index) => index + 1);

function PerCustomerField({ row, problem }: { row?: Record<string, unknown>; problem?: string }) {
  const stored = row ? (row.per_customer_limit == null ? "" : String(row.per_customer_limit)) : "1";
  const values = PER_CUSTOMER_CHOICES.map(String);
  if (stored && !values.includes(stored)) values.push(stored);
  const options = [
    ...values.sort((a, b) => Number(a) - Number(b)).map((value) => ({ value, label: value === "1" ? t("مرة واحدة") : value === "2" ? t("مرتان") : `${value} ${t("مرات")}` })),
    { value: "", label: t("بدون حد") },
  ];
  return (
    <div className="grid content-start gap-1">
      <Field label={t("مرات الاستخدام لكل شخص")}>
        <ChoiceSelect name="per_customer_limit" defaultValue={stored} options={options} />
      </Field>
      <p className="text-xs leading-5 text-muted">{t("كم مرة يستطيع العميل الواحد استخدام الكود.")}</p>
      <DiscountIssue message={problem} />
    </div>
  );
}

export function DiscountsScreen() {
  const call = useGo();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  return (
    <div className="grid gap-4">
      <ListScreen
        title={t("أكواد الخصم")}
        hint={t("اضغط الكود لفتح صفحة التفاصيل والتعديل. الدفع النقدي فقط.")}
        path="/admin/discount-codes"
        rowHref={(row) => (typeof row.id === "string" ? `/admin/discounts/${row.id}` : null)}
        action={<button className={btnPrimary} type="button" onClick={() => setCreating(true)}>{t("إضافة كود")}</button>}
        rowActions={(row) => (
          <button
            className="inline-flex h-8 items-center rounded-lg border border-danger/30 bg-danger/10 px-3 text-xs font-semibold text-danger-ink transition-colors hover:bg-danger/15"
            type="button"
            onClick={() => void confirm({
              title: t("حذف الكود"),
              body: `${headline(row)}. ${t("سيُحذف هذا الكود نهائياً ولن يمكن استخدامه.")}`,
              confirm: t("حذف"),
              danger: true,
              perform: () => call(`/admin/discount-codes/${String(row.id)}`, { method: "DELETE" }),
            })}
          >
            {t("حذف")}
          </button>
        )}
      />
      <FormDialog open={creating} title={t("كود خصم جديد")} onClose={() => setCreating(false)}>
        <DiscountForm mode="create" onDone={() => setCreating(false)} />
      </FormDialog>
    </div>
  );
}

export function DiscountDetail({ discountId }: { discountId: string }) {
  const call = useGo();
  const confirm = useConfirm();
  const router = useRouter();
  return (
    <DetailScreen title={t("كود خصم")} path={`/admin/discount-codes/${discountId}`} facts="none">
      {(row) => {
        const used = finiteNumber(row.usage_count) ?? 0;
        const limit = finiteNumber(row.usage_limit);
        const percent = finiteNumber(row.percentage);
        const cap = finiteNumber(row.maximum_discount_amount);
        const maxPeople = finiteNumber(row.max_customers);
        const people = finiteNumber(row.customers_count) ?? 0;
        const kind = DISCOUNT_AUDIENCES.find((item) => item.value === discountKind(row));
        const active = row.status === "ACTIVE";
        return (
          <div className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <DiscountStat
                icon={Percent}
                label={t("نسبة الخصم")}
                value={percent != null ? `${formatCount(percent)}%` : "—"}
                hint={cap != null ? `${t("سقف الخصم")} ${formatCount(cap)} ${t("ل.س")}` : t("بدون سقف")}
              />
              {maxPeople != null ? (
                <DiscountStat
                  icon={Users}
                  label={t("الأشخاص")}
                  value={`${formatCount(people)} / ${formatCount(maxPeople)}`}
                  hint={people >= maxPeople ? t("اكتمل العدد. يظهر للعملاء: انتهت المدة.") : t("من استخدم الكود من أول عدد مسموح.")}
                />
              ) : (
                <DiscountStat
                  icon={Users}
                  label={t("الاستخدام")}
                  value={limit != null ? `${formatCount(used)} / ${formatCount(limit)}` : formatCount(used)}
                  hint={limit != null ? t("مرات الاستخدام من الحد الأقصى.") : t("مرات استخدام الكود حتى الآن.")}
                />
              )}
              <DiscountStat
                icon={CalendarDays}
                label={t("ينتهي")}
                value={whenLabel(row.expires_at) || (typeof row.expires_at === "string" ? row.expires_at.slice(0, 10) : "—")}
              />
              <DiscountStat
                icon={kind?.icon ?? Globe}
                label={t("النطاق")}
                value={kind ? t(kind.label) : "—"}
                hint={typeof row.scope === "string" ? row.scope : undefined}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted">{t("تشغيل الكود")}</p>
                <p className="mt-1 text-sm font-semibold text-heading">
                  {active ? t("الكود متاح للرحلات الجديدة ضمن صلاحيته.") : t("الكود متوقف ولن يُقبل في الرحلات الجديدة.")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {active ? (
                  <button className="inline-flex h-10 items-center rounded-lg border border-danger/30 bg-danger/10 px-4 text-sm font-semibold text-danger-ink transition-colors hover:bg-danger/15" type="button" onClick={() => void confirm({ title: t("إيقاف الكود"), body: `${headline(row)}. ${t("سيتوقف هذا الكود ولن يُقبل في الرحلات الجديدة.")}`, confirm: t("إيقاف"), danger: true, perform: () => call(`/admin/discount-codes/${discountId}/deactivate`, { method: "POST" }) })}>{t("إيقاف")}</button>
                ) : (
                  <button className={btnPrimary} type="button" onClick={() => void confirm({ title: t("تفعيل الكود"), body: `${headline(row)}. ${t("سيصبح هذا الكود متاحاً للاستخدام ضمن صلاحيته.")}`, confirm: t("تفعيل"), perform: () => call(`/admin/discount-codes/${discountId}/activate`, { method: "POST" }) })}>{t("تفعيل")}</button>
                )}
                <button
                  className="inline-flex h-10 items-center rounded-lg border border-danger/30 bg-danger/10 px-4 text-sm font-semibold text-danger-ink transition-colors hover:bg-danger/15"
                  type="button"
                  onClick={() => void confirm({
                    title: t("حذف الكود"),
                    body: `${headline(row)}. ${t("سيُحذف هذا الكود نهائياً ولن يمكن استخدامه.")}`,
                    confirm: t("حذف"),
                    danger: true,
                    perform: async () => {
                      const saved = await call(`/admin/discount-codes/${discountId}`, { method: "DELETE" });
                      if (!isGoFailure(saved)) router.push("/admin/discounts");
                    },
                  })}
                >
                  {t("حذف")}
                </button>
              </div>
            </div>
            <DiscountForm key={String(row.updated_at ?? row.id ?? discountId)} mode="edit" layout="page" row={row} />
          </div>
        );
      }}
    </DetailScreen>
  );
}

function DiscountStat({ icon, label, value, hint }: { icon: typeof Percent; label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium text-muted">{label}</p>
        <span className="grid size-8 place-items-center rounded-lg bg-brand/12 text-accent">
          <Icon node={icon} size={16} />
        </span>
      </div>
      <p className="mt-2 truncate text-lg font-semibold tracking-tight text-heading">{value}</p>
      {hint ? <p className="mt-1 truncate text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function discountPayload(form: FormData, audience: string, mode: "create" | "edit") {
  const until = String(form.get("expires_at") || "");
  const target = audience === "CUSTOMERS"
    ? { audience, customer_ids: form.getAll("customer_ids").map(String).filter(Boolean) }
    : audience === "STAMP"
      ? { audience, passport_level_id: String(form.get("passport_level_id") || "") }
      : { audience: "ALL" as const };
  const cleared = mode === "edit" ? null : undefined;
  const firstPeople = audience === "FIRST_N";
  const event = audience === "EVENT";
  return {
    ...target,
    name: mode === "create" ? String(form.get("name") || "").trim() : textOrUndefined(form.get("name")),
    code: mode === "create" ? String(form.get("code") || "").trim() : undefined,
    percentage: deskNumber(form.get("percentage")) ?? undefined,
    maximum_discount_amount: deskNumber(form.get("maximum_discount_amount")) ?? undefined,
    max_customers: firstPeople ? wholeNumber(form.get("max_customers")) : cleared,
    per_customer_limit: wholeNumber(form.get("per_customer_limit")) ?? cleared,
    new_users_only: audience === "NEW_USERS",
    branch_id: audience === "BRANCH" ? String(form.get("branch_id") || "") : cleared,
    event_name: event ? String(form.get("event_name") || "").trim() : cleared,
    event_area: event ? eventAreaOf(form) : cleared,
    valid_from: mode === "create" ? new Date(String(form.get("valid_from"))).toISOString() : undefined,
    expires_at: until ? new Date(until).toISOString() : undefined,
    immediate_allowed: form.get("immediate_allowed") === "on",
    scheduled_allowed: form.get("scheduled_allowed") === "on",
    ride_category_ids: categoryIds(form) ?? [],
  };
}

function DiscountForm({
  mode,
  row,
  layout = "dialog",
  onDone,
}: {
  mode: "create" | "edit";
  row?: Record<string, unknown>;
  layout?: "dialog" | "page";
  onDone?: () => void;
}) {
  const call = useGo();
  const categories = useGoList("/admin/ride-categories");
  const [audience, setAudience] = useState(() => discountKind(row));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const selected = selectedCategoryIds(row ?? {});
  const items = categories.data ?? [];
  const page = layout === "page";
  const save = <button className={btnDark} type="submit">{t("حفظ الكود")}</button>;
  const fields = (
    <>
      <FormCard title={t("لمن هذا الكود؟")} hint={t("اختر نطاقاً واحداً. عملاء تعني شخصاً أو أكثر.")}>
        <DiscountAudienceFields
          audience={audience}
          onAudience={(value) => {
            setAudience(value);
            setProblems({});
          }}
          selectedCustomers={idsOf(row ?? {}, "customer_ids")}
          stampId={typeof row?.passport_level_id === "string" ? row.passport_level_id : ""}
          row={row}
          problems={problems}
        />
      </FormCard>
      <FormCard title={t("قيمة الخصم")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-1 sm:col-span-2">
            <Field label={t("الاسم")}><input className={inputClass} name="name" defaultValue={typeof row?.name === "string" ? row.name : ""} /></Field>
            <DiscountIssue message={problems.name} />
          </div>
          {mode === "create" ? (
            <div className="grid content-start gap-1">
              <Field label={t("الكود")}><input className={`${inputClass} font-mono tracking-wide`} name="code" /></Field>
              <DiscountIssue message={problems.code} />
            </div>
          ) : null}
          <div className="grid content-start gap-1">
            <SuffixField label={t("النسبة")} suffix="%">
              <input className={`${inputClass} pe-10`} name="percentage" inputMode="decimal" defaultValue={row?.percentage == null ? "" : String(row.percentage)} />
            </SuffixField>
            <DiscountIssue message={problems.percentage} />
          </div>
          <div className="grid content-start gap-1">
            <SuffixField label={t("سقف الخصم")} suffix={t("ل.س")}>
              <input className={`${inputClass} pe-12`} name="maximum_discount_amount" inputMode="decimal" defaultValue={row?.maximum_discount_amount == null ? "" : String(row.maximum_discount_amount)} />
            </SuffixField>
            <DiscountIssue message={problems.maximum_discount_amount} />
          </div>
          <PerCustomerField row={row} problem={problems.per_customer_limit} />
        </div>
      </FormCard>
      <FormCard title={t("الصلاحية والرحلات")}>
        <div className="grid gap-4 sm:grid-cols-2">
          {mode === "create" ? (
            <div className="grid content-start gap-1">
              <DateField name="valid_from" label={t("يبدأ")} />
              <DiscountIssue message={problems.valid_from} />
            </div>
          ) : null}
          <div className="grid content-start gap-1">
            <DateField name="expires_at" label={t("ينتهي")} defaultValue={typeof row?.expires_at === "string" ? row.expires_at : ""} />
            <DiscountIssue message={problems.expires_at} />
          </div>
          <RideKindField name="immediate_allowed" label={t("رحلات فورية")} hint={t("يُقبل الكود عند طلب رحلة الآن.")} defaultChecked={row ? row.immediate_allowed !== false : true} />
          <RideKindField name="scheduled_allowed" label={t("رحلات مجدولة")} hint={t("يُقبل الكود للرحلات المحجوزة مسبقاً.")} defaultChecked={row ? row.scheduled_allowed !== false : true} />
        </div>
      </FormCard>
      <FormCard title={t("الفئات")} hint={t("اتركها فارغة إذا كان الكود لكل الفئات.")} footer={page ? save : undefined}>
        <DiscountCategories items={items} selected={selected} />
        {page ? null : save}
      </FormCard>
    </>
  );
  return (
    <DeskForm
      noValidate
      className={page ? "grid gap-5" : "grid gap-5"}
      action={async (form) => {
        const next = discountProblems(form, audience, mode);
        setProblems(next);
        if (Object.keys(next).length) return;
        const saved = await call(mode === "create" ? "/admin/discount-codes" : `/admin/discount-codes/${String(row?.id)}`, {
          method: mode === "create" ? "POST" : "PATCH",
          body: discountPayload(form, audience, mode),
        });
        if (!isGoFailure(saved)) onDone?.();
      }}
    >
      {fields}
    </DeskForm>
  );
}

export function StaffScreen() {
  return (
    <ListScreen
      title={t("الموظفون")}
      hint={t("ملف التوظيف والراتب. اضغط موظفاً للتفاصيل. إضافة موظف تفتح معالج البيانات.")}
      path="/admin/employees"
      rowHref={(row) => (typeof row.id === "string" ? `/admin/staff/${row.id}` : null)}
      action={
        <Link href="/admin/staff/new" className={btnPrimary}>
          {t("إضافة موظف")}
        </Link>
      }
    />
  );
}

export function StaffDetail({ staffId }: { staffId: string }) {
  return (
    <DetailScreen title={t("موظف")} path={`/admin/employees/${staffId}`} facts="none">
      {(picked) => (
        <div className="grid gap-5">
          <FormCard title={t("الملخص")}>
            <FormGrid>
              <Field label={t("الاسم")}>
                <input className={inputClass} readOnly value={typeof picked.full_name_ar === "string" ? picked.full_name_ar : headline(picked)} />
              </Field>
              <Field label={t("الاسم بالإنجليزي")}>
                <input className={inputClass} readOnly dir="ltr" value={typeof picked.full_name_en === "string" ? picked.full_name_en : ""} />
              </Field>
              <Field label={t("الهاتف")}>
                <input className={inputClass} readOnly dir="ltr" value={typeof picked.phone === "string" ? picked.phone : ""} />
              </Field>
              <Field label={t("البريد")}>
                <input className={inputClass} readOnly dir="ltr" value={typeof picked.email === "string" ? picked.email : ""} />
              </Field>
              <Field label={t("رقم العقد")}>
                <input className={inputClass} readOnly dir="ltr" value={typeof picked.contract_number === "string" ? picked.contract_number : ""} />
              </Field>
              <Field label={t("الراتب الأساسي")}>
                <input
                  className={inputClass}
                  readOnly
                  dir="ltr"
                  value={`${formatScalar("base_salary", picked.base_salary) || "—"} ${typeof picked.salary_currency === "string" ? picked.salary_currency : ""}`}
                />
              </Field>
              <Field label={t("مكان العمل")}>
                <input className={inputClass} readOnly value={typeof picked.work_location === "string" ? picked.work_location : ""} />
              </Field>
              <Field label={t("التخصص")}>
                <input className={inputClass} readOnly value={typeof picked.specialization === "string" ? picked.specialization : ""} />
              </Field>
            </FormGrid>
          </FormCard>
          {isRecord(picked.user) && typeof picked.user.id === "string" ? (
            <FormCard title={t("جلسات دخول المكتب")}>
              <StaffSessions userId={picked.user.id} />
            </FormCard>
          ) : null}
        </div>
      )}
    </DetailScreen>
  );
}

function StaffSessions({ userId }: { userId: string }) {
  const call = useGo();
  const confirm = useConfirm();
  const sessions = useGoList(`/auth/admin/staff/${userId}/sessions`);
  return (
    <div className="grid gap-2">
      {(sessions.data ?? []).map((session) => (
        <div key={String(session.id)} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>{headline(session)} · {typeof session.platform === "string" ? session.platform : t("جهاز")}</span>
          {session.revoked_at ? <span className="text-xs text-muted">{t("ملغاة")}</span> : (
            <button className="text-sm font-semibold text-danger" type="button" onClick={() => void confirm({ title: t("إلغاء الجلسة"), body: t("سيتم إخراج هذا الجهاز من الحساب."), confirm: t("إلغاء الجلسة"), danger: true, perform: () => call(`/auth/admin/staff/${userId}/sessions/${String(session.id)}/revoke`, { method: "POST" }) })}>{t("إلغاء الجلسة")}</button>
          )}
        </div>
      ))}
    </div>
  );
}

export function AuditScreen() {
  return (
    <ListScreen
      title={t("سجل التدقيق")}
      hint={t("من غيّر ماذا ومتى. القراءة للمدير فقط. اضغط سطراً لفتح التفاصيل.")}
      path="/admin/audit"
      segments={{
        param: "category",
        options: [
          { value: "driver", label: t("سائق") },
          { value: "customer", label: t("عميل") },
          { value: "ops", label: t("عمليات داخلية") },
          { value: "topup", label: t("شحن أرصدة") },
          { value: "complaints", label: t("شكاوي") },
          { value: "emergency", label: t("طوارئ") },
        ],
      }}
      rowHref={(row) => (typeof row.id === "string" ? `/admin/audit/${row.id}` : null)}
    />
  );
}

export function AuditDetail({ auditId }: { auditId: string }) {
  return (
    <DetailScreen title={t("عملية تدقيق")} path={`/admin/audit/${auditId}`} facts="none">
      {(record) => <AuditEntryBody record={record} />}
    </DetailScreen>
  );
}

function AuditEntryBody({ record }: { record: Record<string, unknown> }) {
  const action = typeof record.action === "string" ? record.action : "";
  const entityType = typeof record.entity_type === "string" ? record.entity_type : "";
  const entityId = typeof record.entity_id === "string" ? record.entity_id : "";
  const meta = isRecord(record.metadata) ? record.metadata : null;
  const related = isRecord(record.related) ? record.related : null;
  const relatedPath =
    related && typeof related.path === "string"
      ? related.path
      : auditEntityHref(entityType, entityId, meta);

  return (
    <div className="grid gap-5">
      <FormCard title={t("ملخص العملية")}>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3 sm:col-span-2">
            <dt className="text-xs font-medium text-muted">{t("الإجراء")}</dt>
            <dd className="mt-1 text-sm font-semibold text-heading">{action ? auditActionLabel(action) : "—"}</dd>
          </div>
          <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
            <dt className="text-xs font-medium text-muted">{t("الوقت")}</dt>
            <dd className="mt-1 text-sm font-semibold text-heading">{formatScalar("created_at", record.created_at) || "—"}</dd>
          </div>
          <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
            <dt className="text-xs font-medium text-muted">{t("المنفّذ")}</dt>
            <dd className="mt-1 text-sm font-semibold text-heading">{entityName(record.actor) ?? "—"}</dd>
          </div>
          <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
            <dt className="text-xs font-medium text-muted">{t("الدور")}</dt>
            <dd className="mt-1">
              {typeof record.actor_role === "string" && record.actor_role ? (
                <StatusBadge value={record.actor_role} label={enumLabel(record.actor_role)} />
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
            <dt className="text-xs font-medium text-muted">{t("نوع السجل")}</dt>
            <dd className="mt-1 text-sm font-semibold text-heading">{entityType ? auditEntityLabel(entityType) : "—"}</dd>
          </div>
        </dl>
        {relatedPath ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className={btnPrimary} href={relatedPath}>
              {t("فتح العملية المرتبطة")}
            </Link>
          </div>
        ) : null}
      </FormCard>
      {meta && Object.keys(meta).length > 0 ? (
        <FormCard title={t("تفاصيل إضافية")}>
          <dl className="grid gap-3 sm:grid-cols-2">
            {Object.entries(meta).map(([key, value]) => (
              <div key={key} className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
                <dt className="text-xs font-medium text-muted">{labelOf(key)}</dt>
                <dd className="mt-1 break-words text-sm font-semibold text-heading">
                  {typeof value === "string" || typeof value === "number" || typeof value === "boolean"
                    ? formatScalar(key, value) || String(value)
                    : JSON.stringify(value)}
                </dd>
              </div>
            ))}
          </dl>
        </FormCard>
      ) : null}
    </div>
  );
}
