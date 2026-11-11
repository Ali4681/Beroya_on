"use client";

import { CircleAlert, Inbox, Info, type IconNode } from "lucide";
import { usePathname } from "next/navigation";
import { createContext, useContext, useLayoutEffect, useRef, useState, type ComponentProps, type FormEvent, type ReactNode } from "react";

import { beginFormReport, endFormReport, goFailureFields, goFailureMessage, isGoFailure } from "@/features/desk/form-report";
import { NAV_ICONS } from "@/features/desk/icons";
import { requestLabel, t } from "@/features/desk/i18n/t";
import { navMatch } from "@/features/desk/nav";
import { GoApiError } from "@/features/desk/go-api";
import { factsOf, toneOf, type BadgeTone } from "@/features/desk/present";
import { BrandLockup } from "@/shared/ui/brand-lockup";
import { Icon } from "@/shared/ui/icon";

const MARK_SIZE = {
  sm: "h-5",
  md: "h-6",
  lg: "h-7",
};

export function BrandMark({ size = "md", className }: { size?: keyof typeof MARK_SIZE; className?: string }) {
  return <BrandLockup decorative className={`${MARK_SIZE[size]} ${className ?? "text-heading"}`} />;
}

export function PageTitle({ title, hint, action }: { title: string; hint?: string; kicker?: string; action?: ReactNode }) {
  const match = navMatch(usePathname());
  const icon = match ? NAV_ICONS[match.href] : null;
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className={`flex min-w-0 gap-3.5 ${hint ? "items-start" : "items-center"}`}>
        {icon ? (
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand/12 text-accent ring-1 ring-inset ring-brand/25">
            <Icon node={icon} size={20} />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-8 tracking-tight text-heading">{title}</h1>
          {hint ? <p className="mt-0.5 max-w-3xl text-[13px] leading-6 text-muted">{hint}</p> : null}
        </div>
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function Panel({
  children,
  className = "",
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={`rounded-xl border border-line bg-surface shadow-card ${flush ? "" : "p-5"} ${className}`}>
      {children}
    </section>
  );
}

export function PanelHeader({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-heading">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function FormCard({
  title,
  hint,
  action,
  children,
  footer,
  className = "",
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Panel flush className={className}>
      <PanelHeader title={title} hint={hint} action={action} />
      <div className="grid gap-4 p-5">{children}</div>
      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-heading/[0.02] px-5 py-3.5">
          {footer}
        </div>
      ) : null}
    </Panel>
  );
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

export function FormSpan({ children }: { children: ReactNode }) {
  return <div className="sm:col-span-2">{children}</div>;
}

export function Count({ value }: { value: number }) {
  return (
    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-brand/12 px-1.5 text-xs font-semibold tabular-nums text-accent">
      {value}
    </span>
  );
}

/** Keep `+` on the left of phone numbers inside RTL desk UI. */
export function isPhoneField(key: string) {
  return /phone|mobile/i.test(key);
}

export function looksLikePhone(value: string) {
  return /^\+?\d[\d\s().-]{6,18}$/.test(value.trim());
}

export function PhoneText({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  if (children == null || children === "") return null;
  return (
    <bdi className={`phone-ltr tabular-nums ${className}`.trim()} dir="ltr" data-phone="">
      {children}
    </bdi>
  );
}

function Frame({ bare, className, children }: { bare: boolean; className: string; children: ReactNode }) {
  return bare ? <div className={className}>{children}</div> : <Panel flush className={className}>{children}</Panel>;
}

export function EmptyState({ title, hint, icon = Inbox, bare = false }: { title: string; hint?: string; icon?: IconNode; bare?: boolean }) {
  return (
    <Frame bare={bare} className="grid place-items-center gap-2 px-6 py-14 text-center">
      <span className="mb-1 grid size-12 place-items-center rounded-xl bg-brand/12 text-accent ring-1 ring-inset ring-brand/20">
        <Icon node={icon} size={22} />
      </span>
      <p className="text-sm font-semibold text-heading">{title}</p>
      {hint ? <p className="max-w-sm text-sm leading-6 text-muted">{hint}</p> : null}
    </Frame>
  );
}

export function StateView({
  loading,
  error,
  empty,
  bare = false,
  children,
}: {
  loading?: boolean;
  error?: unknown;
  empty?: boolean;
  bare?: boolean;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <Frame bare={bare} className="grid gap-3 p-5">
        <div className="h-3.5 w-40 animate-pulse rounded-full bg-line" />
        <div className="h-10 animate-pulse rounded-lg bg-heading/[0.05]" />
        <div className="h-10 animate-pulse rounded-lg bg-heading/[0.05]" />
        <div className="h-10 w-2/3 animate-pulse rounded-lg bg-heading/[0.05]" />
      </Frame>
    );
  }
  if (error) {
    const api = error instanceof GoApiError ? error : null;
    return (
      <Frame bare={bare} className="flex items-start gap-3 p-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-danger/12 text-danger-ink">
          <Icon node={CircleAlert} size={18} />
        </span>
        <div className="min-w-0 pt-1">
          <p className="text-sm font-semibold text-danger-ink">{api?.message ?? t("تعذّر تحميل البيانات.")}</p>
          {api?.requestId ? <p className="mt-1 text-xs text-muted">{requestLabel(api.requestId)}</p> : null}
        </div>
      </Frame>
    );
  }
  if (empty) {
    return <EmptyState bare={bare} title={t("لا توجد سجلات")} hint={t("هذا النطاق فارغ حالياً. غيّر التصفية أو انتظر وصول بيانات جديدة.")} />;
  }
  return children;
}

export const labelClass = "text-[13px] font-medium text-body";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid content-start gap-1.5 text-sm">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

export const inputBase =
  "h-10 w-full rounded-lg border border-line-strong bg-surface text-sm text-heading outline-none transition placeholder:text-muted/80 hover:border-teal/45 focus:border-teal focus:ring-4 focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-60";

export const inputClass = `${inputBase} px-3.5`;

const btnShape =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55";
const btnSolid = "bg-teal text-on-teal shadow-glow hover:bg-teal-strong";
const btnOutline = "border border-line-strong bg-surface text-heading hover:border-teal/50 hover:bg-heading/[0.03]";

export const btnPrimary = `${btnShape} h-10 px-4 text-sm ${btnSolid}`;

export const btnDark = btnPrimary;

export const btnGhost = `${btnShape} h-10 px-4 text-sm ${btnOutline}`;

export const btnPrimarySm = `${btnShape} h-8 px-3 text-xs ${btnSolid}`;

export const btnGhostSm = `${btnShape} h-8 px-3 text-xs ${btnOutline}`;

export const btnIcon =
  "grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-line bg-surface text-body transition-colors hover:border-teal/45 hover:bg-heading/[0.03] hover:text-heading";

export const btnIconQuiet =
  "grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-heading/5 hover:text-heading disabled:cursor-wait disabled:opacity-50";

export function BusyMark() {
  return <span aria-hidden className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current/30 border-t-current motion-reduce:animate-none" />;
}

const FormDismissContext = createContext<(() => void) | null>(null);

export function FormDismissProvider({ onDone, children }: { onDone: () => void; children: ReactNode }) {
  return <FormDismissContext.Provider value={onDone}>{children}</FormDismissContext.Provider>;
}

function missingFields(form: HTMLFormElement) {
  const issues: Record<string, string> = {};
  const seen = new Set<string>();
  for (const el of form.elements) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
    if (el.disabled || !el.name || el.name === "" || !el.required || seen.has(el.name)) continue;
    seen.add(el.name);
    const empty = el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")
      ? !form.querySelector(`input[name="${CSS.escape(el.name)}"]:checked`)
      : !String(el.value ?? "").trim();
    if (empty) issues[el.name] = t("هذا الحقل مطلوب.");
  }
  return issues;
}

function paintIssues(form: HTMLFormElement, issues: Record<string, string>) {
  form.querySelectorAll<HTMLElement>("[data-issue-text]").forEach((node) => node.remove());
  form.querySelectorAll<HTMLElement>(".desk-invalid").forEach((node) => {
    node.classList.remove("desk-invalid");
    node.removeAttribute("aria-invalid");
  });
  const noted = new Set<string>();
  for (const [field, message] of Object.entries(issues)) {
    form.querySelectorAll<HTMLElement>(`[name="${CSS.escape(field)}"]`).forEach((node) => {
      const hidden = node instanceof HTMLInputElement && (node.type === "hidden" || node.type === "checkbox" || node.type === "radio" || node.classList.contains("sr-only"));
      const target = hidden ? node.closest("label") ?? node.parentElement?.querySelector("button") ?? node : node;
      target.classList.add("desk-invalid");
      target.setAttribute("aria-invalid", "true");
      if (noted.has(field)) return;
      noted.add(field);
      const host = node.closest("label") ?? node.parentElement;
      if (!host) return;
      const note = document.createElement("p");
      note.dataset.issueText = "true";
      note.className = "text-xs leading-5 text-danger-ink";
      note.textContent = message;
      host.appendChild(note);
    });
  }
}

export function DeskForm({
  action,
  children,
  onSubmit,
  ...props
}: Omit<ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (form: FormData) => Promise<unknown> | unknown;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const lock = useRef(false);
  const dismiss = useContext(FormDismissContext);
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState("");

  useLayoutEffect(() => {
    const form = formRef.current;
    if (form) paintIssues(form, issues);
  });

  async function run(form: HTMLFormElement, button: HTMLElement | null) {
    if (lock.current) return;
    const missing = missingFields(form);
    if (Object.keys(missing).length) {
      setIssues(missing);
      setBanner("");
      return;
    }
    lock.current = true;
    setIssues({});
    setBanner("");
    button?.setAttribute("data-loading", "true");
    setBusy(true);
    const report = beginFormReport();
    try {
      // Include the clicked submit control so dual buttons (e.g. deposit/withdraw) work.
      const data = new FormData(form);
      if (
        (button instanceof HTMLButtonElement || button instanceof HTMLInputElement) &&
        button.name
      ) {
        data.set(button.name, button.value);
      }
      const result = await action(data);
      if (isGoFailure(result)) {
        report.failed = true;
        report.message ||= goFailureMessage(result);
        Object.assign(report.fields, goFailureFields(result));
      }
    } catch (error) {
      report.failed = true;
      if (error instanceof GoApiError) {
        report.message ||= error.message;
        Object.assign(report.fields, error.fields);
      } else {
        report.message ||= t("تعذّر تنفيذ الطلب.");
      }
    } finally {
      endFormReport();
      button?.removeAttribute("data-loading");
      setBusy(false);
      lock.current = false;
    }
    if (report.failed) {
      const known = new Set(Object.keys(report.fields).filter((name) => form.querySelector(`[name="${CSS.escape(name)}"]`)));
      const extra = Object.entries(report.fields).filter(([name]) => !known.has(name)).map(([, message]) => message);
      if (!Object.keys(report.fields).length && report.message) extra.push(report.message);
      setIssues({ ...report.fields });
      setBanner(extra.join(" "));
      return;
    }
    if (report.succeeded) dismiss?.();
  }

  return (
    <form
      {...props}
      ref={formRef}
      noValidate
      aria-busy={busy || undefined}
      onInput={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
        if (!target.name || !issues[target.name]) return;
        setIssues((current) => {
          if (!current[target.name]) return current;
          const next = { ...current };
          delete next[target.name];
          return next;
        });
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const button = event.nativeEvent.submitter;
        onSubmit?.(event);
        void run(event.currentTarget, button instanceof HTMLElement ? button : null);
      }}
    >
      {banner ? <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger-ink md:col-span-2">{banner}</p> : null}
      {children}
    </form>
  );
}

export const chipGroup =
  "flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-xl bg-surface-2 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export const chipClass =
  "inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 text-[13px] font-medium text-muted transition-colors duration-200 hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35";

export const chipActive =
  "relative inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-surface px-3 text-[13px] font-semibold text-heading shadow-[0_1px_2px_rgb(16_24_40/0.05),0_0_0_1px_var(--line)] after:pointer-events-none after:absolute after:inset-x-2.5 after:bottom-1 after:h-0.5 after:rounded-full after:bg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35";

export function ChipCount({ value, active }: { value: number; active: boolean }) {
  const empty = value === 0;
  return (
    <span
      className={`inline-grid h-[18px] min-w-[18px] place-items-center rounded-md px-1 text-[11px] font-semibold tabular-nums leading-none ${
        active ? "bg-teal/10 text-accent" : empty ? "text-muted/40" : "bg-heading/[0.06] text-heading"
      }`}
    >
      {value}
    </span>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-brand/30 bg-brand/[0.07] px-4 py-3 text-sm leading-6 text-heading">
      <Icon node={Info} size={18} className="mt-[3px] shrink-0 text-accent" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const TONE_CLASS: Record<BadgeTone, string> = {
  ok: "bg-success/12 text-success-ink ring-success/25",
  warn: "bg-warning/15 text-warning-ink ring-warning/30",
  bad: "bg-danger/12 text-danger-ink ring-danger/25",
  neutral: "bg-heading/[0.05] text-body ring-line-strong",
};

export function StatusBadge({ value, label }: { value: string; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONE_CLASS[toneOf(value)]}`}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      {label ?? value}
    </span>
  );
}

export function Facts({ data }: { data: Record<string, unknown> }) {
  const facts = factsOf(data);
  if (facts.length === 0) return <p className="text-sm text-muted">{t("لا توجد تفاصيل للعرض.")}</p>;
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {facts.map((fact) => {
        const phone = isPhoneField(fact.key) || looksLikePhone(fact.value);
        return (
          <div key={fact.key} className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
            <dt className="text-xs font-medium text-muted">{fact.label}</dt>
            <dd className="mt-1 break-words text-sm font-semibold text-heading" dir={phone ? "ltr" : undefined}>
              {fact.badge ? (
                <StatusBadge value={fact.badge} label={fact.value} />
              ) : phone ? (
                <PhoneText>{fact.value}</PhoneText>
              ) : (
                fact.value
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
