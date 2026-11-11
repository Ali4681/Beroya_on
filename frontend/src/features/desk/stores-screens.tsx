"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, CircleCheck, CircleX, Copy, Eye, EyeOff, Plus, Printer, RefreshCw, Search } from "lucide";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { fromCents, moneyText, normalizeAmount, toCents } from "@/features/desk/amount";
import { useConfirm } from "@/features/desk/confirm";
import { useDesk } from "@/features/desk/desk-context";
import { go, GoApiError } from "@/features/desk/go-api";
import { goFailure, useGoList } from "@/features/desk/hooks";
import { bilingualName, t } from "@/features/desk/i18n/t";
import { enumLabel, headline } from "@/features/desk/present";
import { ChoiceSelect } from "@/features/desk/select";
import { LocationPickerField } from "@/features/desk/service-area-map";
import { Dialog, Kpi, Pager, PreviewRow, TableShell, tdClass, thClass, whenText, type Paged } from "@/features/desk/store-kit";
import { generatePassword, suggestStoreEmail } from "@/features/desk/store-account";
import { StoreReceiptPrint, type ReceiptStore } from "@/features/desk/store-receipt-print";
import {
  btnGhost,
  btnGhostSm,
  btnPrimary,
  btnPrimarySm,
  chipActive,
  chipClass,
  chipGroup,
  DeskForm,
  EmptyState,
  Field,
  FormGrid,
  FormSpan,
  inputClass,
  labelClass,
  Notice,
  PageTitle,
  Panel,
  PanelHeader,
  StateView,
  StatusBadge,
} from "@/features/desk/ui";
import { Icon } from "@/shared/ui/icon";

type Branch = { id: string; code: string; name_ar: string; name_en: string | null };

type StoreRow = {
  id: string;
  code: string;
  name: string;
  owner_name: string;
  mobile_number: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  branch: Branch | null;
  status: "ACTIVE" | "SUSPENDED";
  status_reason: string | null;
  status_changed_at: string | null;
  balance: string;
  currency: string;
  low_balance_threshold: string;
  max_recharge_amount: string | null;
  is_low_balance: boolean;
  created_at: string;
  operators_count?: number;
  last_recharge_at?: string | null;
  recharges_today?: { count: number; amount: string };
};

type Operator = { id: string; full_name: string | null; email: string | null; phone: string | null; is_active: boolean; last_login_at: string | null; created_at: string };

type Sum = { amount: string; count: number };

type StoreDetail = StoreRow & {
  operators: Operator[];
  financial: {
    balance_allocated: Sum;
    driver_recharges: Sum;
    reversals: Sum;
    adjustments_credit: Sum;
    adjustments_debit: Sum;
    recharges_today: Sum;
    last_recharge_at: string | null;
    fees: string;
    commission: string;
  };
};

type LedgerEntry = {
  id: string;
  reference: string;
  type: "ADMIN_CREDIT" | "DRIVER_RECHARGE_DEBIT" | "REVERSAL_CREDIT" | "ADMIN_ADJUSTMENT";
  direction: "CREDIT" | "DEBIT";
  amount: string;
  currency: string;
  balance_before: string;
  balance_after: string;
  driver: { id: string; full_name: string | null; phone: string | null } | null;
  reversed_entry: { id: string; reference: string } | null;
  reversal: { id: string; reference: string; created_at: string } | null;
  status: "COMPLETED" | "REVERSED" | null;
  external_reference: string | null;
  note: string | null;
  performed_by: { id: string; full_name: string | null; role: string };
  created_at: string;
};

type Overview = {
  stores: { total: number; active: number; suspended: number; low_balance: number; zero_balance: number };
  total_store_balance: string;
  recharges_today: Sum;
  reversals_today: Sum;
  recharges_all_time: Sum;
  balance_allocated_all_time: Sum;
};

const isManager = (role?: string) => role === "ADMIN" || role === "SUPER_ADMIN";
const canCredit = (role?: string) => role === "FINANCE" || isManager(role);

function useInvalidate() {
  const client = useQueryClient();
  return useCallback(() => client.invalidateQueries({ queryKey: ["go"] }), [client]);
}

function branchText(branch: Branch | null | undefined) {
  return branch ? (bilingualName(branch) ?? branch.code) : "—";
}

function receiptStore(store: StoreRow): ReceiptStore {
  return {
    name: store.name,
    code: store.code,
    owner_name: store.owner_name,
    mobile_number: store.mobile_number,
    address: store.address,
    branch: branchText(store.branch),
  };
}

function errorText(error: unknown) {
  if (error instanceof GoApiError) {
    const extra = error.details;
    const parts = [error.message];
    if (typeof extra.available === "string") parts.push(`${t("المتاح")}: ${moneyText(extra.available)}`);
    if (typeof extra.minimum === "string") parts.push(`${t("الحد الأدنى")}: ${moneyText(extra.minimum)}`);
    if (typeof extra.limit === "string") parts.push(`${t("الحد الأعلى")}: ${moneyText(extra.limit)}`);
    return parts.join(" · ");
  }
  return t("تعذّر الاتصال بالخادم. لم يتأكد تنفيذ العملية — أعد المحاولة، ولن تُنفذ مرتين.");
}

function BalanceCell({ row }: { row: Pick<StoreRow, "balance" | "is_low_balance"> }) {
  const zero = toCents(row.balance) === BigInt(0);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-semibold tabular-nums text-heading">{moneyText(row.balance)}</span>
      {zero ? <StatusBadge value="CRITICAL" label={t("صفر")} /> : row.is_low_balance ? <StatusBadge value="WARNING" label={t("منخفض")} /> : null}
    </span>
  );
}

// ------------------------------------------------------------------ list

const SORTS = [
  { value: "created_at", label: "تاريخ الإنشاء" },
  { value: "name", label: "الاسم" },
  { value: "balance", label: "الرصيد" },
  { value: "code", label: "الرمز" },
];

export function StoresScreen() {
  const { session, branchId } = useDesk();
  const router = useRouter();
  const role = session?.user.role;
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [balance, setBalance] = useState("");
  const [sort, setSort] = useState("created_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(text.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(id);
  }, [text]);

  const query = { q: search, status, balance, sort, order, page, limit: 20, branch_id: branchId ?? undefined };
  const list = useQuery({
    queryKey: ["go", "/admin/stores", query],
    queryFn: () => go<Paged<StoreRow>>("/admin/stores", { query }),
    placeholderData: keepPreviousData,
  });
  const overview = useQuery({
    queryKey: ["go", "/admin/stores/overview", branchId],
    queryFn: () => go<Overview>("/admin/stores/overview", { query: { branch_id: branchId ?? undefined } }),
  });
  const o = overview.data;

  return (
    <div className="grid gap-4">
      <PageTitle
        title={t("المتاجر")}
        hint={t("نقاط بيع معتمدة تشحن محافظ السائقين من رصيدها المسبق. كل شحن يخصم المبلغ نفسه من رصيد المتجر ويضيفه لمحفظة السائق — بلا رسوم أو عمولة.")}
        action={
          isManager(role) ? (
            <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>
              <Icon node={Plus} size={16} />
              {t("متجر جديد")}
            </button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={t("المتاجر")} value={o ? o.stores.total : "…"}>
          {o ? `${o.stores.active} ${t("فعّال")} · ${o.stores.suspended} ${t("موقوف")}` : null}
        </Kpi>
        <Kpi label={t("إجمالي أرصدة المتاجر")} value={o ? moneyText(o.total_store_balance) : "…"} stripe="bg-teal">
          {o ? `${t("مخصّص منذ البداية")}: ${moneyText(o.balance_allocated_all_time.amount)}` : null}
        </Kpi>
        <Kpi label={t("شحن اليوم")} value={o ? moneyText(o.recharges_today.amount) : "…"} stripe="bg-success">
          {o ? `${o.recharges_today.count} ${t("عملية")}${o.reversals_today.count ? ` · ${o.reversals_today.count} ${t("معكوسة")}` : ""}` : null}
        </Kpi>
        <Kpi label={t("أرصدة منخفضة")} value={o ? o.stores.low_balance : "…"} stripe="bg-warning">
          {o ? `${o.stores.zero_balance} ${t("برصيد صفر")}` : null}
        </Kpi>
      </div>

      <Panel flush>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <label className="relative min-w-56 flex-1">
            <Icon node={Search} size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className={`${inputClass} ps-9`}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t("ابحث بالاسم أو الرمز أو المالك أو الجوال")}
              aria-label={t("بحث")}
            />
          </label>
          <div className={chipGroup}>
            {[
              { value: "", label: "الكل" },
              { value: "ACTIVE", label: "فعّال" },
              { value: "SUSPENDED", label: "موقوف" },
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
          <div className="w-40">
            <ChoiceSelect
              value={balance}
              onValueChange={(next) => {
                setBalance(next);
                setPage(1);
              }}
              emptyLabel={t("كل الأرصدة")}
              placeholder={t("كل الأرصدة")}
              options={[
                { value: "LOW", label: t("رصيد منخفض") },
                { value: "ZERO", label: t("رصيد صفر") },
                { value: "OK", label: t("رصيد كافٍ") },
              ]}
            />
          </div>
          <div className="w-40">
            <ChoiceSelect value={sort} onValueChange={(next) => setSort(next || "created_at")} options={SORTS.map((s) => ({ value: s.value, label: t(s.label) }))} />
          </div>
          <button
            type="button"
            className={btnGhostSm}
            aria-label={order === "asc" ? t("تصاعدي") : t("تنازلي")}
            onClick={() => setOrder((current) => (current === "asc" ? "desc" : "asc"))}
          >
            <Icon node={order === "asc" ? ArrowUpNarrowWide : ArrowDownWideNarrow} size={14} />
            {order === "asc" ? t("تصاعدي") : t("تنازلي")}
          </button>
        </div>
        <StateView bare loading={list.isLoading} error={list.error} empty={!list.isLoading && (list.data?.data.length ?? 0) === 0}>
          <TableShell
            minWidth="72rem"
            cols={["16%", "15%", "10%", "9%", "14%", "13%", "13%", "10%"]}
            head={
              <>
                <th className={thClass}>{t("المتجر")}</th>
                <th className={thClass}>{t("المالك")}</th>
                <th className={thClass}>{t("الفرع")}</th>
                <th className={thClass}>{t("الحالة")}</th>
                <th className={thClass}>{t("الرصيد")}</th>
                <th className={thClass}>{t("شحن اليوم")}</th>
                <th className={thClass}>{t("آخر شحن")}</th>
                <th className={thClass}>{t("حسابات الدخول")}</th>
              </>
            }
          >
            {(list.data?.data ?? []).map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-heading/[0.025]"
                onClick={() => router.push(`/admin/stores/${row.id}`)}
              >
                <td className={`${tdClass} min-w-0`}>
                  <Link href={`/admin/stores/${row.id}`} className="block truncate font-semibold text-heading hover:underline" onClick={(event) => event.stopPropagation()}>
                    {row.name}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-muted" dir="ltr">{row.code}</p>
                </td>
                <td className={`${tdClass} min-w-0`}>
                  <p className="truncate text-heading">{row.owner_name}</p>
                  <p className="phone-ltr mt-0.5 truncate text-xs text-muted" dir="ltr" data-phone="">{row.mobile_number}</p>
                </td>
                <td className={`${tdClass} truncate`}>{branchText(row.branch)}</td>
                <td className={tdClass}>
                  <StatusBadge value={row.status} label={enumLabel(row.status)} />
                </td>
                <td className={`${tdClass} whitespace-nowrap`}>
                  <BalanceCell row={row} />
                </td>
                <td className={`${tdClass} whitespace-nowrap tabular-nums`}>
                  {moneyText(row.recharges_today?.amount ?? "0")}
                  <span className="text-xs text-muted"> · {row.recharges_today?.count ?? 0}</span>
                </td>
                <td className={`${tdClass} whitespace-nowrap text-xs text-muted`}>{whenText(row.last_recharge_at)}</td>
                <td className={`${tdClass} tabular-nums`}>{row.operators_count ?? 0}</td>
              </tr>
            ))}
          </TableShell>
          {list.data ? <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} /> : null}
        </StateView>
      </Panel>

      {creating ? (
        <StoreFormDialog
          onClose={() => setCreating(false)}
          onSaved={(store) => {
            setCreating(false);
            router.push(`/admin/stores/${store.id}`);
          }}
        />
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ create / edit

function StoreFormDialog({ store, onClose, onSaved }: { store?: StoreRow; onClose: () => void; onSaved: (store: StoreRow) => void }) {
  const invalidate = useInvalidate();
  const branches = useGoList("/erp/branches", { limit: 100 }, false);
  const options = (branches.data ?? []).map((row) => ({ value: String(row.id), label: headline(row) }));
  const editing = !!store;
  const [branchId, setBranchId] = useState(store?.branch?.id ?? "");
  const [address, setAddress] = useState(store?.address ?? "");
  const branch = (branches.data ?? []).find((row) => String(row.id) === branchId);
  const branchCenter = branch
    ? branch.center_lat != null
      ? { lat: branch.center_lat, lng: branch.center_lng }
      : (branch.service_area_center as { lat?: unknown; lng?: unknown } | null | undefined)
    : null;

  async function submit(form: FormData) {
    const value = (key: string) => String(form.get(key) ?? "").trim();
    const optionalNumber = (key: string) => (value(key) === "" ? (editing ? null : undefined) : Number(value(key)));
    const threshold = value("low_balance_threshold");
    const maxRecharge = value("max_recharge_amount");
    const body: Record<string, unknown> = {
      name: value("name"),
      owner_name: value("owner_name"),
      mobile_number: value("mobile_number"),
      branch_id: value("branch_id"),
      address: value("address") || (editing ? "" : undefined),
      latitude: optionalNumber("latitude"),
      longitude: optionalNumber("longitude"),
    };
    if (threshold) {
      const normalized = normalizeAmount(threshold) ?? (/^0+(\.0+)?$/.test(threshold) ? "0" : null);
      if (normalized == null) throw new GoApiError(400, "VALIDATION_ERROR", undefined, undefined, { low_balance_threshold: t("أدخل مبلغاً صحيحاً.") });
      body.low_balance_threshold = normalized;
    }
    if (maxRecharge) {
      const normalized = normalizeAmount(maxRecharge);
      if (normalized == null) throw new GoApiError(400, "VALIDATION_ERROR", undefined, undefined, { max_recharge_amount: t("أدخل مبلغاً صحيحاً.") });
      body.max_recharge_amount = normalized;
    } else if (editing) {
      body.max_recharge_amount = "";
    }
    const saved = editing
      ? await go<StoreRow>(`/admin/stores/${store.id}`, { method: "PATCH", body })
      : await go<StoreRow>("/admin/stores", { method: "POST", body });
    await invalidate();
    onSaved(saved);
  }

  return (
    <Dialog title={editing ? t("تعديل بيانات المتجر") : t("متجر جديد")} onClose={onClose} wide="xl">
      <DeskForm action={submit} className="grid gap-4">
        <div className="grid gap-5 lg:grid-cols-2">
          <FormGrid>
            <FormSpan>
              <Field label={t("اسم المتجر")}>
                <input className={inputClass} name="name" defaultValue={store?.name} required maxLength={120} />
              </Field>
            </FormSpan>
            <Field label={t("اسم المالك")}>
              <input className={inputClass} name="owner_name" defaultValue={store?.owner_name} required maxLength={120} />
            </Field>
            <Field label={t("جوال المالك")}>
              <input className={inputClass} name="mobile_number" defaultValue={store?.mobile_number} required inputMode="tel" dir="ltr" placeholder="09xxxxxxxx" />
            </Field>
            <Field label={t("المحافظة / الفرع")}>
              <ChoiceSelect name="branch_id" value={branchId} onValueChange={setBranchId} options={options} required placeholder={t("اختر المحافظة")} />
            </Field>
            <Field label={t("عنوان المتجر")}>
              <input
                className={inputClass}
                name="address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                maxLength={300}
                placeholder={t("مثال: الأعظمية، شارع النيل")}
              />
            </Field>
            <Field label={`${t("حد التنبيه للرصيد المنخفض")} (${t("ل.س")})`}>
              <input className={inputClass} name="low_balance_threshold" defaultValue={store ? Number(store.low_balance_threshold) : "100000"} inputMode="decimal" dir="ltr" />
            </Field>
            <Field label={`${t("أقصى مبلغ للشحن الواحد")} (${t("ل.س")})`}>
              <input className={inputClass} name="max_recharge_amount" defaultValue={store?.max_recharge_amount ? Number(store.max_recharge_amount) : ""} inputMode="decimal" dir="ltr" placeholder={t("بلا حد")} />
            </Field>
          </FormGrid>
          <div className="grid content-start gap-1.5 text-sm">
            <span className={labelClass}>{t("الموقع على الخريطة (اختياري)")}</span>
            <LocationPickerField
              lat={store?.latitude}
              lng={store?.longitude}
              area={branch?.service_area}
              center={branchCenter}
              search={address}
              mapClassName="h-64 lg:h-80"
            />
          </div>
        </div>
        {!editing ? <Notice>{t("يبدأ المتجر برصيد صفر. أضف الرصيد بعد الإنشاء من صفحة المتجر حتى يُسجَّل في السجل المالي.")}</Notice> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>{t("إلغاء")}</button>
          <button type="submit" className={btnPrimary}>{editing ? t("حفظ") : t("إنشاء المتجر")}</button>
        </div>
      </DeskForm>
    </Dialog>
  );
}

// ------------------------------------------------------------------ detail

type Tab = "ledger" | "stats" | "operators" | "audit" | "info";

const TABS: { id: Tab; label: string }[] = [
  { id: "ledger", label: "السجل المالي" },
  { id: "stats", label: "الإحصاءات" },
  { id: "operators", label: "حسابات الدخول" },
  { id: "audit", label: "سجل التدقيق" },
  { id: "info", label: "البيانات" },
];

export function StoreDetailScreen({ storeId }: { storeId: string }) {
  const { session } = useDesk();
  const role = session?.user.role;
  const [tab, setTab] = useState<Tab>("ledger");
  const [dialog, setDialog] = useState<null | "credit" | "adjust" | "status" | "edit">(null);
  const detail = useQuery({
    queryKey: ["go", `/admin/stores/${storeId}`],
    queryFn: () => go<StoreDetail>(`/admin/stores/${storeId}`),
  });
  const store = detail.data;

  return (
    <div className="grid min-w-0 gap-4">
      <StateView loading={detail.isLoading} error={detail.error}>
        {store ? (
          <>
            <PageTitle
              title={store.name}
              hint={`${store.code} · ${branchText(store.branch)} · ${store.owner_name}`}
              action={
                <div className="flex flex-wrap items-center gap-2 sm:me-6">
                  <StatusBadge value={store.status} label={enumLabel(store.status)} />
                  {canCredit(role) ? (
                    <button type="button" className={btnPrimary} onClick={() => setDialog("credit")}>
                      <Icon node={Plus} size={16} />
                      {t("إضافة رصيد")}
                    </button>
                  ) : null}
                  {isManager(role) ? (
                    <>
                      <button type="button" className={btnGhost} onClick={() => setDialog("adjust")}>{t("تسوية")}</button>
                      <button type="button" className={btnGhost} onClick={() => setDialog("edit")}>{t("تعديل")}</button>
                      <button type="button" className={btnGhost} onClick={() => setDialog("status")}>
                        {store.status === "ACTIVE" ? t("إيقاف") : t("تفعيل")}
                      </button>
                    </>
                  ) : null}
                </div>
              }
            />
            {store.status === "SUSPENDED" ? (
              <Notice>
                {t("المتجر موقوف: لا يستطيع شحن أي محفظة حتى يُعاد تفعيله.")}
                {store.status_reason ? ` ${t("السبب")}: ${store.status_reason}` : null}
              </Notice>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi label={t("الرصيد الحالي")} value={moneyText(store.balance)} stripe={store.is_low_balance ? "bg-warning" : "bg-teal"}>
                {`${t("حد التنبيه")}: ${moneyText(store.low_balance_threshold)}`}
              </Kpi>
              <Kpi label={t("إجمالي الرصيد المخصّص")} value={moneyText(store.financial.balance_allocated.amount)}>
                {`${store.financial.balance_allocated.count} ${t("عملية إضافة")}`}
              </Kpi>
              <Kpi label={t("إجمالي شحن السائقين")} value={moneyText(store.financial.driver_recharges.amount)} stripe="bg-success">
                {`${store.financial.driver_recharges.count} ${t("عملية")} · ${t("معكوس")}: ${moneyText(store.financial.reversals.amount)}`}
              </Kpi>
              <Kpi label={t("شحن اليوم")} value={moneyText(store.financial.recharges_today.amount)}>
                {`${store.financial.recharges_today.count} ${t("عملية")} · ${t("آخر شحن")}: ${whenText(store.financial.last_recharge_at)}`}
              </Kpi>
            </div>
            <p className="text-xs text-muted">
              {t("الرسوم")}: {moneyText(store.financial.fees)} · {t("العمولة")}: {moneyText(store.financial.commission)} ·{" "}
              {t("الحد الأعلى للشحن الواحد")}: {store.max_recharge_amount ? moneyText(store.max_recharge_amount) : t("بلا حد")}
            </p>
            <div className={chipGroup}>
              {TABS.map((item) => (
                <button key={item.id} type="button" className={tab === item.id ? chipActive : chipClass} onClick={() => setTab(item.id)}>
                  {t(item.label)}
                </button>
              ))}
            </div>
            {tab === "ledger" ? <LedgerPanel store={store} canReverse={isManager(role)} /> : null}
            {tab === "stats" ? <StatsPanel storeId={storeId} /> : null}
            {tab === "operators" ? <OperatorsPanel store={store} canManage={isManager(role)} /> : null}
            {tab === "audit" ? <AuditPanel storeId={storeId} /> : null}
            {tab === "info" ? <InfoPanel store={store} /> : null}

            {dialog === "credit" ? <MoneyDialog store={store} mode="credit" onClose={() => setDialog(null)} /> : null}
            {dialog === "adjust" ? <MoneyDialog store={store} mode="adjust" onClose={() => setDialog(null)} /> : null}
            {dialog === "status" ? <StatusDialog store={store} onClose={() => setDialog(null)} /> : null}
            {dialog === "edit" ? <StoreFormDialog store={store} onClose={() => setDialog(null)} onSaved={() => setDialog(null)} /> : null}
          </>
        ) : null}
      </StateView>
    </div>
  );
}

function InfoPanel({ store }: { store: StoreDetail }) {
  const rows: [string, string][] = [
    [t("الرمز"), store.code],
    [t("اسم المتجر"), store.name],
    [t("اسم المالك"), store.owner_name],
    [t("جوال المالك"), store.mobile_number],
    [t("الفرع"), branchText(store.branch)],
    [t("العنوان"), store.address || "—"],
    [t("الموقع"), store.latitude != null && store.longitude != null ? `${store.latitude}, ${store.longitude}` : "—"],
    [t("العملة"), store.currency === "SYP" ? t("ل.س") : store.currency],
    [t("تاريخ الإنشاء"), whenText(store.created_at)],
    [t("آخر تغيير للحالة"), whenText(store.status_changed_at)],
  ];
  return (
    <Panel>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([label, value]) => {
          const phone = label === t("جوال المالك") || /^\+?\d[\d\s().-]{6,18}$/.test(value.trim());
          return (
            <div key={label} className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
              <dt className="text-xs font-medium text-muted">{label}</dt>
              <dd className="mt-1 break-words text-sm font-semibold text-heading" dir={phone ? "ltr" : undefined}>
                <bdi className={phone ? "phone-ltr tabular-nums" : undefined} dir={phone ? "ltr" : undefined} data-phone={phone ? "" : undefined}>
                  {value}
                </bdi>
              </dd>
            </div>
          );
        })}
      </dl>
    </Panel>
  );
}

// ------------------------------------------------------------------ balance credit / adjustment

function MoneyDialog({ store, mode, onClose }: { store: StoreDetail; mode: "credit" | "adjust"; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [draft, setDraft] = useState<null | { amount: string; direction: "CREDIT" | "DEBIT"; note?: string; key: string }>(null);
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState<string | null>(null);
  const [done, setDone] = useState<null | { entry: LedgerEntry; balance: string }>(null);
  const current = toCents(store.balance) ?? BigInt(0);
  const title = mode === "credit" ? t("إضافة رصيد للمتجر") : t("تسوية رصيد المتجر");

  function prepare(form: FormData) {
    const amount = normalizeAmount(form.get("amount"));
    if (!amount) throw new GoApiError(400, "VALIDATION_ERROR", undefined, undefined, { amount: t("أدخل مبلغاً موجباً بالأرقام، مثل 250000") });
    const direction = mode === "credit" ? "CREDIT" : (String(form.get("direction")) as "CREDIT" | "DEBIT");
    const note = String(form.get("note") ?? "").trim();
    if (mode === "adjust" && note.length < 5) throw new GoApiError(400, "VALIDATION_ERROR", undefined, undefined, { note: t("اكتب سبب التسوية (5 أحرف على الأقل).") });
    if (direction === "DEBIT" && (toCents(amount) ?? BigInt(0)) > current) {
      throw new GoApiError(400, "VALIDATION_ERROR", undefined, undefined, { amount: t("المبلغ أكبر من رصيد المتجر الحالي.") });
    }
    setFault(null);
    setDraft({ amount, direction, note: note || undefined, key: crypto.randomUUID() });
  }

  async function commit() {
    if (!draft || busy) return;
    setBusy(true);
    setFault(null);
    try {
      const result =
        mode === "credit"
          ? await go<{ entry: LedgerEntry; balance: string }>(`/admin/stores/${store.id}/balance-credits`, {
              method: "POST",
              idempotencyKey: draft.key,
              body: { amount: draft.amount, currency: store.currency, note: draft.note },
            })
          : await go<{ entry: LedgerEntry; balance: string }>(`/admin/stores/${store.id}/balance-adjustments`, {
              method: "POST",
              idempotencyKey: draft.key,
              body: { amount: draft.amount, direction: draft.direction, currency: store.currency, reason: draft.note },
            });
      setDone(result);
      await invalidate();
    } catch (error) {
      setFault(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  const delta = draft ? (toCents(draft.amount) ?? BigInt(0)) * (draft.direction === "CREDIT" ? BigInt(1) : BigInt(-1)) : BigInt(0);

  return (
    <Dialog title={title} onClose={onClose} locked={busy}>
      {done ? (
        <div className="grid gap-4">
          <StoreReceiptPrint store={receiptStore(store)} entry={done.entry} kind={mode} />
          <div className="rounded-xl border border-line p-4">
            <div className="mb-3 grid justify-items-center gap-1 text-center">
              <Icon node={CircleCheck} size={24} className="text-success-ink" />
              <p className="text-sm font-semibold text-heading">{mode === "credit" ? t("إيصال استلام رصيد") : t("تسوية رصيد متجر")}</p>
              <p className="text-xs text-muted">{store.name} · {store.code}</p>
            </div>
            <div className="mb-2 grid justify-items-center gap-0.5 rounded-lg bg-brand/8 py-2 text-center">
              <span className="text-[11px] text-muted">{mode === "credit" ? t("رقم الإيصال") : t("المرجع")}</span>
              <bdi className="text-lg font-semibold tracking-wider text-heading">{done.entry.reference}</bdi>
            </div>
            <div className="divide-y divide-dashed divide-line border-y border-dashed border-line">
              <PreviewRow label={t("التاريخ")} value={whenText(done.entry.created_at)} />
              <PreviewRow label={done.entry.direction === "CREDIT" ? t("المبلغ المضاف") : t("المبلغ المخصوم")} value={moneyText(done.entry.amount)} strong />
              <PreviewRow label={t("الرصيد قبل العملية")} value={moneyText(done.entry.balance_before)} />
              <PreviewRow label={t("الرصيد بعد العملية")} value={moneyText(done.entry.balance_after)} strong />
              <PreviewRow label={mode === "credit" ? t("استلمها") : t("نفّذها")} value={done.entry.performed_by.full_name ?? "—"} />
              {done.entry.note ? <PreviewRow label={mode === "adjust" ? t("السبب") : t("ملاحظة")} value={done.entry.note} /> : null}
            </div>
            {mode === "credit" ? <p className="mt-3 text-center text-[11px] text-muted">{t("سلّم نسخة لصاحب المتجر. رقم الإيصال يثبت استلام المبلغ.")}</p> : null}
          </div>
          <div className="flex justify-end gap-2 print:hidden">
            <button type="button" className={btnGhost} onClick={() => window.print()}>
              <Icon node={Printer} size={16} />
              {t("طباعة")}
            </button>
            <button type="button" className={btnPrimary} onClick={onClose}>{t("تم")}</button>
          </div>
        </div>
      ) : draft ? (
        <div className="grid gap-4">
          <div className="divide-y divide-line rounded-xl border border-line px-4">
            <PreviewRow label={t("المتجر")} value={`${store.name} · ${store.code}`} />
            <PreviewRow label={t("الرصيد الحالي")} value={moneyText(store.balance)} />
            <PreviewRow label={draft.direction === "CREDIT" ? t("المبلغ المضاف") : t("المبلغ المخصوم")} value={moneyText(draft.amount)} strong />
            <PreviewRow label={t("الرصيد بعد العملية")} value={moneyText(fromCents(current + delta))} strong />
            {draft.note ? <PreviewRow label={mode === "adjust" ? t("السبب") : t("ملاحظة")} value={draft.note} /> : null}
          </div>
          <p className="text-xs text-muted">
            {mode === "credit" ? `${t("يولّد النظام رقم إيصال تلقائياً عند التأكيد.")} ` : null}
            {t("تُسجَّل العملية في السجل المالي وسجل التدقيق ولا يمكن حذفها.")}
          </p>
          {fault ? <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger-ink">{fault}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} disabled={busy} onClick={() => setDraft(null)}>{t("رجوع")}</button>
            <button type="button" className={btnPrimary} disabled={busy} onClick={() => void commit()}>
              {busy ? t("جارٍ التنفيذ…") : fault ? t("إعادة المحاولة") : t("تأكيد")}
            </button>
          </div>
        </div>
      ) : (
        <DeskForm action={prepare} className="grid gap-4">
          {mode === "adjust" ? (
            <Field label={t("نوع التسوية")}>
              <ChoiceSelect
                name="direction"
                defaultValue="CREDIT"
                options={[
                  { value: "CREDIT", label: t("إضافة للرصيد") },
                  { value: "DEBIT", label: t("خصم من الرصيد") },
                ]}
              />
            </Field>
          ) : null}
          <Field label={`${t("المبلغ")} (${t("ل.س")})`}>
            <input className={inputClass} name="amount" inputMode="decimal" dir="ltr" required autoFocus placeholder="250000" />
          </Field>
          <Field label={mode === "adjust" ? t("سبب التسوية") : t("ملاحظة")}>
            <textarea className={`${inputClass} min-h-20 py-2`} name="note" maxLength={500} required={mode === "adjust"} />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={onClose}>{t("إلغاء")}</button>
            <button type="submit" className={btnPrimary}>{t("معاينة")}</button>
          </div>
        </DeskForm>
      )}
    </Dialog>
  );
}

function StatusDialog({ store, onClose }: { store: StoreDetail; onClose: () => void }) {
  const invalidate = useInvalidate();
  const next = store.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  async function submit(form: FormData) {
    await go(`/admin/stores/${store.id}/status`, { method: "PATCH", body: { status: next, reason: String(form.get("reason") ?? "").trim() || undefined } });
    await invalidate();
    onClose();
  }
  return (
    <Dialog title={next === "SUSPENDED" ? t("إيقاف المتجر") : t("تفعيل المتجر")} onClose={onClose}>
      <DeskForm action={submit} className="grid gap-4">
        <p className="text-sm leading-7 text-body">
          {next === "SUSPENDED"
            ? t("لن يستطيع مشغّلو المتجر شحن أي محفظة. الرصيد والسجل يبقيان كما هما.")
            : t("سيعود المتجر لشحن المحافظ من رصيده الحالي.")}
        </p>
        <Field label={t("السبب (اختياري)")}>
          <textarea className={`${inputClass} min-h-20 py-2`} name="reason" maxLength={300} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>{t("إلغاء")}</button>
          <button type="submit" className={btnPrimary}>{next === "SUSPENDED" ? t("إيقاف") : t("تفعيل")}</button>
        </div>
      </DeskForm>
    </Dialog>
  );
}

// ------------------------------------------------------------------ ledger

const LEDGER_TYPES = ["ADMIN_CREDIT", "DRIVER_RECHARGE_DEBIT", "REVERSAL_CREDIT", "ADMIN_ADJUSTMENT"];

function LedgerPanel({ store, canReverse }: { store: StoreDetail; canReverse: boolean }) {
  const storeId = store.id;
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [reversing, setReversing] = useState<LedgerEntry | null>(null);
  const [printing, setPrinting] = useState<LedgerEntry | null>(null);

  useEffect(() => {
    if (!printing) return;
    const finish = () => setPrinting(null);
    window.addEventListener("afterprint", finish);
    const frame = window.requestAnimationFrame(() => window.print());
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", finish);
    };
  }, [printing]);
  const query = { type, page, limit: 20 };
  const ledger = useQuery({
    queryKey: ["go", `/admin/stores/${storeId}/ledger`, query],
    queryFn: () => go<Paged<LedgerEntry>>(`/admin/stores/${storeId}/ledger`, { query }),
    placeholderData: keepPreviousData,
  });
  return (
    <Panel flush className="min-w-0 max-w-full overflow-hidden">
      <PanelHeader
        title={t("السجل المالي")}
        hint={t("كل تغيير على رصيد المتجر، مع الرصيد قبل وبعد. السجل لا يُعدَّل ولا يُحذف.")}
        action={
          <div className="w-48">
            <ChoiceSelect
              value={type}
              onValueChange={(next) => {
                setType(next);
                setPage(1);
              }}
              emptyLabel={t("كل الأنواع")}
              placeholder={t("كل الأنواع")}
              options={LEDGER_TYPES.map((value) => ({ value, label: enumLabel(value) }))}
            />
          </div>
        }
      />
      <StateView bare loading={ledger.isLoading} error={ledger.error} empty={!ledger.isLoading && (ledger.data?.data.length ?? 0) === 0}>
        <TableShell
          minWidth="84rem"
          head={
            <>
              <th className={thClass}>{t("التاريخ")}</th>
              <th className={thClass}>{t("المرجع")}</th>
              <th className={thClass}>{t("النوع")}</th>
              <th className={thClass}>{t("المبلغ")}</th>
              <th className={thClass}>{t("قبل")}</th>
              <th className={thClass}>{t("بعد")}</th>
              <th className={thClass}>{t("السائق")}</th>
              <th className={thClass}>{t("المنفّذ")}</th>
              <th className={thClass}>{t("ملاحظة")}</th>
              <th className={thClass} />
            </>
          }
        >
          {(ledger.data?.data ?? []).map((row) => (
            <tr key={row.id} className="border-b border-line last:border-0">
              <td className={`${tdClass} whitespace-nowrap text-xs text-muted`}>{whenText(row.created_at)}</td>
              <td className={`${tdClass} whitespace-nowrap font-medium`}>
                <bdi>{row.reference}</bdi>
                {row.reversed_entry ? <p className="text-xs text-muted">{t("يعكس")} <bdi>{row.reversed_entry.reference}</bdi></p> : null}
              </td>
              <td className={tdClass}>
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {enumLabel(row.type)}
                  {row.status === "REVERSED" ? <StatusBadge value="REVERSED" label={enumLabel("REVERSED")} /> : null}
                </span>
              </td>
              <td className={`${tdClass} whitespace-nowrap font-semibold tabular-nums ${row.direction === "CREDIT" ? "text-success-ink" : "text-danger-ink"}`}>
                <bdi>{row.direction === "CREDIT" ? "+" : "−"}{moneyText(row.amount)}</bdi>
              </td>
              <td className={`${tdClass} whitespace-nowrap tabular-nums text-muted`}>{moneyText(row.balance_before)}</td>
              <td className={`${tdClass} whitespace-nowrap tabular-nums`}>{moneyText(row.balance_after)}</td>
              <td className={tdClass}>
                {row.driver ? (
                  <>
                    <p>{row.driver.full_name ?? "—"}</p>
                    <p className="phone-ltr text-xs text-muted" dir="ltr" data-phone="">{row.driver.phone}</p>
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className={tdClass}>
                <p>{row.performed_by.full_name ?? "—"}</p>
                <p className="text-xs text-muted">{enumLabel(row.performed_by.role)}</p>
              </td>
              <td className={`${tdClass} max-w-56 text-xs text-muted`}>
                {[row.external_reference, row.note].filter(Boolean).join(" · ") || "—"}
              </td>
              <td className={`${tdClass} text-end`}>
                {canReverse && row.type === "DRIVER_RECHARGE_DEBIT" && !row.reversal ? (
                  <button type="button" className={btnGhostSm} onClick={() => setReversing(row)}>{t("عكس")}</button>
                ) : null}
                {row.type === "ADMIN_CREDIT" || row.type === "ADMIN_ADJUSTMENT" ? (
                  <button type="button" className={btnGhostSm} onClick={() => setPrinting(row)} title={t("طباعة الإيصال")}>
                    <Icon node={Printer} size={14} />
                    {t("إيصال")}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </TableShell>
        {ledger.data ? <Pager page={ledger.data.page} limit={ledger.data.limit} total={ledger.data.total} onPage={setPage} /> : null}
      </StateView>
      {reversing ? <ReverseDialog entry={reversing} onClose={() => setReversing(null)} /> : null}
      {printing ? (
        <StoreReceiptPrint store={receiptStore(store)} entry={printing} kind={printing.type === "ADMIN_CREDIT" ? "credit" : "adjust"} />
      ) : null}
    </Panel>
  );
}

function ReverseDialog({ entry, onClose }: { entry: LedgerEntry; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [key] = useState(() => crypto.randomUUID());
  async function submit(form: FormData) {
    try {
      await go(`/admin/stores/ledger/${entry.id}/reverse`, {
        method: "POST",
        idempotencyKey: key,
        body: { reason: String(form.get("reason") ?? "").trim() },
      });
    } catch (error) {
      if (error instanceof GoApiError) throw error;
      return goFailure(errorText(error));
    }
    await invalidate();
    onClose();
  }
  return (
    <Dialog title={t("عكس عملية شحن")} onClose={onClose}>
      <DeskForm action={submit} className="grid gap-4">
        <div className="divide-y divide-line rounded-xl border border-line px-4">
          <PreviewRow label={t("المرجع")} value={<bdi>{entry.reference}</bdi>} />
          <PreviewRow label={t("السائق")} value={entry.driver?.full_name ?? "—"} />
          <PreviewRow label={t("المبلغ")} value={moneyText(entry.amount)} strong />
        </div>
        <p className="text-sm leading-7 text-body">
          {t("يُسحب المبلغ من محفظة السائق ويعود كاملاً لرصيد المتجر في عملية واحدة. يُرفض العكس إذا صرف السائق المبلغ أو كان محجوزاً لرحلة.")}
        </p>
        <Field label={t("سبب العكس")}>
          <textarea className={`${inputClass} min-h-20 py-2`} name="reason" required minLength={5} maxLength={500} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>{t("إلغاء")}</button>
          <button type="submit" className={btnPrimary}>{t("تأكيد العكس")}</button>
        </div>
      </DeskForm>
    </Dialog>
  );
}

// ------------------------------------------------------------------ statistics

type Stats = {
  days: number;
  totals: { recharges: number; recharge_amount: string; average_recharge: string; distinct_drivers: number };
  series: { day: string; recharges: number; recharge_amount: string; credits: string; reversals: string }[];
};

function StatsPanel({ storeId }: { storeId: string }) {
  const [days, setDays] = useState(30);
  const stats = useQuery({
    queryKey: ["go", `/admin/stores/${storeId}/statistics`, days],
    queryFn: () => go<Stats>(`/admin/stores/${storeId}/statistics`, { query: { days } }),
  });
  const series = stats.data?.series ?? [];
  const peak = series.reduce((max, d) => Math.max(max, Number(d.recharge_amount)), 0);
  return (
    <Panel flush>
      <PanelHeader
        title={t("الإحصاءات")}
        action={
          <div className={chipGroup}>
            {[7, 30, 90].map((value) => (
              <button key={value} type="button" className={days === value ? chipActive : chipClass} onClick={() => setDays(value)}>
                {value} {t("يوم")}
              </button>
            ))}
          </div>
        }
      />
      <StateView bare loading={stats.isLoading} error={stats.error}>
        {stats.data ? (
          <div className="grid gap-4 p-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi label={t("عمليات الشحن")} value={stats.data.totals.recharges} />
              <Kpi label={t("قيمة الشحن")} value={moneyText(stats.data.totals.recharge_amount)} stripe="bg-success" />
              <Kpi label={t("متوسط الشحن")} value={moneyText(stats.data.totals.average_recharge)} stripe="bg-teal" />
              <Kpi label={t("سائقون مختلفون")} value={stats.data.totals.distinct_drivers} stripe="bg-warning" />
            </div>
            {series.length === 0 ? (
              <EmptyState bare title={t("لا عمليات في هذه الفترة")} />
            ) : (
              <ul className="grid gap-1.5">
                {series.map((d) => (
                  <li key={d.day} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 text-xs">
                    <span className="tabular-nums text-muted" dir="ltr">{d.day}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-heading/[0.05]">
                      <span className="block h-full rounded-full bg-teal" style={{ width: `${peak ? Math.max(2, (Number(d.recharge_amount) / peak) * 100) : 0}%` }} />
                    </span>
                    <span className="whitespace-nowrap tabular-nums text-heading">
                      {moneyText(d.recharge_amount)} <span className="text-muted">· {d.recharges}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </StateView>
    </Panel>
  );
}

// ------------------------------------------------------------------ operators

function OperatorsPanel({ store, canManage }: { store: StoreDetail; canManage: boolean }) {
  const invalidate = useInvalidate();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<Operator | null>(null);

  async function resetPassword(form: FormData) {
    if (!resetting) return;
    await go(`/admin/stores/${store.id}/operators/${resetting.id}`, { method: "PATCH", body: { password: String(form.get("password") ?? "") } });
    await invalidate();
    setResetting(null);
  }

  return (
    <Panel flush>
      <PanelHeader
        title={t("حسابات الدخول")}
        hint={t("حسابات المتجر التي تسجّل الدخول من لوحة التحكم وتشحن من رصيد هذا المتجر فقط.")}
        action={canManage ? <button type="button" className={btnPrimarySm} onClick={() => setAdding(true)}><Icon node={Plus} size={14} />{t("إنشاء حساب للمتجر")}</button> : null}
      />
      {store.operators.length === 0 ? (
        <EmptyState bare title={t("لا يوجد حساب دخول لهذا المتجر")} hint={t("أنشئ حساباً بالبريد وكلمة المرور ليتمكن المتجر من الدخول والشحن.")} />
      ) : (
        <TableShell
          minWidth="40rem"
          head={
            <>
              <th className={thClass}>{t("الاسم")}</th>
              <th className={thClass}>{t("البريد")}</th>
              <th className={thClass}>{t("الحالة")}</th>
              <th className={thClass}>{t("آخر دخول")}</th>
              <th className={thClass} />
            </>
          }
        >
          {store.operators.map((op) => (
            <tr key={op.id} className="border-b border-line last:border-0">
              <td className={`${tdClass} font-medium text-heading`}>{op.full_name ?? "—"}</td>
              <td className={tdClass} dir="ltr">{op.email ?? "—"}</td>
              <td className={tdClass}>
                <StatusBadge value={op.is_active ? "ACTIVE" : "SUSPENDED"} label={op.is_active ? t("فعّال") : t("موقوف")} />
              </td>
              <td className={`${tdClass} text-xs text-muted`}>{whenText(op.last_login_at)}</td>
              <td className={`${tdClass} text-end`}>
                {canManage ? (
                  <span className="inline-flex gap-2">
                    <button type="button" className={btnGhostSm} onClick={() => setResetting(op)}>{t("كلمة مرور")}</button>
                    <button
                      type="button"
                      className={btnGhostSm}
                      onClick={() =>
                        void confirm({
                          title: op.is_active ? t("إيقاف المشغّل") : t("تفعيل المشغّل"),
                          body: op.is_active ? t("سيُسجَّل خروجه من كل الأجهزة ولن يستطيع الدخول.") : t("سيتمكن من الدخول والشحن من جديد."),
                          danger: op.is_active,
                          confirm: op.is_active ? t("إيقاف") : t("تفعيل"),
                          perform: async () => {
                            await go(`/admin/stores/${store.id}/operators/${op.id}`, { method: "PATCH", body: { is_active: !op.is_active } });
                            await invalidate();
                          },
                        })
                      }
                    >
                      {op.is_active ? t("إيقاف") : t("تفعيل")}
                    </button>
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </TableShell>
      )}
      {adding ? <StoreAccountDialog store={store} onClose={() => setAdding(false)} /> : null}
      {resetting ? (
        <Dialog title={t("تعيين كلمة مرور جديدة")} onClose={() => setResetting(null)}>
          <DeskForm action={resetPassword} className="grid gap-4">
            <p className="text-sm text-body">{resetting.full_name ?? resetting.email}</p>
            <Field label={t("كلمة المرور الجديدة")}>
              <input className={inputClass} name="password" type="password" required minLength={8} autoComplete="new-password" />
              <span className="text-xs text-muted">{t("ثمانية أحرف على الأقل، وفيها حرف ورقم. ستُغلق جلساته الحالية.")}</span>
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" className={btnGhost} onClick={() => setResetting(null)}>{t("إلغاء")}</button>
              <button type="submit" className={btnPrimary}>{t("حفظ")}</button>
            </div>
          </DeskForm>
        </Dialog>
      ) : null}
    </Panel>
  );
}

function StoreAccountDialog({ store, onClose }: { store: StoreDetail; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [email, setEmail] = useState(() => suggestStoreEmail(store.name, store.code, store.operators.length));
  const [password, setPassword] = useState(() => generatePassword());
  const [visible, setVisible] = useState(true);
  const [created, setCreated] = useState<null | { email: string; password: string }>(null);
  const [copied, setCopied] = useState(false);

  async function submit(form: FormData) {
    const login = email.trim().toLowerCase();
    try {
      await go(`/admin/stores/${store.id}/operators`, {
        method: "POST",
        body: {
          full_name: String(form.get("full_name") ?? "").trim(),
          email: login,
          password,
        },
      });
    } catch (error) {
      if (error instanceof GoApiError && error.code === "CONFLICT") {
        throw new GoApiError(409, "CONFLICT", undefined, undefined, { email: t("هذا البريد مستخدم لحساب آخر. عدّله أو أضف رقماً.") });
      }
      throw error;
    }
    await invalidate();
    setCreated({ email: login, password });
  }

  async function copyCredentials() {
    if (!created) return;
    const text = `${t("رابط الدخول")}: ${window.location.origin}/login\n${t("البريد")}: ${created.email}\n${t("كلمة المرور")}: ${created.password}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }

  if (created) {
    return (
      <Dialog title={t("تم إنشاء حساب المتجر")} onClose={onClose}>
        <div className="grid gap-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-success-ink">
            <Icon node={CircleCheck} size={18} />
            {t("سلّم بيانات الدخول لصاحب المتجر.")}
          </p>
          <div className="divide-y divide-line rounded-xl border border-line px-4">
            <PreviewRow label={t("رابط الدخول")} value={<bdi>{`${window.location.origin}/login`}</bdi>} />
            <PreviewRow label={t("البريد")} value={<bdi className="font-semibold">{created.email}</bdi>} />
            <PreviewRow label={t("كلمة المرور")} value={<bdi className="font-mono font-semibold tracking-wider">{created.password}</bdi>} />
          </div>
          <Notice>{t("كلمة المرور لا تُحفظ بشكل مقروء ولن تظهر مرة أخرى. انسخها الآن، ويمكن تعيين كلمة جديدة لاحقاً عند الحاجة.")}</Notice>
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => void copyCredentials()}>
              <Icon node={copied ? CircleCheck : Copy} size={16} />
              {copied ? t("تم النسخ") : t("نسخ البيانات")}
            </button>
            <button type="button" className={btnPrimary} onClick={onClose}>{t("تم")}</button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={t("إنشاء حساب للمتجر")} onClose={onClose}>
      <DeskForm action={submit} className="grid gap-4">
        <Field label={t("اسم الحساب")}>
          <input className={inputClass} name="full_name" defaultValue={store.name} required minLength={2} maxLength={120} />
        </Field>
        <Field label={t("البريد (للدخول)")}>
          <input
            className={inputClass}
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={160}
            dir="ltr"
            autoComplete="off"
          />
          <span className="text-xs text-muted">{t("مقترح من اسم المتجر، ويمكنك تعديله.")}</span>
        </Field>
        <Field label={t("كلمة المرور")}>
          <div className="flex gap-2">
            <input
              className={`${inputClass} font-mono`}
              name="password"
              type={visible ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              maxLength={128}
              pattern="(?=.*[A-Za-z])(?=.*\d).{8,}"
              dir="ltr"
              autoComplete="new-password"
            />
            <button type="button" className={btnGhostSm} onClick={() => setVisible((value) => !value)} aria-label={visible ? t("إخفاء") : t("إظهار")}>
              <Icon node={visible ? EyeOff : Eye} size={16} />
            </button>
            <button type="button" className={btnGhostSm} onClick={() => setPassword(generatePassword())} title={t("توليد كلمة مرور قوية")}>
              <Icon node={RefreshCw} size={16} />
            </button>
          </div>
          <span className="text-xs text-muted">{t("ثمانية أحرف على الأقل، وفيها حرف ورقم. مولّدة تلقائياً ويمكنك تغييرها.")}</span>
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>{t("إلغاء")}</button>
          <button type="submit" className={btnPrimary}>{t("إنشاء الحساب")}</button>
        </div>
      </DeskForm>
    </Dialog>
  );
}

// ------------------------------------------------------------------ audit

const AUDIT_LABELS: Record<string, string> = {
  "store.created": "إنشاء المتجر",
  "store.updated": "تعديل البيانات",
  "store.status_changed": "تغيير الحالة",
  "store.balance_credited": "إضافة رصيد",
  "store.balance_adjusted": "تسوية رصيد",
  "store.operator_created": "إضافة مشغّل",
  "store.operator_updated": "تعديل مشغّل",
  "store.driver_recharged": "شحن محفظة سائق",
  "store.recharge_reversed": "عكس شحن",
};

type AuditRow = { id: string; action: string; actor: { full_name: string | null; role: string | null } | null; metadata: Record<string, unknown> | null; created_at: string };

function auditSummary(row: AuditRow) {
  const m = row.metadata ?? {};
  const bits: string[] = [];
  if (typeof m.reference === "string") bits.push(m.reference);
  if (typeof m.amount === "string") bits.push(moneyText(m.amount));
  if (typeof m.from === "string" && typeof m.to === "string") bits.push(`${enumLabel(m.from)} ← ${enumLabel(m.to)}`);
  if (typeof m.reason === "string") bits.push(m.reason);
  if (m.changes && typeof m.changes === "object") bits.push(Object.keys(m.changes as object).join(", "));
  if (typeof m.full_name === "string") bits.push(m.full_name);
  return bits.join(" · ") || "—";
}

function AuditPanel({ storeId }: { storeId: string }) {
  const [page, setPage] = useState(1);
  const audit = useQuery({
    queryKey: ["go", `/admin/stores/${storeId}/audit`, page],
    queryFn: () => go<Paged<AuditRow>>(`/admin/stores/${storeId}/audit`, { query: { page, limit: 20 } }),
    placeholderData: keepPreviousData,
  });
  return (
    <Panel flush>
      <PanelHeader title={t("سجل التدقيق")} />
      <StateView bare loading={audit.isLoading} error={audit.error} empty={!audit.isLoading && (audit.data?.data.length ?? 0) === 0}>
        <TableShell
          minWidth="44rem"
          head={
            <>
              <th className={thClass}>{t("التاريخ")}</th>
              <th className={thClass}>{t("الإجراء")}</th>
              <th className={thClass}>{t("بواسطة")}</th>
              <th className={thClass}>{t("التفاصيل")}</th>
            </>
          }
        >
          {(audit.data?.data ?? []).map((row) => (
            <tr key={row.id} className="border-b border-line last:border-0">
              <td className={`${tdClass} whitespace-nowrap text-xs text-muted`}>{whenText(row.created_at)}</td>
              <td className={`${tdClass} font-medium text-heading`}>{t(AUDIT_LABELS[row.action] ?? row.action)}</td>
              <td className={tdClass}>
                {row.actor?.full_name ?? "—"}
                {row.actor?.role ? <span className="text-xs text-muted"> · {enumLabel(row.actor.role)}</span> : null}
              </td>
              <td className={`${tdClass} text-xs text-body`}>
                <bdi>{auditSummary(row)}</bdi>
              </td>
            </tr>
          ))}
        </TableShell>
        {audit.data ? <Pager page={audit.data.page} limit={audit.data.limit} total={audit.data.total} onPage={setPage} /> : null}
      </StateView>
    </Panel>
  );
}

// ------------------------------------------------------------------ reconciliation

type Reconciliation = {
  generated_at: string;
  stores_checked: number;
  ok: boolean;
  checks: { key: string; ok: boolean; count: number; samples: unknown[] }[];
};

const CHECK_LABELS: Record<string, { title: string; hint: string }> = {
  RECHARGE_WITHOUT_WALLET_CREDIT: { title: "شحن بلا إيداع في المحفظة", hint: "خصم من المتجر لا تقابله حركة في محفظة السائق." },
  WALLET_CREDIT_WITHOUT_STORE_DEBIT: { title: "إيداع محفظة بلا خصم متجر", hint: "حركة «شحن من متجر» في المحفظة لا يقابلها خصم في سجل المتجر." },
  AMOUNT_OR_DRIVER_MISMATCH: { title: "اختلاف المبلغ أو السائق أو العملة", hint: "خصم المتجر وإيداع المحفظة يجب أن يتطابقا تماماً." },
  REVERSAL_MISMATCH: { title: "عكس غير مطابق", hint: "مبلغ العكس يجب أن يساوي مبلغ الشحن الأصلي ولنفس المتجر." },
  NEGATIVE_STORE_BALANCE: { title: "رصيد متجر سالب", hint: "يجب ألا يكون أي رصيد متجر أقل من صفر." },
  STORE_BALANCE_VS_LEDGER: { title: "الرصيد لا يطابق السجل", hint: "رصيد المتجر يجب أن يساوي مجموع الإضافات ناقص الخصومات." },
  LEDGER_CHAIN_BREAK: { title: "انقطاع في تسلسل السجل", hint: "كل حركة يجب أن تبدأ من الرصيد الذي انتهت به الحركة السابقة." },
};

export function StoresReconciliationScreen() {
  const { branchId } = useDesk();
  const report = useQuery({
    queryKey: ["go", "/admin/stores/reconciliation", branchId],
    queryFn: () => go<Reconciliation>("/admin/stores/reconciliation", { query: { branch_id: branchId ?? undefined } }),
  });
  return (
    <div className="grid gap-4">
      <PageTitle
        title={t("مطابقة المتاجر")}
        hint={t("فحوص تلقائية تقارن سجل المتاجر بأرصدتها وبمحافظ السائقين. لا تغيّر أي رصيد.")}
        action={<button type="button" className={btnGhost} onClick={() => void report.refetch()} disabled={report.isFetching}>{report.isFetching ? t("جارٍ الفحص…") : t("إعادة الفحص")}</button>}
      />
      <StateView loading={report.isLoading} error={report.error}>
        {report.data ? (
          <>
            <Notice>
              {report.data.ok ? t("كل الفحوص سليمة.") : t("توجد فروقات تحتاج مراجعة مالية.")} {t("المتاجر المفحوصة")}: {report.data.stores_checked} · {whenText(report.data.generated_at)}
            </Notice>
            <div className="grid gap-3 md:grid-cols-2">
              {report.data.checks.map((check) => {
                const label = CHECK_LABELS[check.key] ?? { title: check.key, hint: "" };
                return (
                  <Panel key={check.key} className="grid gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-heading">{t(label.title)}</p>
                        <p className="mt-0.5 text-xs text-muted">{t(label.hint)}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${check.ok ? "text-success-ink" : "text-danger-ink"}`}>
                        <Icon node={check.ok ? CircleCheck : CircleX} size={18} />
                        {check.ok ? t("سليم") : check.count}
                      </span>
                    </div>
                    {!check.ok ? (
                      <pre className="max-h-40 overflow-auto rounded-lg bg-heading/[0.04] p-2 text-[11px] leading-5 text-body" dir="ltr">
                        {JSON.stringify(check.samples, null, 1)}
                      </pre>
                    ) : null}
                  </Panel>
                );
              })}
            </div>
          </>
        ) : null}
      </StateView>
    </div>
  );
}
