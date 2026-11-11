"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Printer, RotateCcw, Search, UserX } from "lucide";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { fromCents, moneyText, normalizeAmount, toCents } from "@/features/desk/amount";
import { DateField } from "@/features/desk/controls";
import { go, GoApiError } from "@/features/desk/go-api";
import { t } from "@/features/desk/i18n/t";
import { enumLabel } from "@/features/desk/present";
import { Kpi, Pager, PreviewRow, TableShell, tdClass, thClass, whenText, type Paged } from "@/features/desk/store-kit";
import { PosReceiptPrint } from "@/features/desk/store-receipt-print";
import {
  BusyMark,
  btnGhost,
  btnGhostSm,
  btnPrimary,
  chipActive,
  chipClass,
  chipGroup,
  Field,
  inputClass,
  Notice,
  PageTitle,
  Panel,
  PanelHeader,
  StateView,
  StatusBadge,
} from "@/features/desk/ui";
import { Icon } from "@/shared/ui/icon";

type PosMe = {
  operator: { id: string; full_name: string | null };
  store: {
    id: string;
    code: string;
    name: string;
    address: string | null;
    status: "ACTIVE" | "SUSPENDED";
    balance: string;
    currency: string;
    low_balance_threshold: string;
    is_low_balance: boolean;
    max_recharge_amount: string | null;
  };
  today: { recharges: number; amount: string; my_recharges: number; my_amount: string };
  fees: string;
  commission: string;
  minimum_first_recharge: string;
};

type Lookup = {
  driver: { full_name: string | null; mobile_masked: string | null };
  rechargeable: boolean;
  reasons: string[];
  first_recharge: boolean;
  minimum_amount: string | null;
  max_amount: string | null;
  store_balance: string;
  currency: string;
};

export type Receipt = {
  reference: string;
  status: "COMPLETED" | "REVERSED";
  reversed_at: string | null;
  created_at: string;
  amount: string;
  currency: string;
  fees: string;
  commission: string;
  driver_wallet_credit: string;
  store_debit: string;
  driver: { full_name: string | null; mobile_masked: string | null };
  store: { code: string; name: string; address: string | null; mobile_number: string };
  operator: { full_name: string | null };
  store_balance_before: string;
  store_balance_after: string;
  replayed?: boolean;
};

const REASON_TEXT: Record<string, string> = {
  NO_DRIVER_PROFILE: "الحساب ليس حساب سائق مكتمل.",
  ACCOUNT_DISABLED: "حساب السائق معطّل.",
  ACCOUNT_DELETED: "حساب السائق محذوف.",
  DRIVER_SUSPENDED: "السائق موقوف حالياً.",
  STORE_SUSPENDED: "متجرك موقوف، لا يمكن الشحن.",
};

/** Codes where the server definitely did not move money — safe to show as a plain refusal. */
const DEFINITE = new Set([
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "STORE_ACCOUNT_NOT_LINKED",
  "STORE_SUSPENDED",
  "STORE_BALANCE_INSUFFICIENT",
  "RECHARGE_LIMIT_EXCEEDED",
  "RECHARGE_BELOW_MINIMUM",
  "DRIVER_NOT_RECHARGEABLE",
  "CURRENCY_MISMATCH",
  "IDEMPOTENCY_KEY_REUSED",
  "ACCOUNT_DISABLED",
  "FORBIDDEN",
  "ROLE_NOT_ALLOWED",
  "RATE_LIMITED",
]);

function refusalText(error: GoApiError) {
  const extra = error.details;
  const parts = [error.message];
  if (typeof extra.available === "string") parts.push(`${t("رصيد المتجر")}: ${moneyText(extra.available)}`);
  if (typeof extra.minimum === "string") parts.push(`${t("الحد الأدنى")}: ${moneyText(extra.minimum)}`);
  if (typeof extra.limit === "string") parts.push(`${t("الحد الأعلى")}: ${moneyText(extra.limit)}`);
  if (Array.isArray(extra.reasons)) {
    for (const reason of extra.reasons) if (typeof reason === "string" && REASON_TEXT[reason]) parts.push(t(REASON_TEXT[reason]));
  }
  return parts.join(" · ");
}

function usePosMe() {
  return useQuery({ queryKey: ["go", "/pos/me"], queryFn: () => go<PosMe>("/pos/me"), refetchInterval: 60_000 });
}

/** Keep only local Syrian mobile digits (9xxxxxxxx). Accepts 09… or 9… (and Arabic digits). */
function syriaLocalDigits(value: string) {
  let digits = value
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/\D/g, "");
  if (digits.startsWith("963")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 9);
}

function syriaE164(local: string) {
  const digits = syriaLocalDigits(local);
  return /^9\d{8}$/.test(digits) ? `+963${digits}` : null;
}

// ------------------------------------------------------------------ recharge

type Phase =
  | { step: "lookup" }
  | { step: "amount"; mobile: string; found: Lookup }
  | { step: "confirm"; mobile: string; found: Lookup; amount: string; key: string }
  | { step: "done"; receipt: Receipt };

export function PosScreen() {
  const me = usePosMe();
  const client = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ step: "lookup" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [unregistered, setUnregistered] = useState<string | null>(null);
  const [localPhone, setLocalPhone] = useState("");
  const lookupSeq = useRef(0);
  const autoTried = useRef("");
  const store = me.data?.store;
  const suspended = store?.status === "SUSPENDED";

  function reset() {
    setPhase({ step: "lookup" });
    setError(null);
    setUncertain(false);
    setUnregistered(null);
    setLocalPhone("");
    autoTried.current = "";
  }

  async function lookupMobile(raw: string) {
    const mobile = syriaE164(raw);
    if (!mobile) {
      setError(t("أدخل رقم جوال السائق."));
      return;
    }
    const seq = ++lookupSeq.current;
    setBusy(true);
    setError(null);
    setUnregistered(null);
    try {
      const found = await go<Lookup>("/pos/drivers/lookup", { method: "POST", body: { mobile_number: mobile } });
      if (seq !== lookupSeq.current) return;
      setPhase({ step: "amount", mobile, found });
    } catch (failure) {
      if (seq !== lookupSeq.current) return;
      if (failure instanceof GoApiError && failure.code === "NOT_FOUND") setUnregistered(mobile);
      else setError(failure instanceof GoApiError ? refusalText(failure) : t("تعذّر الاتصال بالخادم. أعد المحاولة."));
    } finally {
      if (seq === lookupSeq.current) setBusy(false);
    }
  }

  // Auto-search once the local mobile is complete (9xxxxxxxx), whether typed as 09… or 9….
  useEffect(() => {
    if (phase.step !== "lookup" || suspended) return;
    if (!/^9\d{8}$/.test(localPhone)) {
      autoTried.current = "";
      return;
    }
    if (autoTried.current === localPhone) return;
    const timer = window.setTimeout(() => {
      autoTried.current = localPhone;
      void lookupMobile(localPhone);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [localPhone, phase.step, suspended]);

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    autoTried.current = localPhone;
    await lookupMobile(localPhone || String(new FormData(event.currentTarget).get("mobile_number") ?? ""));
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase.step !== "amount") return;
    const amount = normalizeAmount(new FormData(event.currentTarget).get("amount"));
    if (!amount) {
      setError(t("أدخل مبلغاً موجباً بالأرقام، مثل 50000"));
      return;
    }
    const cents = toCents(amount) ?? BigInt(0);
    const balance = toCents(store?.balance ?? phase.found.store_balance) ?? BigInt(0);
    const max = toCents(phase.found.max_amount);
    const min = toCents(phase.found.minimum_amount);
    if (cents > balance) return setError(`${t("رصيد المتجر غير كافٍ لهذا المبلغ.")} ${t("رصيد المتجر")}: ${moneyText(fromCents(balance))}`);
    if (max != null && cents > max) return setError(`${t("المبلغ أكبر من الحد الأعلى للشحن الواحد.")} ${moneyText(fromCents(max))}`);
    if (min != null && cents < min) return setError(`${t("أول شحن لهذا السائق يجب ألا يقل عن")} ${moneyText(fromCents(min))}`);
    setError(null);
    setUncertain(false);
    setPhase({ step: "confirm", mobile: phase.mobile, found: phase.found, amount, key: crypto.randomUUID() });
  }

  async function commit() {
    if (phase.step !== "confirm" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const receipt = await go<Receipt>("/pos/recharges", {
        method: "POST",
        idempotencyKey: phase.key,
        body: { mobile_number: phase.mobile, amount: phase.amount, currency: phase.found.currency },
      });
      setUncertain(false);
      setPhase({ step: "done", receipt });
      void client.invalidateQueries({ queryKey: ["go"] });
    } catch (failure) {
      if (failure instanceof GoApiError && DEFINITE.has(failure.code)) {
        setUncertain(false);
        setError(refusalText(failure));
        void client.invalidateQueries({ queryKey: ["go", "/pos/me"] });
      } else {
        // Network loss, timeout, server error or still-in-progress: the outcome is unknown. Retrying with the
        // same key either returns the committed receipt or performs the recharge once.
        setUncertain(true);
        setError(failure instanceof GoApiError ? failure.message : null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <PageTitle title={t("شحن محفظة سائق")} hint={store ? `${store.name} · ${store.code}` : undefined} />
      <StateView loading={me.isLoading} error={me.error}>
        {me.data && store ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 print:hidden">
              <Kpi label={t("رصيد المتجر المتاح")} value={moneyText(store.balance)} stripe={store.is_low_balance ? "bg-warning" : "bg-teal"}>
                {store.is_low_balance ? t("الرصيد منخفض، تواصل مع الإدارة لإضافة رصيد.") : `${t("حد التنبيه")}: ${moneyText(store.low_balance_threshold)}`}
              </Kpi>
              <Kpi label={t("شحن المتجر اليوم")} value={moneyText(me.data.today.amount)} stripe="bg-success">
                {`${me.data.today.recharges} ${t("عملية")}`}
              </Kpi>
              <Kpi label={t("شحناتي اليوم")} value={moneyText(me.data.today.my_amount)}>
                {`${me.data.today.my_recharges} ${t("عملية")}`}
              </Kpi>
              <Kpi label={t("الرسوم والعمولة")} value={moneyText(me.data.fees)} stripe="bg-heading/20">
                {t("السائق يستلم المبلغ كاملاً، والمتجر يُخصم منه المبلغ نفسه.")}
              </Kpi>
            </div>
            {suspended ? <Notice>{t("متجرك موقوف حالياً، لا يمكن تنفيذ أي شحن. تواصل مع الإدارة.")}</Notice> : null}

            {phase.step === "done" ? (
              <ReceiptCard receipt={phase.receipt} onNew={reset} />
            ) : (
              <Panel flush className="mx-auto w-full max-w-xl print:hidden">
                <PanelHeader
                  title={phase.step === "lookup" ? t("١. ابحث عن السائق") : phase.step === "amount" ? t("٢. أدخل المبلغ") : t("٣. راجع وأكّد")}
                  action={phase.step !== "lookup" && !busy ? <button type="button" className={btnGhostSm} onClick={reset}>{t("سائق آخر")}</button> : null}
                />
                <div className="grid gap-4 p-5">
                  {phase.step !== "lookup" ? <DriverCard found={phase.found} /> : null}

                  {phase.step === "lookup" ? (
                    <form className="grid gap-4" onSubmit={(event) => void lookup(event)} noValidate>
                      <Field label={t("رقم جوال السائق")}>
                        <div dir="ltr" className={`flex overflow-hidden rounded-xl border border-line-strong bg-surface focus-within:border-teal/55 focus-within:ring-4 focus-within:ring-brand/15 ${suspended ? "opacity-60" : ""}`}>
                          <span className="grid place-items-center border-e border-line bg-heading/[0.04] px-3 text-base font-semibold tabular-nums text-heading">
                            +963
                          </span>
                          <input
                            className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-lg text-heading outline-none placeholder:text-muted"
                            name="mobile_number"
                            value={localPhone}
                            inputMode="tel"
                            autoComplete="off"
                            autoFocus
                            placeholder="9xxxxxxxx"
                            disabled={suspended || busy}
                            aria-describedby="pos-phone-hint"
                            onChange={(event) => {
                              setUnregistered(null);
                              setError(null);
                              setLocalPhone(syriaLocalDigits(event.target.value));
                            }}
                          />
                          {busy ? (
                            <span className="grid place-items-center pe-3 text-muted">
                              <BusyMark />
                            </span>
                          ) : null}
                        </div>
                        <p id="pos-phone-hint" className="mt-1.5 text-xs text-muted">
                          {t("اكتب 9xxxxxxxx أو 09xxxxxxxx — يظهر السائق تلقائياً عند اكتمال الرقم.")}
                        </p>
                      </Field>
                      {unregistered ? (
                        <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
                          <Icon node={UserX} size={20} className="mt-0.5 shrink-0 text-warning-ink" />
                          <div className="grid gap-1 text-sm">
                            <p className="font-semibold text-heading">
                              {t("هذا الرقم غير مسجّل كسائق")} <bdi dir="ltr" className="font-mono">{unregistered}</bdi>
                            </p>
                            <p className="leading-6 text-body">
                              {t("الشحن متاح فقط للسائقين المسجّلين في Beroya On. تأكد من كتابة الرقم بشكل صحيح، أو اطلب من السائق التسجيل لدى فريق العمليات أولاً ثم أعد المحاولة.")}
                            </p>
                            <p className="text-xs text-muted">{t("لم يُخصم أي مبلغ من رصيد متجرك.")}</p>
                          </div>
                        </div>
                      ) : null}
                      <button type="submit" className={btnPrimary} disabled={busy || suspended || !syriaE164(localPhone)}>
                        {busy ? <BusyMark /> : <Icon node={Search} size={16} />}
                        {t("بحث")}
                      </button>
                    </form>
                  ) : null}

                  {phase.step === "amount" ? (
                    phase.found.rechargeable ? (
                      <form className="grid gap-4" onSubmit={review} noValidate>
                        <Field label={`${t("مبلغ الشحن")} (${t("ل.س")})`}>
                          <input className={`${inputClass} text-lg`} name="amount" inputMode="decimal" dir="ltr" autoComplete="off" autoFocus placeholder="50000" />
                        </Field>
                        <ul className="grid gap-1 text-xs text-muted">
                          <li>{t("رصيد المتجر المتاح")}: {moneyText(store.balance)}</li>
                          {phase.found.max_amount ? <li>{t("الحد الأعلى للشحن الواحد")}: {moneyText(phase.found.max_amount)}</li> : null}
                          {phase.found.first_recharge && phase.found.minimum_amount ? (
                            <li>{t("أول شحن لهذا السائق: الحد الأدنى")} {moneyText(phase.found.minimum_amount)}</li>
                          ) : null}
                        </ul>
                        <button type="submit" className={btnPrimary}>{t("متابعة")}</button>
                      </form>
                    ) : (
                      <p className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger-ink">
                        <Icon node={CircleAlert} size={18} className="mt-0.5 shrink-0" />
                        <span>
                          {t("لا يمكن شحن هذا الحساب.")} {phase.found.reasons.map((reason) => t(REASON_TEXT[reason] ?? reason)).join(" ")}
                        </span>
                      </p>
                    )
                  ) : null}

                  {phase.step === "confirm" ? (
                    <div className="grid gap-4">
                      <div className="divide-y divide-line rounded-xl border border-line px-4">
                        <PreviewRow label={t("مبلغ الشحن")} value={moneyText(phase.amount)} strong />
                        <PreviewRow label={t("الرسوم")} value={moneyText(me.data.fees)} />
                        <PreviewRow label={t("العمولة")} value={moneyText(me.data.commission)} />
                        <PreviewRow label={t("يُضاف لمحفظة السائق")} value={moneyText(phase.amount)} strong />
                        <PreviewRow label={t("يُخصم من رصيد المتجر")} value={moneyText(phase.amount)} />
                        <PreviewRow label={t("رصيد المتجر قبل")} value={moneyText(store.balance)} />
                        <PreviewRow
                          label={t("رصيد المتجر بعد")}
                          value={moneyText(fromCents((toCents(store.balance) ?? BigInt(0)) - (toCents(phase.amount) ?? BigInt(0))))}
                          strong
                        />
                      </div>
                      {uncertain ? (
                        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-ink">
                          <Icon node={CircleAlert} size={18} className="mt-0.5 shrink-0" />
                          <span>
                            {t("لم نتأكد من نتيجة العملية بسبب انقطاع الاتصال. اضغط «إعادة المحاولة» — إن كان الشحن قد تمّ ستظهر نفس الفاتورة ولن يُخصم مرة ثانية.")}
                            {error ? ` (${error})` : null}
                          </span>
                        </p>
                      ) : null}
                      <div className="flex justify-end gap-2">
                        {!uncertain ? (
                          <button
                            type="button"
                            className={btnGhost}
                            disabled={busy}
                            onClick={() => {
                              setError(null);
                              setPhase({ step: "amount", mobile: phase.mobile, found: phase.found });
                            }}
                          >
                            {t("تعديل المبلغ")}
                          </button>
                        ) : null}
                        <button type="button" className={btnPrimary} disabled={busy} onClick={() => void commit()}>
                          {busy ? <BusyMark /> : uncertain ? <Icon node={RotateCcw} size={16} /> : null}
                          {busy ? t("جارٍ الشحن…") : uncertain ? t("إعادة المحاولة") : t("تأكيد الشحن")}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {error && !uncertain ? <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger-ink">{error}</p> : null}
                </div>
              </Panel>
            )}
          </>
        ) : null}
      </StateView>
    </div>
  );
}

function DriverCard({ found }: { found: Lookup }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-heading/[0.02] px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-heading">{found.driver.full_name ?? t("سائق")}</p>
        <p className="phone-ltr mt-0.5 text-xs text-muted" dir="ltr" data-phone="">{found.driver.mobile_masked}</p>
      </div>
      {found.rechargeable ? <StatusBadge value="ACTIVE" label={t("قابل للشحن")} /> : <StatusBadge value="SUSPENDED" label={t("غير قابل للشحن")} />}
    </div>
  );
}

// ------------------------------------------------------------------ receipt

export function ReceiptCard({ receipt, onNew }: { receipt: Receipt; onNew?: () => void }) {
  return (
    <div className="mx-auto grid w-full max-w-md gap-3">
      <PosReceiptPrint receipt={receipt} />
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <div className="mb-3 grid justify-items-center gap-1 text-center">
          <Icon node={CircleCheck} size={28} className={receipt.status === "REVERSED" ? "text-danger-ink" : "text-success-ink"} />
          <p className="text-base font-semibold text-heading">
            {receipt.status === "REVERSED" ? t("عملية شحن معكوسة") : t("تم شحن المحفظة بنجاح")}
          </p>
          <p className="text-xs text-muted">{receipt.store.name} · {receipt.store.code}</p>
          {receipt.store.address ? <p className="text-xs text-muted">{receipt.store.address}</p> : null}
        </div>
        <div className="divide-y divide-dashed divide-line border-y border-dashed border-line">
          <PreviewRow label={t("المرجع")} value={<bdi>{receipt.reference}</bdi>} />
          <PreviewRow label={t("التاريخ")} value={whenText(receipt.created_at)} />
          <PreviewRow label={t("السائق")} value={receipt.driver.full_name ?? "—"} />
          <PreviewRow label={t("الجوال")} value={<bdi className="phone-ltr" dir="ltr" data-phone="">{receipt.driver.mobile_masked ?? "—"}</bdi>} />
          <PreviewRow label={t("مبلغ الشحن")} value={moneyText(receipt.amount)} strong />
          <PreviewRow label={t("الرسوم")} value={moneyText(receipt.fees)} />
          <PreviewRow label={t("العمولة")} value={moneyText(receipt.commission)} />
          <PreviewRow label={t("أُضيف لمحفظة السائق")} value={moneyText(receipt.driver_wallet_credit)} strong />
          <PreviewRow label={t("رصيد المتجر بعد العملية")} value={moneyText(receipt.store_balance_after)} />
          <PreviewRow label={t("المشغّل")} value={receipt.operator.full_name ?? "—"} />
          {receipt.status === "REVERSED" ? <PreviewRow label={t("عُكست في")} value={whenText(receipt.reversed_at)} /> : null}
        </div>
        <p className="mt-3 text-center text-[11px] text-muted">{t("احتفظ بهذا الإيصال. المرجع يثبت العملية لدى الإدارة.")}</p>
      </div>
      {receipt.replayed ? <Notice>{t("هذه العملية سُجّلت سابقاً بنفس الطلب، ولم يُخصم المبلغ مرة ثانية.")}</Notice> : null}
      <div className="flex justify-center gap-2 print:hidden">
        <button type="button" className={btnGhost} onClick={() => window.print()}>
          <Icon node={Printer} size={16} />
          {t("طباعة")}
        </button>
        {onNew ? (
          <button type="button" className={btnPrimary} onClick={onNew}>{t("شحن جديد")}</button>
        ) : null}
      </div>
    </div>
  );
}

export function PosReceiptScreen({ reference }: { reference: string }) {
  const receipt = useQuery({
    queryKey: ["go", `/pos/transactions/${reference}`],
    queryFn: () => go<Receipt>(`/pos/transactions/${encodeURIComponent(reference)}`),
  });
  return (
    <div className="grid gap-4">
      <div className="print:hidden">
        <PageTitle title={t("إيصال شحن")} action={<Link href="/erp/pos/transactions" className={btnGhost}>{t("سجل الشحن")}</Link>} />
      </div>
      <StateView loading={receipt.isLoading} error={receipt.error}>
        {receipt.data ? <ReceiptCard receipt={receipt.data} /> : null}
      </StateView>
    </div>
  );
}

// ------------------------------------------------------------------ history

type Filters = { from?: string; to?: string; mobile_number?: string; reference?: string; amount?: string; status?: string };

function dayStart(value: FormDataEntryValue | null) {
  const text = String(value ?? "");
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

export function PosTransactionsScreen() {
  const [filters, setFilters] = useState<Filters>({});
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [formKey, setFormKey] = useState(0);
  const query = { ...filters, status, page, limit: 20 };
  const list = useQuery({
    queryKey: ["go", "/pos/transactions", query],
    queryFn: () => go<Paged<Receipt> & { total_amount: string }>("/pos/transactions", { query }),
    placeholderData: keepPreviousData,
  });

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const from = dayStart(form.get("from"));
    const toDay = dayStart(form.get("to"));
    const to = toDay ? new Date(toDay.getTime() + 86_400_000 - 1) : null;
    const text = (key: string) => String(form.get(key) ?? "").trim() || undefined;
    setFilters({
      from: from?.toISOString(),
      to: to?.toISOString(),
      mobile_number: text("mobile_number"),
      reference: text("reference"),
      amount: text("amount") ? (normalizeAmount(text("amount")) ?? undefined) : undefined,
    });
    setPage(1);
  }

  return (
    <div className="grid gap-4">
      <PageTitle title={t("سجل الشحن")} hint={t("عمليات شحن محافظ السائقين التي نفّذها متجرك.")} />
      <Panel flush>
        <form key={formKey} className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 xl:items-end" onSubmit={apply} noValidate>
          <DateField name="from" label={t("من تاريخ")} />
          <DateField name="to" label={t("إلى تاريخ")} />
          <Field label={t("جوال السائق")}>
            <input className={inputClass} name="mobile_number" inputMode="tel" dir="ltr" />
          </Field>
          <Field label={t("المرجع")}>
            <input className={inputClass} name="reference" dir="ltr" />
          </Field>
          <Field label={t("المبلغ")}>
            <input className={inputClass} name="amount" inputMode="decimal" dir="ltr" />
          </Field>
          <div className="flex gap-2">
            <button type="submit" className={btnPrimary}>{t("تصفية")}</button>
            <button
              type="button"
              className={btnGhost}
              onClick={() => {
                setFilters({});
                setPage(1);
                setFormKey((k) => k + 1);
              }}
            >
              {t("مسح")}
            </button>
          </div>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className={chipGroup}>
            {[
              { value: "", label: "الكل" },
              { value: "COMPLETED", label: "مكتملة" },
              { value: "REVERSED", label: "معكوسة" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className={status === option.value ? chipActive : chipClass}
                onClick={() => {
                  setStatus(option.value);
                  setPage(1);
                }}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
          {list.data ? (
            <p className="text-sm text-muted">
              {t("المجموع")}: <span className="font-semibold tabular-nums text-heading">{moneyText(list.data.total_amount)}</span> · {list.data.total} {t("عملية")}
            </p>
          ) : null}
        </div>
        <StateView bare loading={list.isLoading} error={list.error} empty={!list.isLoading && (list.data?.data.length ?? 0) === 0}>
          <TableShell
            minWidth="52rem"
            head={
              <>
                <th className={thClass}>{t("التاريخ")}</th>
                <th className={thClass}>{t("المرجع")}</th>
                <th className={thClass}>{t("السائق")}</th>
                <th className={thClass}>{t("المبلغ")}</th>
                <th className={thClass}>{t("الحالة")}</th>
                <th className={thClass}>{t("المشغّل")}</th>
                <th className={thClass} />
              </>
            }
          >
            {(list.data?.data ?? []).map((row) => (
              <tr key={row.reference} className="border-b border-line last:border-0">
                <td className={`${tdClass} whitespace-nowrap text-xs text-muted`}>{whenText(row.created_at)}</td>
                <td className={`${tdClass} font-medium`}><bdi>{row.reference}</bdi></td>
                <td className={tdClass}>
                  <p>{row.driver.full_name ?? "—"}</p>
                  <p className="phone-ltr text-xs text-muted" dir="ltr" data-phone="">{row.driver.mobile_masked}</p>
                </td>
                <td className={`${tdClass} font-semibold tabular-nums`}>{moneyText(row.amount)}</td>
                <td className={tdClass}><StatusBadge value={row.status} label={enumLabel(row.status)} /></td>
                <td className={tdClass}>{row.operator.full_name ?? "—"}</td>
                <td className={`${tdClass} text-end`}>
                  <Link href={`/erp/pos/transactions/${encodeURIComponent(row.reference)}`} className={btnGhostSm}>{t("الإيصال")}</Link>
                </td>
              </tr>
            ))}
          </TableShell>
          {list.data ? <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} /> : null}
        </StateView>
      </Panel>
    </div>
  );
}
