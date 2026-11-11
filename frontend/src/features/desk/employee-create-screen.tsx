"use client";

import { Check, ChevronLeft, FileText, Trash2, Upload } from "lucide";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent } from "react";

import { DateField } from "@/features/desk/controls";
import { useDesk } from "@/features/desk/desk-context";
import { isGoFailure, useGo } from "@/features/desk/hooks";
import { t } from "@/features/desk/i18n/t";
import { NamedSelect } from "@/features/desk/resource";
import { ChoiceSelect, EnumSelect } from "@/features/desk/select";
import { Icon } from "@/shared/ui/icon";
import {
  btnDark,
  btnGhost,
  btnGhostSm,
  btnPrimary,
  DeskForm,
  Field,
  FormCard,
  FormGrid,
  FormSpan,
  inputClass,
  Notice,
  PageTitle,
} from "@/features/desk/ui";

const DOC_SLOTS = [
  { id: "cv", label: "السيرة الذاتية", hint: "PDF أو صورة" },
  { id: "id_front", label: "صورة وجه الهوية", hint: "PNG · JPG · WEBP · PDF" },
  { id: "id_back", label: "صورة خلف الهوية", hint: "PNG · JPG · WEBP · PDF" },
  { id: "certificate", label: "الشهادة", hint: "PDF أو صورة" },
  { id: "driver_license", label: "شهادة سواقة", hint: "PDF أو صورة" },
  { id: "medical_report", label: "تقرير طبي", hint: "PDF أو صورة" },
] as const;

type DocSlotId = (typeof DOC_SLOTS)[number]["id"];

const STEPS = [
  { id: "personal", label: "البيانات الشخصية" },
  { id: "contract", label: "التوظيف والعقد" },
  { id: "finance", label: "البيانات المالية" },
  { id: "qualifications", label: "المؤهلات والخبرات" },
  { id: "documents", label: "قسم الوثائق" },
] as const;

const GENDERS = [
  { value: "MALE", label: "ذكر" },
  { value: "FEMALE", label: "أنثى" },
];

const MARITAL = [
  { value: "SINGLE", label: "أعزب" },
  { value: "MARRIED", label: "متزوج" },
  { value: "DIVORCED", label: "مطلق" },
  { value: "WIDOWED", label: "أرمل" },
];

const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((value) => ({ value, label: value }));

const CONTRACT_TYPES = [
  { value: "PERMANENT", label: "دائم" },
  { value: "TEMPORARY", label: "مؤقت" },
  { value: "PROBATION", label: "تجريبي" },
];

const EMP_STATUS = [
  { value: "ACTIVE", label: "نشط" },
  { value: "SUSPENDED", label: "موقوف" },
  { value: "ENDED", label: "منتهٍ" },
];

const WORK_DAYS = [5, 6, 7].map((value) => ({ value: String(value), label: `${value} أيام` }));

const CURRENCIES = [
  { value: "SYP", label: "ل.س" },
  { value: "USD", label: "USD" },
];

const BRANCH_REQUIRED_ROLES = new Set(["CUSTOMER_SERVICE", "CUSTOMER_SERVICE_SUPERVISOR", "WALLET_OPERATOR"]);

function text(form: FormData, name: string) {
  const value = String(form.get(name) ?? "").trim();
  return value || undefined;
}

type FieldIssue = { field: string; message: string };

function deskLoginIssue(form: FormData): FieldIssue | null {
  const email = text(form, "email");
  const password = String(form.get("login_password") ?? "");
  const role = text(form, "login_role");
  const branch = text(form, "branch_id");
  if (!email) return { field: "email", message: t("البريد إجباري لدخول المكتب.") };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { field: "email", message: t("أدخل بريداً صالحاً.") };
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { field: "login_password", message: t("ثمانية أحرف على الأقل، وفيها حرف ورقم.") };
  }
  if (!role) return { field: "login_role", message: t("حدد دور الموظف.") };
  if (BRANCH_REQUIRED_ROLES.has(role) && !branch) return { field: "branch_id", message: t("حدد فرع الموظف.") };
  return null;
}

function focusNamedField(name: string) {
  const el = document.querySelector<HTMLElement>(`[name="${name}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  if ("focus" in el && typeof el.focus === "function") {
    window.setTimeout(() => el.focus(), 180);
  }
}

function num(form: FormData, name: string) {
  const raw = String(form.get(name) ?? "").trim();
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

async function fileMeta(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return {
    filename: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    data_base64: btoa(binary),
  };
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentPick({
  label,
  hint,
  file,
  onChange,
  accept = "image/jpeg,image/png,image/webp,application/pdf,.pdf",
}: {
  label: string;
  hint: string;
  file: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function take(next: File | undefined) {
    if (!next) return;
    onChange(next);
  }

  function drop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setOver(false);
    take(event.dataTransfer.files[0]);
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-body">{label}</p>
          <p className="mt-0.5 text-xs leading-5 text-muted">{hint}</p>
        </div>
        {file ? (
          <button className={btnGhostSm} type="button" onClick={() => onChange(null)}>
            <Icon node={Trash2} size={14} />
            {t("إزالة")}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={`grid min-h-[132px] place-items-center overflow-hidden rounded-2xl border border-dashed p-3 text-center transition ${
          over ? "border-teal bg-teal/10" : file ? "border-brand/40 bg-brand/5" : "border-line-strong bg-canvas/50 hover:border-teal/45"
        }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="max-h-28 w-full rounded-xl object-contain" />
        ) : file ? (
          <div className="grid justify-items-center gap-2 px-2">
            <span className="grid size-11 place-items-center rounded-xl bg-teal/15 text-teal">
              <Icon node={FileText} size={20} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-heading">{file.name}</p>
              <p className="mt-0.5 text-xs text-muted">{formatBytes(file.size)}</p>
            </div>
          </div>
        ) : (
          <div className="grid justify-items-center gap-2 px-2">
            <span className="grid size-11 place-items-center rounded-xl bg-heading/[0.05] text-accent ring-1 ring-inset ring-line">
              <Icon node={Upload} size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-heading">{t("رفع مستند")}</p>
              <p className="mt-0.5 text-xs text-muted">{t("اسحب الملف هنا أو اضغط للاختيار")}</p>
            </div>
          </div>
        )}
      </button>
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept={accept}
        onChange={(event) => {
          take(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}

export function EmployeeCreateScreen() {
  const router = useRouter();
  const call = useGo();
  const { branchId } = useDesk();
  const [step, setStep] = useState(0);
  const [fault, setFault] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [docs, setDocs] = useState<Partial<Record<DocSlotId, File | null>>>({});
  const [avatar, setAvatar] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const progress = saving ? 100 : ((step + 1) / STEPS.length) * 100;

  function applyIssue(issue: FieldIssue | null) {
    if (!issue) {
      setFieldErrors({});
      return false;
    }
    setStep(0);
    setFieldErrors({ [issue.field]: issue.message });
    setFault(null);
    // Wait for step-0 fields to mount before scrolling/focusing.
    window.setTimeout(() => focusNamedField(issue.field), 220);
    return true;
  }

  return (
    <div className="relative grid gap-5">
      <header className="grid gap-3">
        <Link
          href="/admin/staff"
          className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-accent transition-colors hover:text-brand-strong"
        >
          <Icon node={ChevronLeft} size={15} className="rtl:rotate-180" />
          {t("العودة إلى القائمة")}
        </Link>
        <PageTitle
          title={t("موظف جديد")}
          hint={t("إجباري: دخول المكتب (بريد + كلمة مرور + دور) والراتب الأساسي. باقي الحقول اختيارية.")}
        />
      </header>

      <nav aria-label={t("خطوات إضافة الموظف")} className="grid gap-3">
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <span>
            {t("الخطوة")} {step + 1} {t("من")} {STEPS.length}
          </span>
          <span>{t(STEPS[step].label)}</span>
        </div>
        <div className="relative h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className="absolute inset-y-0 start-0 rounded-full bg-gradient-to-l from-brand to-teal transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((item, index) => {
            const active = !saving && index === step;
            const done = saving || index < step;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={saving || (!done && !active)}
                  aria-current={active ? "step" : undefined}
                  onClick={() => {
                    if (saving || !done) return;
                    setFault(null);
                    setFieldErrors({});
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
                  {t(item.label)}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {fault ? <Notice>{fault}</Notice> : null}

      <DeskForm
        className="grid gap-5"
        action={async (form) => {
          setFault(null);
          setFieldErrors({});
          if (step === 0) {
            if (applyIssue(deskLoginIssue(form))) return;
          }
          if (step < STEPS.length - 1) {
            if (step === 2) {
              const salary = num(form, "base_salary");
              if (salary == null) {
                setFieldErrors({ base_salary: t("الراتب الأساسي إجباري.") });
                window.setTimeout(() => focusNamedField("base_salary"), 50);
                return;
              }
            }
            setStep(step + 1);
            return;
          }

          if (applyIssue(deskLoginIssue(form))) return;
          const salary = num(form, "base_salary");
          if (salary == null) {
            setStep(2);
            setFieldErrors({ base_salary: t("الراتب الأساسي إجباري.") });
            window.setTimeout(() => focusNamedField("base_salary"), 50);
            return;
          }

          setSaving(true);
          const documents: Record<string, unknown> = {};
          for (const slot of DOC_SLOTS) {
            const file = docs[slot.id];
            if (file) documents[slot.id] = await fileMeta(file);
          }
          const avatarMeta = avatar ? await fileMeta(avatar) : null;

          const body = {
            full_name_ar: text(form, "full_name_ar"),
            full_name_en: text(form, "full_name_en"),
            phone: text(form, "phone"),
            email: text(form, "email"),
            avatar_base64: avatarMeta?.data_base64,
            date_of_birth: text(form, "date_of_birth"),
            gender: text(form, "gender"),
            marital_status: text(form, "marital_status"),
            national_id: text(form, "national_id"),
            nationality: text(form, "nationality"),
            blood_type: text(form, "blood_type"),
            allergies: text(form, "allergies"),
            address: text(form, "address"),
            emergency_contact: text(form, "emergency_contact"),
            emergency_phone: text(form, "emergency_phone"),
            contract_type: text(form, "contract_type"),
            employment_status: text(form, "employment_status"),
            start_date: text(form, "start_date"),
            decision_date: text(form, "decision_date"),
            daily_hours: num(form, "daily_hours"),
            work_days_per_week: num(form, "work_days_per_week"),
            work_location: text(form, "work_location"),
            confidentiality_notes: text(form, "confidentiality_notes"),
            base_salary: salary,
            salary_currency: text(form, "salary_currency") ?? "SYP",
            specialization: text(form, "specialization"),
            university: text(form, "university"),
            graduation_year: num(form, "graduation_year"),
            skills: text(form, "skills"),
            branch_id: text(form, "branch_id"),
            login_password: text(form, "login_password"),
            login_role: text(form, "login_role"),
            documents,
          };

          const saved = await call<{ id?: string }>("/admin/employees", {
            method: "POST",
            idempotent: true,
            body,
          });
          setSaving(false);
          if (isGoFailure(saved)) {
            setFault(saved.message || t("تعذّر حفظ الموظف."));
            return;
          }
          router.push(typeof saved.id === "string" ? `/admin/staff/${saved.id}` : "/admin/staff");
        }}
      >
        {/* Keep all fields mounted so FormData has every step on final submit */}
        <div className={step === 0 ? "grid gap-5" : "hidden"}>
          <FormCard title={t("البيانات الشخصية")} hint={t("اختيارية بالكامل — عدا دخول المكتب أدناه")}>
            <div className="mb-5 max-w-xs">
              <DocumentPick
                label={t("الصورة الشخصية")}
                hint={t("تظهر في قائمة الحساب بالداشبورد · PNG · JPG · WEBP")}
                file={avatar}
                onChange={setAvatar}
                accept="image/jpeg,image/png,image/webp"
              />
            </div>
            <FormGrid>
              <Field label={t("الاسم الكامل")}>
                <input className={inputClass} name="full_name_ar" />
              </Field>
              <Field label={t("الاسم بالإنجليزي")} help={t("بيانات الدخول تستبدل المسافات بـ _ عند الحاجة")}>
                <input className={inputClass} name="full_name_en" dir="ltr" />
              </Field>
              <Field label={t("الهاتف")}>
                <input className={inputClass} name="phone" dir="ltr" inputMode="tel" />
              </Field>
              <Field label={`${t("البريد")} *`}>
                <input
                  className={`${inputClass} ${fieldErrors.email ? "border-danger ring-4 ring-danger/15" : ""}`}
                  name="email"
                  type="email"
                  dir="ltr"
                  autoComplete="username"
                  aria-invalid={!!fieldErrors.email}
                />
                {fieldErrors.email ? <span className="text-xs font-medium text-danger">{fieldErrors.email}</span> : null}
              </Field>
              <DateField name="date_of_birth" label={t("تاريخ الميلاد")} />
              <Field label={t("الجنس")}>
                <ChoiceSelect name="gender" options={GENDERS} emptyLabel={t("اختياري")} />
              </Field>
              <Field label={t("الحالة الاجتماعية")}>
                <ChoiceSelect name="marital_status" options={MARITAL} emptyLabel={t("اختياري")} />
              </Field>
              <Field label={t("رقم الهوية")}>
                <input className={inputClass} name="national_id" dir="ltr" />
              </Field>
              <Field label={t("الجنسية")}>
                <input className={inputClass} name="nationality" />
              </Field>
              <Field label={t("فصيلة الدم")}>
                <ChoiceSelect name="blood_type" options={BLOOD} emptyLabel={t("اختياري")} />
              </Field>
              <Field label={t("حساسية")}>
                <input className={inputClass} name="allergies" />
              </Field>
              <FormSpan>
                <Field label={t("العنوان")}>
                  <textarea className={`${inputClass} min-h-24`} name="address" />
                </Field>
              </FormSpan>
              <Field label={t("جهة اتصال الطوارئ")}>
                <input className={inputClass} name="emergency_contact" />
              </Field>
              <Field label={t("هاتف الطوارئ")}>
                <input className={inputClass} name="emergency_phone" dir="ltr" inputMode="tel" />
              </Field>
            </FormGrid>
          </FormCard>
          <FormCard title={t("دخول المكتب")} hint={t("إجباري — يمنح الموظف دخول الداشبورد بالبريد وكلمة المرور")}>
            <FormGrid>
              <Field label={`${t("كلمة المرور")} *`}>
                <input
                  className={`${inputClass} ${fieldErrors.login_password ? "border-danger ring-4 ring-danger/15" : ""}`}
                  name="login_password"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={!!fieldErrors.login_password}
                />
                <span className={`text-xs ${fieldErrors.login_password ? "font-medium text-danger" : "text-muted"}`}>
                  {fieldErrors.login_password || t("ثمانية أحرف على الأقل، وفيها حرف ورقم.")}
                </span>
              </Field>
              <Field label={`${t("الدور")} *`}>
                <EnumSelect kind="staffRole" name="login_role" defaultValue="CUSTOMER_SERVICE" />
                {fieldErrors.login_role ? <span className="text-xs font-medium text-danger">{fieldErrors.login_role}</span> : null}
              </Field>
              <NamedSelect
                path="/erp/branches"
                name="branch_id"
                label={t("الفرع")}
                placeholder={t("اختر الفرع")}
                defaultValue={branchId ?? ""}
              />
              {fieldErrors.branch_id ? <span className="text-xs font-medium text-danger">{fieldErrors.branch_id}</span> : null}
            </FormGrid>
          </FormCard>
        </div>

        <div className={step === 1 ? "grid gap-5" : "hidden"}>
          <FormCard
            title={t("التوظيف والعقد")}
            hint={t("بيانات عقد العمل — يُولّد رقم العقد تلقائياً من النظام بعد الإنشاء")}
          >
            <FormGrid>
              <Field label={t("رقم العقد")} help={t("الرقم العشوائي يأتي من الباكند")}>
                <input className={inputClass} value={t("يُولّد تلقائياً")} disabled readOnly />
              </Field>
              <Field label={t("نوع العقد")}>
                <ChoiceSelect name="contract_type" options={CONTRACT_TYPES} defaultValue="PERMANENT" />
              </Field>
              <Field label={t("الحالة")}>
                <ChoiceSelect name="employment_status" options={EMP_STATUS} defaultValue="ACTIVE" />
              </Field>
              <DateField name="start_date" label={t("تاريخ البدء")} />
              <DateField name="decision_date" label={t("تاريخ القرار")} />
              <Field label={t("ساعات العمل اليومية")}>
                <input className={inputClass} name="daily_hours" type="number" min={0} max={24} step={0.5} dir="ltr" />
              </Field>
              <Field label={t("أيام العمل بالأسبوع")}>
                <ChoiceSelect name="work_days_per_week" options={WORK_DAYS} defaultValue="6" />
              </Field>
              <FormSpan>
                <Field label={t("مكان العمل")} help={t("الموقع الافتراضي للقطاعات غير المرتبطة بفرع")}>
                  <input className={inputClass} name="work_location" />
                </Field>
              </FormSpan>
              <FormSpan>
                <Field label={t("التزامات سرية")}>
                  <textarea className={`${inputClass} min-h-28`} name="confidentiality_notes" placeholder={t("أضف ملاحظة...")} />
                </Field>
              </FormSpan>
            </FormGrid>
          </FormCard>
        </div>

        <div className={step === 2 ? "grid gap-5" : "hidden"}>
          <FormCard
            title={t("البيانات المالية")}
            hint={t("الراتب الأساسي إجباري. العهد اختيارية.")}
          >
            <FormGrid>
              <Field label={`${t("الراتب الأساسي")} *`}>
                <div className="flex gap-2">
                  <input
                    className={`${inputClass} ${fieldErrors.base_salary ? "border-danger ring-4 ring-danger/15" : ""}`}
                    name="base_salary"
                    type="number"
                    min={0}
                    step={1}
                    dir="ltr"
                    aria-invalid={!!fieldErrors.base_salary}
                  />
                  <ChoiceSelect name="salary_currency" options={CURRENCIES} defaultValue="SYP" />
                </div>
                {fieldErrors.base_salary ? <span className="text-xs font-medium text-danger">{fieldErrors.base_salary}</span> : null}
              </Field>
            </FormGrid>
            <Notice>{t("العمولات والعهد يمكن إضافتها لاحقاً من ملف الموظف.")}</Notice>
          </FormCard>
        </div>

        <div className={step === 3 ? "grid gap-5" : "hidden"}>
          <FormCard title={t("المؤهلات والخبرات")} hint={t("اختيارية بالكامل")}>
            <FormGrid>
              <Field label={t("التخصص")}>
                <input className={inputClass} name="specialization" placeholder={t("أدخل التخصص")} />
              </Field>
              <Field label={t("الجامعة")}>
                <input className={inputClass} name="university" placeholder={t("أدخل الجامعة")} />
              </Field>
              <Field label={t("سنة التخرج")}>
                <input className={inputClass} name="graduation_year" type="number" min={1950} max={2100} dir="ltr" />
              </Field>
              <Field label={t("المهارات")} help={t("افصل المهارات بفاصلة")}>
                <input className={inputClass} name="skills" placeholder={t("أدخل المهارات")} />
              </Field>
            </FormGrid>
            <Notice>{t("الشهادات واللغات والتراخيص يمكن إضافتها لاحقاً من ملف الموظف.")}</Notice>
          </FormCard>
        </div>

        <div className={step === 4 ? "grid gap-5" : "hidden"}>
          <FormCard
            title={t("قسم الوثائق")}
            hint={t("ارفع مستندات الملف اختيارياً. العقد يُنشأ تلقائياً من خطوة التوظيف.")}
          >
            <div className="grid gap-4 p-1 sm:grid-cols-2">
              {DOC_SLOTS.map((slot) => (
                <DocumentPick
                  key={slot.id}
                  label={t(slot.label)}
                  hint={t(slot.hint)}
                  file={docs[slot.id] ?? null}
                  onChange={(file) => setDocs((current) => ({ ...current, [slot.id]: file }))}
                />
              ))}
            </div>
          </FormCard>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            className={btnGhost}
            type="button"
            disabled={step === 0 || saving}
            onClick={() => {
              setFault(null);
              setStep((current) => Math.max(0, current - 1));
            }}
          >
            {t("السابق")}
          </button>
          <button className={step === STEPS.length - 1 ? btnDark : btnPrimary} type="submit" disabled={saving}>
            {saving ? t("جاري الحفظ…") : step === STEPS.length - 1 ? t("حفظ الموظف") : t("التالي")}
          </button>
        </div>
      </DeskForm>
    </div>
  );
}
