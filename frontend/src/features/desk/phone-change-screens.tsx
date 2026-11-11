"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Smartphone } from "lucide";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useConfirm } from "@/features/desk/confirm";
import { useDesk } from "@/features/desk/desk-context";
import { go, isRecord } from "@/features/desk/go-api";
import { goFailure, isGoFailure, useGo, useGoList, useGoRecord } from "@/features/desk/hooks";
import { localeTag, t } from "@/features/desk/i18n/t";
import { enumLabel, headline } from "@/features/desk/present";
import { SearchSelect } from "@/features/desk/select";
import { Pager, type Paged } from "@/features/desk/store-kit";
import {
  btnDark,
  btnGhostSm,
  btnPrimary,
  ChipCount,
  chipActive,
  chipClass,
  chipGroup,
  DeskForm,
  Field,
  FormCard,
  FormGrid,
  inputClass,
  Notice,
  PageTitle,
  Panel,
  PanelHeader,
  PhoneText,
  StateView,
  StatusBadge,
} from "@/features/desk/ui";
import { Icon } from "@/shared/ui/icon";

const PATH = "/admin/drivers/phone-change-requests";

const FILTERS = [
  { id: "PENDING", label: "بانتظار" },
  { id: "STAFF_APPLIED", label: "من لوحة التحكم" },
  { id: "APPROVED", label: "موافق عليها" },
  { id: "REJECTED", label: "مرفوضة" },
  { id: "CANCELLED", label: "ملغى" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

type PhoneChangeRow = {
  id: string;
  status: string;
  driver_id: string;
  current_phone: string;
  requested_phone: string;
  otp_verified_at: string;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
  driver: { id: string; full_name: string | null; phone: string | null };
  reviewed_by: { id: string; full_name: string | null } | null;
};

function StaffDirectPhoneChange({ onApplied }: { onApplied?: () => void }) {
  const call = useGo();
  const confirm = useConfirm();
  const [driverId, setDriverId] = useState("");
  const [phone, setPhone] = useState("");
  const [remoteQuery, setRemoteQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(remoteQuery.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [remoteQuery]);

  const list = useGoList(
    "/erp/drivers",
    debouncedQuery ? { limit: 100, q: debouncedQuery } : { limit: 100 },
    true,
    true,
  );
  const selected = useGoRecord(driverId ? `/erp/drivers/${driverId}` : "", Boolean(driverId));

  function driverOption(row: Record<string, unknown>) {
    const name = headline(row);
    const rowPhone =
      (isRecord(row.user) && typeof row.user.phone === "string" && row.user.phone.trim()) ||
      (typeof row.phone === "string" && row.phone.trim()) ||
      "";
    return {
      value: String(row.id),
      searchText: rowPhone ? `${name} ${rowPhone}` : name,
      label: rowPhone ? (
        <span className="inline-flex max-w-full items-center gap-1.5 truncate">
          <span className="truncate">{name}</span>
          <span className="shrink-0 text-muted">·</span>
          <PhoneText className="shrink-0 text-muted">{rowPhone}</PhoneText>
        </span>
      ) : (
        name
      ),
    };
  }

  const options = (list.data ?? []).map(driverOption);
  if (driverId && selected.data && !options.some((option) => option.value === driverId)) {
    options.unshift(driverOption(selected.data));
  }

  const currentPhone =
    selected.data && isRecord(selected.data.user) && typeof selected.data.user.phone === "string"
      ? selected.data.user.phone
      : selected.data && typeof selected.data.phone === "string"
        ? selected.data.phone
        : "";
  const driverName = selected.data ? headline(selected.data) : "";

  return (
    <FormCard
      title={t("تغيير رقم من لوحة التحكم")}
      hint={t("اختر السائق وغيّر رقمه مباشرة بدون OTP. يسري فوراً ويُخرج السائق من كل الأجهزة. طلبات الموبايل تبقى كما هي عبر الموافقة أدناه.")}
    >
      <DeskForm
        className="grid gap-4"
        action={async (form) => {
          const id = String(form.get("driver_id") || driverId || "").trim();
          const next = String(form.get("phone") || phone || "").trim();
          if (!id || !next) return;
          if (currentPhone && (next === currentPhone || next === currentPhone.replace(/^\+963/, "0"))) {
            return goFailure(t("الرقم الجديد يجب أن يختلف عن الرقم الحالي."), { phone: t("الرقم الجديد يجب أن يختلف عن الرقم الحالي.") });
          }
          const name = driverName || t("سائق");
          const agreed = await confirm({
            title: t("تطبيق الرقم الجديد"),
            body: `${name}\n${currentPhone || "—"} ← ${next}\n${t("سيُحدَّث الرقم فوراً بدون OTP، ويُطلب من السائق تسجيل الدخول من جديد.")}`,
            confirm: t("تطبيق الرقم"),
          });
          if (!agreed) return;
          const result = await call(`/admin/drivers/${id}`, {
            method: "PATCH",
            body: { phone: next },
          });
          if (!isGoFailure(result)) {
            setPhone("");
            setDriverId("");
            setRemoteQuery("");
            onApplied?.();
          }
          return result;
        }}
      >
        <FormGrid>
          <Field label={t("السائق")}>
            <SearchSelect
              name="driver_id"
              required
              value={driverId}
              onValueChange={(next) => {
                setDriverId(next);
                setPhone("");
              }}
              placeholder={list.isLoading ? t("جارٍ التحميل…") : t("اختر سائقاً")}
              searchPlaceholder={t("ابحث بالاسم أو الرقم")}
              options={options}
              filterLocally={false}
              onQueryChange={setRemoteQuery}
              loading={list.isFetching}
            />
          </Field>
          <Field label={t("الرقم الجديد")}>
            <input
              className={inputClass}
              name="phone"
              dir="ltr"
              inputMode="tel"
              autoComplete="off"
              required
              placeholder="09XXXXXXXX"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            <span className="text-xs leading-5 text-muted">
              {driverId
                ? currentPhone
                  ? <>{t("الرقم الحالي")}: <PhoneText className="font-semibold text-heading">{currentPhone}</PhoneText></>
                  : selected.isLoading
                    ? t("جارٍ تحميل الرقم الحالي…")
                    : t("لا يوجد رقم مسجّل")
                : t("بدون OTP — التغيير من الداشبورد فقط.")}
            </span>
          </Field>
        </FormGrid>
        <div className="flex flex-wrap justify-end gap-2">
          <button className={btnDark} type="submit" disabled={!driverId}>
            {t("تطبيق الرقم")}
          </button>
        </div>
      </DeskForm>
    </FormCard>
  );
}

export function PhoneChangeRequestsScreen() {
  const { branchId } = useDesk();
  const call = useGo();
  const confirm = useConfirm();
  const [status, setStatus] = useState<FilterId>("PENDING");
  const [page, setPage] = useState(1);
  const query = {
    status,
    page,
    limit: 20,
    ...(branchId ? { branch_id: branchId } : {}),
  };
  const list = useQuery({
    queryKey: ["go", PATH, query],
    queryFn: async () => asPhonePage(await go<unknown>(PATH, { query })),
    placeholderData: keepPreviousData,
  });
  const pendingCount = useQuery({
    queryKey: ["go", PATH, "pending-count", branchId ?? ""],
    queryFn: async () => asPhonePage(await go<unknown>(PATH, {
      query: { status: "PENDING", page: 1, limit: 1, ...(branchId ? { branch_id: branchId } : {}) },
    })).total,
  });

  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;

  function act(row: PhoneChangeRow, action: "approve" | "reject") {
    const approve = action === "approve";
    const name = row.driver.full_name?.trim() || t("سائق");
    void confirm({
      title: approve ? t("موافقة على تغيير الرقم") : t("رفض تغيير الرقم"),
      body: approve
        ? `${name}\n${row.current_phone} ← ${row.requested_phone}\n${t("سيُحدَّث رقم السائق ويُطلب منه تسجيل الدخول من جديد.")}`
        : `${name}\n${row.current_phone} ← ${row.requested_phone}\n${t("سيبقى الرقم الحالي ولن يُطبَّق الرقم المطلوب.")}`,
      confirm: approve ? t("موافقة") : t("رفض"),
      danger: !approve,
      perform: () =>
        call(`${PATH}/${row.id}/${action}`, {
          method: "POST",
          idempotent: true,
          body: action === "reject" ? {} : undefined,
        }),
    });
  }

  return (
    <div className="grid min-w-0 gap-4">
      <PageTitle
        title={t("تغيير أرقام السائقين")}
        hint={t("من اللوحة: غيّر رقم أي سائق مباشرة بدون OTP. من الموبايل: السائق يطلب بعد OTP ثم توافق أو ترفض هنا.")}
      />
      <StaffDirectPhoneChange
        onApplied={() => {
          setStatus("STAFF_APPLIED");
          setPage(1);
        }}
      />
      {(pendingCount.data ?? 0) > 0 && status !== "PENDING" ? (
        <Notice>
          {t("هناك طلبات بانتظار المراجعة.")}{" "}
          <button type="button" className="font-semibold text-accent" onClick={() => { setStatus("PENDING"); setPage(1); }}>
            {t("عرض الطلبات المعلّقة")} ({pendingCount.data})
          </button>
        </Notice>
      ) : null}
      <Panel flush className="min-w-0 overflow-hidden">
        <PanelHeader
          title={t("الطلبات")}
          action={
            <div className={chipGroup} role="tablist">
              {FILTERS.map((item) => {
                const active = item.id === status;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={active ? chipActive : chipClass}
                    onClick={() => {
                      setStatus(item.id);
                      setPage(1);
                    }}
                  >
                    {t(item.label)}
                    {item.id === "PENDING" ? <ChipCount value={pendingCount.data ?? 0} active={active} /> : null}
                    {item.id === status && item.id !== "PENDING" ? <ChipCount value={total} active={active} /> : null}
                  </button>
                );
              })}
            </div>
          }
        />
        <StateView bare loading={list.isLoading} error={list.error} empty={!list.isLoading && rows.length === 0}>
          <div className="grid gap-3 p-5">
            {rows.map((row) => (
              <PhoneChangeCard key={row.id} row={row} onAct={row.status === "PENDING" ? act : undefined} />
            ))}
          </div>
          {list.data ? (
            <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
          ) : null}
        </StateView>
      </Panel>
    </div>
  );
}

function PhoneChangeCard({
  row,
  onAct,
}: {
  row: PhoneChangeRow;
  onAct?: (row: PhoneChangeRow, action: "approve" | "reject") => void;
}) {
  const pending = row.status === "PENDING";
  const fromDesk = row.status === "STAFF_APPLIED";
  const name = row.driver.full_name?.trim() || t("سائق");
  const decided = whenLabel(row.reviewed_at);

  return (
    <article className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex min-w-0 gap-3.5">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand/12 text-accent ring-1 ring-inset ring-brand/25">
            <Icon node={Smartphone} size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">{t("السائق")}</p>
            <h3 className="mt-0.5 text-lg font-semibold tracking-tight text-heading">{name}</h3>
            <Link
              href={`/admin/drivers/${row.driver_id}`}
              className="mt-1 inline-flex text-xs font-semibold text-accent hover:text-brand-strong"
            >
              {t("فتح ملف السائق")}
            </Link>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <PhoneChip label={fromDesk ? t("السابق") : t("الحالي")} value={row.current_phone} />
              <Icon node={ArrowLeftRight} size={14} className="text-muted" />
              <PhoneChip label={fromDesk ? t("الجديد") : t("المطلوب")} value={row.requested_phone} highlight />
            </div>
          </div>
        </div>
        {row.status ? <StatusBadge value={row.status} label={enumLabel(row.status)} /> : null}
      </div>
      <div className="grid border-t border-line sm:grid-cols-2">
        <div className="min-w-0 px-5 py-3.5 sm:border-e sm:border-line">
          <p className="text-xs font-medium text-muted">{fromDesk ? t("تاريخ التغيير") : t("تاريخ الطلب")}</p>
          <p className="mt-0.5 text-sm font-semibold text-heading">{whenLabel(row.created_at) || "—"}</p>
          <p className="mt-0.5 text-xs text-muted">
            {fromDesk ? t("طُبّق مباشرة من لوحة التحكم بدون OTP") : t("تم التحقق من الرقم بـ OTP")}
          </p>
        </div>
        <div className="min-w-0 border-t border-line px-5 py-3.5 sm:border-t-0">
          {pending ? (
            <>
              <p className="text-xs font-medium text-muted">{t("الحالة")}</p>
              <p className="mt-0.5 text-sm font-semibold text-heading">{t("بانتظار موافقتك")}</p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-muted">{fromDesk ? t("نفّذه") : t("المراجعة")}</p>
              <p className="mt-0.5 text-sm font-semibold text-heading">
                {row.reviewed_by?.full_name?.trim() || "—"}
                {decided ? ` · ${decided}` : ""}
              </p>
              {row.status === "APPROVED" || fromDesk ? (
                <p className="mt-0.5 text-xs font-medium text-success-ink">{t("تم تحديث الرقم")}</p>
              ) : null}
              {row.status === "REJECTED" ? (
                <p className="mt-0.5 text-xs font-medium text-danger-ink">
                  {row.reject_reason?.trim() || t("الرقم لم يتغيّر")}
                </p>
              ) : null}
              {row.status === "CANCELLED" ? (
                <p className="mt-0.5 text-xs font-medium text-muted">
                  {row.reject_reason?.includes("Superseded")
                    ? t("أُلغي بسبب تغيير من لوحة التحكم")
                    : t("ألغى السائق الطلب")}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
      {pending && onAct ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-heading/[0.02] px-5 py-3.5">
          <p className="text-sm text-muted">{t("الموافقة تغيّر الرقم فوراً؛ الرفض يبقيه كما هو.")}</p>
          <div className="flex gap-2">
            <button
              className="inline-flex h-10 items-center rounded-lg border border-danger/30 bg-danger/10 px-4 text-sm font-semibold text-danger-ink transition-colors hover:bg-danger/15"
              type="button"
              onClick={() => onAct(row, "reject")}
            >
              {t("رفض")}
            </button>
            <button className={btnPrimary} type="button" onClick={() => onAct(row, "approve")}>
              {t("موافقة")}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function PhoneChip({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <span
      className={`inline-flex flex-col rounded-lg px-2.5 py-1.5 ring-1 ring-inset ${
        highlight ? "bg-teal/10 ring-teal/25" : "bg-heading/[0.04] ring-line"
      }`}
    >
      <span className="text-[10px] font-medium text-muted">{label}</span>
      <span className="phone-ltr text-sm font-semibold tabular-nums text-heading" dir="ltr" data-phone="">
        {value}
      </span>
    </span>
  );
}

/** Banner for command center when pending phone-change requests exist. */
export function PhoneChangePendingBanner() {
  const { branchId } = useDesk();
  const pending = useQuery({
    queryKey: ["go", PATH, "banner", branchId ?? ""],
    queryFn: async () =>
      asPhonePage(
        await go<unknown>(PATH, {
          query: { status: "PENDING", page: 1, limit: 5, ...(branchId ? { branch_id: branchId } : {}) },
        }),
      ),
    refetchInterval: 60_000,
  });
  const rows = pending.data?.data ?? [];
  const total = pending.data?.total ?? 0;
  if (pending.isLoading || pending.error || total === 0) return null;

  return (
    <Panel className="border-warning/40 bg-warning/5">
      <PanelHeader
        title={t("طلبات تغيير أرقام السائقين")}
        hint={t("سائقون طلبوا رقم هاتف جديداً بعد التحقق بـ OTP وبانتظار موافقتك.")}
        action={
          <Link className={btnGhostSm} href="/admin/drivers/phone-changes">
            {t("مراجعة الطلبات")} ({total})
          </Link>
        }
      />
      <ul className="divide-y divide-line">
        {rows.slice(0, 5).map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-heading">{row.driver.full_name?.trim() || t("سائق")}</p>
              <p className="phone-ltr mt-0.5 text-xs text-muted" dir="ltr" data-phone="">
                {row.current_phone} → {row.requested_phone}
              </p>
            </div>
            <StatusBadge value="PENDING" label={enumLabel("PENDING")} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function asPhonePage(payload: unknown): Paged<PhoneChangeRow> {
  if (!isRecord(payload)) return { data: [], total: 0, page: 1, limit: 20 };
  const raw = payload.data ?? payload.items;
  const data = Array.isArray(raw)
    ? (raw.filter((row): row is PhoneChangeRow => isRecord(row) && typeof row.id === "string") as PhoneChangeRow[])
    : [];
  return {
    data,
    total: typeof payload.total === "number" ? payload.total : data.length,
    page: typeof payload.page === "number" ? payload.page : 1,
    limit: typeof payload.limit === "number" ? payload.limit : 20,
  };
}

function whenLabel(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(localeTag(), { dateStyle: "medium", timeStyle: "short" }).format(date);
}
