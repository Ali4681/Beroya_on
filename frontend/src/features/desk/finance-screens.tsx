"use client";

import { minimumHint, t, toppedUp, walletMinimum } from "@/features/desk/i18n/t";

import Link from "next/link";
import { useState } from "react";

import { goFailureMessage, isGoFailure, useGo, useGoRecord } from "@/features/desk/hooks";
import { STAFF_ENUMS } from "@/features/desk/enums";
import { entityName, enumLabel, factsOf, formatMoney, formatScalar, headline } from "@/features/desk/present";
import { DetailScreen, ListScreen } from "@/features/desk/resource";
import { ChoiceSelect, EnumSelect } from "@/features/desk/select";
import {
  btnDark,
  btnGhost,
  btnGhostSm,
  btnPrimary,
  chipActive,
  chipClass,
  chipGroup,
  DeskForm,
  Facts,
  Field,
  FormCard,
  FormGrid,
  inputClass,
  Notice,
  PageTitle,
  Panel,
  StatusBadge,
} from "@/features/desk/ui";
import { useConfirm } from "@/features/desk/confirm";
import { useDesk } from "@/features/desk/desk-context";
import { DriverGrantsCard } from "@/features/desk/incentive-grants-screens";
import { isRecord } from "@/features/desk/go-api";

function money(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function parseAmount(value: FormDataEntryValue | null) {
  let text = String(value ?? "").trim();
  text = text.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  text = text.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  text = text.replace(/\s+/g, "").replace(/٫/g, ".").replace(/[^\d.,]/g, "");
  if (text.includes(",") && text.includes(".")) {
    text = text.lastIndexOf(",") > text.lastIndexOf(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if ((text.match(/,/g) ?? []).length === 1 && /,\d{1,2}$/.test(text)) {
    text = text.replace(",", ".");
  } else {
    text = text.replace(/,/g, "");
  }
  const amount = Number(text);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function canMutateWallet(role?: string) {
  return role === "WALLET_OPERATOR" || role === "ADMIN" || role === "SUPER_ADMIN";
}

export function WalletsScreen() {
  const [kind, setKind] = useState<"driver" | "customer">("driver");
  return (
    <div className="grid gap-4">
      <PageTitle
        title={t("المحافظ")}
        hint={kind === "driver" ? t("الإيداع يضيف للرصيد، والسحب يخصم من المتاح بعد حجوزات العمولة. الصفحة لا تحسب العمولة.") : t("الإيداع يضيف لرصيد العميل، والسحب يخصم من الرصيد مباشرة.")}
      />
      <div className={chipGroup}>
        <button type="button" className={kind === "driver" ? chipActive : chipClass} onClick={() => setKind("driver")}>{t("السائقون")}</button>
        <button type="button" className={kind === "customer" ? chipActive : chipClass} onClick={() => setKind("customer")}>{t("العملاء")}</button>
      </div>
      {kind === "driver" ? <DriverWallets /> : <CustomerWallets />}
    </div>
  );
}

function DriverWallets() {
  return (
    <ListScreen
      title={t("الأرصدة")}
      hint={t("اضغط محفظة لفتح التفاصيل والإيداع أو السحب.")}
      path="/erp/wallets"
      rowHref={(row) => {
        const id = partyId(row, "driver");
        return id ? `/erp/wallets/driver/${id}` : null;
      }}
    />
  );
}

export function DriverWalletDetail({ driverId }: { driverId: string }) {
  const { session } = useDesk();
  const call = useGo();
  const confirm = useConfirm();
  const config = useGoRecord("/admin/wallet-config");
  const profile = useGoRecord(`/erp/drivers/${driverId}`);
  const [message, setMessage] = useState<string | null>(null);
  const [fault, setFault] = useState<string | null>(null);
  const allowed = canMutateWallet(session?.user.role);
  const minimum = money(config.data?.minimum_initial_topup);
  const name = headline(profile.data ?? { full_name: driverId });

  return (
    <DetailScreen title={t("محفظة سائق")} path={`/erp/drivers/${driverId}`}>
      {() => (
        <div className="grid gap-4">
          <WalletLedger path={`/erp/wallets/${driverId}`} />
          <DriverGrantsCard driverId={driverId} />
          {!allowed ? <Notice>{t("العرض متاح. الإيداع والسحب لمشغّل المحفظة أو المدير.")}</Notice> : null}
          {minimum != null ? <Notice>{walletMinimum(String(minimum))}</Notice> : null}
          {allowed ? (
            <Panel className="grid gap-3">
              <DeskForm
                className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"
                action={async (form) => {
                  setMessage(null);
                  setFault(null);
                  const action = String(form.get("action"));
                  const amountValue = parseAmount(form.get("amount"));
                  if (amountValue == null) {
                    setFault(t("أدخل المبلغ بالأرقام، مثل 30.8"));
                    return;
                  }
                  const withdraw = action === "withdraw";
                  const reason = String(form.get("reason") || "") || undefined;
                  await confirm({
                    title: withdraw ? t("سحب من المحفظة") : t("إيداع في المحفظة"),
                    body: withdraw
                      ? `${t("سيُخصم")} ${formatMoney(amountValue)} ${t("من رصيد")} ${name}.`
                      : `${t("سيُضاف")} ${formatMoney(amountValue)} ${t("إلى رصيد")} ${name}.`,
                    confirm: withdraw ? t("سحب") : t("إيداع"),
                    danger: withdraw,
                    perform: async () => {
                      const result = await call<Record<string, unknown>>(`/erp/wallets/${driverId}/${withdraw ? "withdraw" : "top-up"}`, {
                        method: "POST",
                        idempotent: true,
                        body: { amount: amountValue, reason },
                      });
                      if (isGoFailure(result)) {
                        setFault(goFailureMessage(result));
                        return;
                      }
                      const amount = factsOf(result).find((fact) => fact.key === "amount")?.value;
                      setMessage(withdraw ? t("تم السحب") + ` ${amount ?? ""} · ${name}` : toppedUp(amount ?? "", name));
                    },
                  });
                }}
              >
                <Field label={`${t("المبلغ")} (${t("ل.س")})`}><input className={inputClass} name="amount" inputMode="decimal" min={0.01} step="0.01" placeholder={minimum == null ? t("المبلغ") : minimumHint(String(minimum))} required /></Field>
                <Field label={t("ملاحظة")}><input className={inputClass} name="reason" placeholder={t("سبب اختياري")} /></Field>
                <div className="flex gap-2 self-end">
                  <button className={btnPrimary} type="submit" name="action" value="deposit">{t("إيداع")}</button>
                  <button className={btnDark} type="submit" name="action" value="withdraw">{t("سحب")}</button>
                </div>
              </DeskForm>
              {fault ? <Notice>{fault}</Notice> : null}
              {message ? <p className="text-sm text-success">{message}</p> : null}
            </Panel>
          ) : null}
        </div>
      )}
    </DetailScreen>
  );
}

function CustomerWallets() {
  return (
    <ListScreen
      title={t("الأرصدة")}
      hint={t("اضغط محفظة لفتح التفاصيل والإيداع أو السحب.")}
      path="/erp/customer-wallets"
      rowHref={(row) => {
        const id = partyId(row, "customer");
        return id ? `/erp/wallets/customer/${id}` : null;
      }}
    />
  );
}

export function CustomerWalletDetail({ customerId }: { customerId: string }) {
  const { session } = useDesk();
  const call = useGo();
  const confirm = useConfirm();
  const profile = useGoRecord(`/erp/customers/${customerId}`);
  const [message, setMessage] = useState<string | null>(null);
  const [fault, setFault] = useState<string | null>(null);
  const allowed = canMutateWallet(session?.user.role);
  const name = headline(profile.data ?? { full_name: customerId });

  return (
    <DetailScreen title={t("محفظة عميل")} path={`/erp/customers/${customerId}`}>
      {() => (
        <div className="grid gap-4">
          <WalletLedger path={`/erp/customer-wallets/${customerId}`} />
          {!allowed ? <Notice>{t("العرض متاح. الإيداع والسحب لمشغّل المحفظة أو المدير.")}</Notice> : null}
          {allowed ? (
            <Panel className="grid gap-3">
              <DeskForm
                className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"
                action={async (form) => {
                  setMessage(null);
                  setFault(null);
                  const action = String(form.get("action"));
                  const amountValue = parseAmount(form.get("amount"));
                  if (amountValue == null) {
                    setFault(t("أدخل المبلغ بالأرقام، مثل 30.8"));
                    return;
                  }
                  const withdraw = action === "withdraw";
                  const reason = String(form.get("reason") || "") || undefined;
                  await confirm({
                    title: withdraw ? t("سحب من المحفظة") : t("إيداع في المحفظة"),
                    body: withdraw
                      ? `${t("سيُخصم")} ${formatMoney(amountValue)} ${t("من رصيد")} ${name}.`
                      : `${t("سيُضاف")} ${formatMoney(amountValue)} ${t("إلى رصيد")} ${name}.`,
                    confirm: withdraw ? t("سحب") : t("إيداع"),
                    danger: withdraw,
                    perform: async () => {
                      const result = await call<Record<string, unknown>>(`/erp/customer-wallets/${customerId}/${withdraw ? "withdraw" : "top-up"}`, {
                        method: "POST",
                        idempotent: true,
                        body: { amount: amountValue, reason },
                      });
                      if (isGoFailure(result)) {
                        setFault(goFailureMessage(result));
                        return;
                      }
                      const amount = factsOf(result).find((fact) => fact.key === "amount")?.value;
                      setMessage(`${withdraw ? t("تم السحب") : t("تم الإيداع")} ${amount ?? ""} · ${name}`);
                    },
                  });
                }}
              >
                <Field label={`${t("المبلغ")} (${t("ل.س")})`}><input className={inputClass} name="amount" inputMode="decimal" min={0.01} step="0.01" required /></Field>
                <Field label={t("ملاحظة")}><input className={inputClass} name="reason" placeholder={t("سبب اختياري")} /></Field>
                <div className="flex gap-2 self-end">
                  <button className={btnPrimary} type="submit" name="action" value="deposit">{t("إيداع")}</button>
                  <button className={btnDark} type="submit" name="action" value="withdraw">{t("سحب")}</button>
                </div>
              </DeskForm>
              {fault ? <Notice>{fault}</Notice> : null}
              {message ? <p className="text-sm text-success">{message}</p> : null}
            </Panel>
          ) : null}
        </div>
      )}
    </DetailScreen>
  );
}

function partyId(row: Record<string, unknown>, key: "driver" | "customer") {
  const party = row[key];
  if (party && typeof party === "object" && "id" in party && typeof (party as { id?: unknown }).id === "string") {
    return (party as { id: string }).id;
  }
  const raw = row[`${key}_id`];
  return typeof raw === "string" ? raw : "";
}

function movementLabel(row: Record<string, unknown>) {
  const reason = typeof row.reason === "string" ? row.reason : "";
  if (row.type === "ADJUSTMENT" && reason.startsWith("withdrawal")) return t("سحب");
  return typeof row.type === "string" ? enumLabel(row.type) : "";
}

function walletReasonLabel(reason: string) {
  const raw = reason.trim();
  if (!raw) return "";
  if (raw === "top-up" || raw.startsWith("top-up;") || raw.startsWith("top-up ")) return t("شحن المحفظة");
  if (raw.startsWith("withdrawal")) return t("سحب");
  if (raw.startsWith("voucher_redeem:")) return t("استرداد قسيمة");
  if (raw.startsWith("transfer_out")) return t("تحويل صادر");
  if (raw.startsWith("transfer_in")) return t("تحويل وارد");
  if (raw.startsWith("incentive:")) return raw.slice(raw.indexOf(";") + 1).trim() || t("حافز");
  return raw;
}

function ledgerTitle(row: Record<string, unknown>) {
  if (row.ride && typeof row.ride === "object") {
    const ride = row.ride as Record<string, unknown>;
    const number = typeof ride.public_number === "string" ? ride.public_number : "";
    if (row.type === "COMMISSION_DEDUCTION") {
      return number ? `${t("عمولة رحلة")} ${number}` : t("خصم عمولة");
    }
    return number ? `${headline(ride)}` : headline(row);
  }
  const reason = typeof row.reason === "string" ? row.reason.trim() : "";
  if (!reason) return headline(row);
  return walletReasonLabel(reason);
}

function personName(value: unknown) {
  if (!isRecord(value)) return "";
  return (
    (typeof value.full_name === "string" && value.full_name.trim()) ||
    (typeof value.email === "string" && value.email.trim()) ||
    (typeof value.phone === "string" && value.phone.trim()) ||
    ""
  );
}

function branchName(value: unknown) {
  if (!isRecord(value)) return "";
  return (
    (typeof value.name_ar === "string" && value.name_ar.trim()) ||
    (typeof value.name_en === "string" && value.name_en.trim()) ||
    (typeof value.code === "string" && value.code.trim()) ||
    ""
  );
}

function storeName(value: unknown) {
  if (!isRecord(value)) return "";
  return (
    (typeof value.name === "string" && value.name.trim()) ||
    (typeof value.code === "string" && value.code.trim()) ||
    ""
  );
}

function isCreditMovement(type: unknown) {
  return type === "TOP_UP" || type === "POS_RECHARGE" || type === "INCENTIVE_BONUS" || type === "DISCOUNT_SUBSIDY";
}

function WalletLedger({ path }: { path: string }) {
  const ledger = useGoRecord(path);
  const transactions = Array.isArray(ledger.data?.transactions)
    ? ledger.data.transactions.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    : [];
  const holds = Array.isArray(ledger.data?.holds)
    ? ledger.data.holds.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    : [];
  return (
    <Panel className="grid gap-3">
      <p className="font-semibold">{t("دفتر الحركات")}</p>
      {ledger.data?.wallet && typeof ledger.data.wallet === "object" ? (
        <Facts data={ledger.data.wallet as Record<string, unknown>} />
      ) : (
        <Notice>{t("لا توجد محفظة بعد. أول إيداع ينشئها.")}</Notice>
      )}
      {transactions.length === 0 ? <p className="text-sm text-muted">{t("لا حركات بعد.")}</p> : null}
      {transactions.map((row) => {
        const amount = money(row.amount);
        const commission = money(row.company_commission);
        const fare = money(row.ride_fare);
        const driverNet = money(row.driver_net);
        const payable = money(row.customer_payable);
        const ride = isRecord(row.ride) ? row.ride : null;
        const rideId = ride && typeof ride.id === "string" ? ride.id : typeof row.ride_id === "string" ? row.ride_id : "";
        const actor = personName(row.actor);
        const branch = branchName(row.branch);
        const store = storeName(row.store);
        const showStaffMeta =
          isCreditMovement(row.type) ||
          row.type === "ADJUSTMENT" ||
          row.type === "REVERSAL" ||
          Boolean(actor || branch || store);
        const showRideEconomics = row.type === "COMMISSION_DEDUCTION" && (fare != null || commission != null || driverNet != null);

        return (
          <div key={String(row.id)} className="grid gap-1.5 border-b border-line py-3 text-sm last:border-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-heading">
                  {rideId ? (
                    <Link className="hover:text-accent" href={`/erp/rides/${rideId}`}>
                      {ledgerTitle(row)}
                    </Link>
                  ) : (
                    ledgerTitle(row)
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted">{formatScalar("created_at", row.created_at) || "—"}</p>
              </div>
              <span className={`shrink-0 font-semibold tabular-nums ${isCreditMovement(row.type) ? "text-success" : "text-heading"}`}>
                {movementLabel(row)}
                {amount != null ? ` · ${formatMoney(amount)}` : ""}
              </span>
            </div>

            {showStaffMeta && (branch || store || actor) ? (
              <p className="text-xs leading-5 text-muted">
                {branch ? (
                  <span>
                    {t("الفرع")}: <span className="text-heading">{branch}</span>
                  </span>
                ) : null}
                {store ? (
                  <span>
                    {branch ? " · " : ""}
                    {t("المتجر")}: <span className="text-heading">{store}</span>
                  </span>
                ) : null}
                {actor ? (
                  <span>
                    {branch || store ? " · " : ""}
                    {t("الموظف")}: <span className="text-heading">{actor}</span>
                  </span>
                ) : null}
              </p>
            ) : null}

            {showRideEconomics ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-canvas/60 px-3 py-2 text-xs text-muted ring-1 ring-inset ring-line">
                {fare != null ? (
                  <span>
                    {t("أجرة الرحلة")}: <span className="font-semibold tabular-nums text-heading">{formatMoney(fare)}</span>
                  </span>
                ) : null}
                {commission != null ? (
                  <span>
                    {t("عمولة الشركة")}: <span className="font-semibold tabular-nums text-heading">{formatMoney(commission)}</span>
                  </span>
                ) : null}
                {driverNet != null ? (
                  <span>
                    {t("صافي السائق")}: <span className="font-semibold tabular-nums text-success">{formatMoney(driverNet)}</span>
                  </span>
                ) : null}
                {payable != null && payable !== fare ? (
                  <span>
                    {t("ما دفعه الزبون")}: <span className="font-semibold tabular-nums text-heading">{formatMoney(payable)}</span>
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {holds.length > 0 ? <p className="text-sm font-semibold">{t("حجوزات العمولة")}</p> : null}
      {holds.map((row) => (
        <p key={String(row.id)} className="text-sm text-muted">
          {headline(row.ride && typeof row.ride === "object" ? (row.ride as Record<string, unknown>) : row)} ·{" "}
          {String(row.reserved_amount ?? "")}
        </p>
      ))}
    </Panel>
  );
}

export function EntitlementsScreen() {
  return (
    <ListScreen
      title={t("مستحقات السائقين")}
      path="/erp/finance/driver-entitlements"
      filters={[{ name: "status", label: t("الحالة"), options: [...STAFF_ENUMS.entitlementStatus] }]}
      rowHref={(row) => (typeof row.id === "string" ? `/erp/finance/entitlements/${row.id}` : null)}
    />
  );
}

export function EntitlementDetail({ id }: { id: string }) {
  const call = useGo();
  const confirm = useConfirm();
  return (
    <DetailScreen title={t("مستحق")} path={`/erp/finance/driver-entitlements/${id}`}>
      {() => (
        <>
          <DeskForm action={async (form) => {
            const amount = Number(form.get("approved_amount"));
            const notes = String(form.get("notes") || "") || undefined;
            await confirm({
              title: t("موافقة على المستحق"),
              body: `${t("سيُعتمد")} ${formatMoney(amount)} ${t("ويُغلق طلب المستحق.")}`,
              confirm: t("موافقة"),
              perform: () => call(`/erp/finance/driver-entitlements/${id}/approve`, { method: "POST", body: { approved_amount: amount, notes } }),
            });
          }}>
            <FormCard title={t("موافقة على المستحق")} footer={<button className={btnPrimary} type="submit">{t("موافقة")}</button>}>
              <FormGrid>
                <Field label={`${t("المبلغ المعتمد")} (${t("ل.س")})`}><input className={inputClass} name="approved_amount" required inputMode="decimal" /></Field>
                <Field label={t("ملاحظات")}><input className={inputClass} name="notes" placeholder={t("ملاحظات")} /></Field>
              </FormGrid>
            </FormCard>
          </DeskForm>
          <DeskForm action={async (form) => {
            const notes = String(form.get("notes") || "") || undefined;
            await confirm({
              title: t("رفض المستحق"),
              body: t("سيُرفض طلب المستحق ولن يُصرف."),
              confirm: t("رفض"),
              danger: true,
              perform: () => call(`/erp/finance/driver-entitlements/${id}/reject`, { method: "POST", body: { notes } }),
            });
          }}>
            <FormCard title={t("رفض المستحق")} footer={<button className={btnGhost} type="submit">{t("رفض")}</button>}>
              <Field label={t("سبب الرفض")}><input className={inputClass} name="notes" placeholder={t("سبب الرفض")} /></Field>
            </FormCard>
          </DeskForm>
        </>
      )}
    </DetailScreen>
  );
}

export function CompensationScreen() {
  return (
    <ListScreen
      title={t("التعويضات")}
      hint={t("اضغط تعويضاً لفتح التفاصيل وتحديد من يتحمل التكلفة.")}
      path="/erp/finance/compensations"
      filters={[{ name: "bearer", label: t("الجهة"), options: [...STAFF_ENUMS.compensationBearer] }]}
      rowHref={(row) => (typeof row.id === "string" ? `/erp/finance/compensation/${row.id}` : null)}
    />
  );
}

const BEARER_OPTIONS = [
  { value: "BEROYA", label: enumLabel("BEROYA") },
  { value: "DRIVER", label: enumLabel("DRIVER") },
  { value: "SPLIT", label: enumLabel("SPLIT") },
];

function CompensationAllocationForm({
  compensationId,
  row,
}: {
  compensationId: string;
  row: Record<string, unknown>;
}) {
  const call = useGo();
  const confirm = useConfirm();
  const initial =
    typeof row.bearer === "string" && row.bearer !== "UNASSIGNED" ? row.bearer : "BEROYA";
  const [bearer, setBearer] = useState(initial);
  const applied = row.applied_amount == null ? "" : String(row.applied_amount);

  return (
    <DeskForm
      key={`${String(row.updated_at ?? row.id ?? compensationId)}-${bearer}`}
      action={async (form) => {
        const nextBearer = String(form.get("bearer") || bearer);
        const body: {
          bearer: string;
          beroya_share?: number;
          driver_share?: number;
        } = { bearer: nextBearer };
        if (nextBearer === "SPLIT") {
          body.beroya_share = form.get("beroya_share") ? Number(form.get("beroya_share")) : undefined;
          body.driver_share = form.get("driver_share") ? Number(form.get("driver_share")) : undefined;
        }
        await confirm({
          title: t("توزيع التعويض"),
          body: t("سيُحدد من يتحمل التكلفة. اختيار السائق أو التقسيم يخصم من محفظة السائق فوراً."),
          confirm: t("توزيع"),
          perform: () => call(`/erp/finance/compensations/${compensationId}/allocation`, { method: "POST", idempotent: true, body }),
        });
      }}
    >
      <FormCard title={t("توزيع التعويض")} footer={<button className={btnDark} type="submit">{t("توزيع")}</button>}>
        <p className="mb-3 text-sm text-muted">{t("التطبيق يتم من تفاصيل الرحلة بواسطة المشرف. هذه الشاشة لتحديد من يتحمل التكلفة.")}</p>
        <p className="mb-3 text-sm text-muted">{t("DRIVER أو SPLIT يخصم حصة السائق من محفظته. BEROYA لا يحرّك المحفظة.")}</p>
        <FormGrid>
          <Field label={t("الجهة")}>
            <ChoiceSelect name="bearer" value={bearer} onValueChange={setBearer} options={BEARER_OPTIONS} />
          </Field>
          {bearer === "BEROYA" || bearer === "SPLIT" ? (
            <Field label={`${t("حصة Beroya")} (${t("ل.س")})`}>
              <input
                className={inputClass}
                name="beroya_share"
                inputMode="decimal"
                required={bearer === "SPLIT"}
                readOnly={bearer === "BEROYA"}
                defaultValue={
                  bearer === "BEROYA"
                    ? applied
                    : row.beroya_share == null
                      ? ""
                      : String(row.beroya_share)
                }
              />
            </Field>
          ) : null}
          {bearer === "DRIVER" || bearer === "SPLIT" ? (
            <Field label={`${t("حصة السائق")} (${t("ل.س")})`}>
              <input
                className={inputClass}
                name="driver_share"
                inputMode="decimal"
                required={bearer === "SPLIT"}
                readOnly={bearer === "DRIVER"}
                defaultValue={
                  bearer === "DRIVER"
                    ? applied
                    : row.driver_share == null
                      ? ""
                      : String(row.driver_share)
                }
              />
            </Field>
          ) : null}
        </FormGrid>
      </FormCard>
    </DeskForm>
  );
}

function compensationRideId(row: Record<string, unknown>) {
  if (typeof row.ride_id === "string" && row.ride_id) return row.ride_id;
  if (isRecord(row.ride) && typeof row.ride.id === "string") return row.ride.id;
  return "";
}

function CompensationRidePanel({ compensation }: { compensation: Record<string, unknown> }) {
  const rideId = compensationRideId(compensation);
  const nested = isRecord(compensation.ride) ? compensation.ride : null;
  const rideQuery = useGoRecord(`/erp/rides/${rideId}`, Boolean(rideId));
  const ride = rideQuery.data ?? nested;

  if (!rideId) {
    return (
      <FormCard title={t("تفاصيل الرحلة")}>
        <Notice>{t("لا توجد رحلة مرتبطة بهذا التعويض.")}</Notice>
      </FormCard>
    );
  }

  if (rideQuery.isLoading && !nested) {
    return (
      <FormCard title={t("تفاصيل الرحلة")}>
        <p className="text-sm text-muted">{t("جارٍ تحميل الرحلة…")}</p>
      </FormCard>
    );
  }

  if (!ride || (rideQuery.isError && !nested)) {
    return (
      <FormCard
        title={t("تفاصيل الرحلة")}
        action={
          <Link className={btnGhostSm} href={`/erp/rides/${rideId}`}>
            {t("فتح الرحلة")}
          </Link>
        }
      >
        <Notice>{t("تعذّر تحميل تفاصيل الرحلة.")}</Notice>
      </FormCard>
    );
  }

  const pickup = typeof ride.pickup_address === "string" ? ride.pickup_address : "";
  const dropoff =
    typeof ride.original_destination_address === "string" && ride.original_destination_address
      ? ride.original_destination_address
      : typeof ride.destination_address === "string"
        ? ride.destination_address
        : "";
  const status = typeof ride.status === "string" ? ride.status : "";
  const fare = ride.customer_payable ?? ride.gross_final_fare;

  return (
    <FormCard
      title={t("تفاصيل الرحلة")}
      hint={t("الرحلة التي طُبّق عليها هذا التعويض.")}
      action={
        <Link className={btnGhostSm} href={`/erp/rides/${rideId}`}>
          {t("فتح الرحلة")}
        </Link>
      }
    >
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
          <dt className="text-xs font-medium text-muted">{t("الرحلة")}</dt>
          <dd className="mt-1 text-sm font-semibold text-heading">{entityName(ride) ?? rideId}</dd>
        </div>
        <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
          <dt className="text-xs font-medium text-muted">{t("الحالة")}</dt>
          <dd className="mt-1">{status ? <StatusBadge value={status} label={enumLabel(status)} /> : "—"}</dd>
        </div>
        <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
          <dt className="text-xs font-medium text-muted">{t("الفئة")}</dt>
          <dd className="mt-1 text-sm font-semibold text-heading">{entityName(ride.ride_category) ?? "—"}</dd>
        </div>
        <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3 sm:col-span-2">
          <dt className="text-xs font-medium text-muted">{t("من")}</dt>
          <dd className="mt-1 text-sm font-semibold text-heading">{pickup || "—"}</dd>
        </div>
        <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3 sm:col-span-2 lg:col-span-1">
          <dt className="text-xs font-medium text-muted">{t("إلى")}</dt>
          <dd className="mt-1 text-sm font-semibold text-heading">{dropoff || "—"}</dd>
        </div>
        <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
          <dt className="text-xs font-medium text-muted">{t("العميل")}</dt>
          <dd className="mt-1 text-sm font-semibold text-heading">{entityName(ride.customer) ?? "—"}</dd>
        </div>
        <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
          <dt className="text-xs font-medium text-muted">{t("السائق")}</dt>
          <dd className="mt-1 text-sm font-semibold text-heading">{entityName(ride.driver) ?? "—"}</dd>
        </div>
        <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
          <dt className="text-xs font-medium text-muted">{t("الأجرة")}</dt>
          <dd className="mt-1 text-sm font-semibold text-heading">
            {fare == null ? "—" : formatMoney(typeof fare === "number" ? fare : Number(fare))}
          </dd>
        </div>
        <div className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
          <dt className="text-xs font-medium text-muted">{t("وقت الإنشاء")}</dt>
          <dd className="mt-1 text-sm font-semibold text-heading">{formatScalar("created_at", ride.created_at) || "—"}</dd>
        </div>
      </dl>
    </FormCard>
  );
}

export function CompensationDetail({ compensationId }: { compensationId: string }) {
  return (
    <DetailScreen title={t("تعويض")} path={`/erp/finance/compensations/${compensationId}`}>
      {(row) => (
        <>
          <CompensationRidePanel compensation={row} />
          {row.wallet_posted_at ? (
            <FormCard title={t("توزيع التعويض")}>
              <p className="text-sm text-muted">{t("تم ترحيل الخصم إلى محفظة السائق.")}</p>
              <p className="mt-2 text-sm text-heading">
                {t("الجهة")}: {typeof row.bearer === "string" ? enumLabel(row.bearer) : "—"}
              </p>
            </FormCard>
          ) : (
            <CompensationAllocationForm compensationId={compensationId} row={row} />
          )}
        </>
      )}
    </DetailScreen>
  );
}
