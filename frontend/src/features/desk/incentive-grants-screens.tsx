"use client";

import { t } from "@/features/desk/i18n/t";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useConfirm } from "@/features/desk/confirm";
import { DateField } from "@/features/desk/controls";
import { useDesk } from "@/features/desk/desk-context";
import { go, isRecord } from "@/features/desk/go-api";
import { goFailure, isGoFailure, useGo, useGoList, useGoRecord } from "@/features/desk/hooks";
import { enumLabel, formatMoney, formatScalar, headline } from "@/features/desk/present";
import { SearchSelect } from "@/features/desk/select";
import type { StaffRole } from "@/features/desk/session";
import {
  btnDark,
  btnGhost,
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
  PhoneText,
  StateView,
} from "@/features/desk/ui";

type Row = Record<string, unknown>;
type Kind = "STREAK_DAILY" | "GOAL_CAMPAIGN" | "RIDE_REJECTION" | "RIDE_DISTANCE" | "MANUAL";

type GrantsReport = {
  from: string;
  to: string;
  daily_cap: number | null;
  totals: { amount: number; count: number; cap_hits: number; by_kind: { kind: Kind; amount: number; count: number }[] };
  by_day: { day: string; amount: number; count: number; by_kind: Partial<Record<Kind, number>>; cap_hits: number }[];
  items: Row[];
  total: number;
  page: number;
  limit: number;
};

const KINDS: Kind[] = ["STREAK_DAILY", "GOAL_CAMPAIGN", "RIDE_REJECTION", "RIDE_DISTANCE", "MANUAL"];

const KIND_TONE: Record<Kind, string> = {
  STREAK_DAILY: "bg-brand",
  GOAL_CAMPAIGN: "bg-teal",
  RIDE_REJECTION: "bg-warning",
  RIDE_DISTANCE: "bg-success",
  MANUAL: "bg-heading",
};

function roleIs(role: StaffRole | undefined, roles: StaffRole[]) {
  return !!role && (role === "SUPER_ADMIN" || roles.includes(role));
}

function useGrants(query: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: ["go", "/admin/incentives/grants", query],
    queryFn: () => go<GrantsReport>("/admin/incentives/grants", { query }),
  });
}

function driverName(row: Row) {
  const driver = (row.driver ?? {}) as Row;
  const user = (driver.user ?? {}) as Row;
  if (typeof user.full_name === "string" && user.full_name) return user.full_name;
  if (typeof user.phone === "string" && user.phone) {
    return (
      <bdi className="phone-ltr tabular-nums" dir="ltr" data-phone="">
        {user.phone}
      </bdi>
    );
  }
  return "—";
}

function grantSource(row: Row) {
  const ride = row.ride as Row | null | undefined;
  const campaign = row.campaign as Row | null | undefined;
  const meta = isRecord(row.metadata) ? row.metadata : null;
  if (row.kind === "MANUAL") {
    const note = meta && typeof meta.note === "string" && meta.note.trim() ? meta.note.trim() : "";
    return note || t("من لوحة التحكم");
  }
  if (ride?.public_number) {
    return <Link className="text-accent hover:underline" href={`/erp/rides/${String(ride.id)}`}>{String(ride.public_number)}</Link>;
  }
  if (campaign?.name) return String(campaign.name);
  if (row.kind === "STREAK_DAILY") return `${t("يوم")} ${String(row.period_key)}`;
  return "—";
}

function ManualIncentiveGrantForm({ onGranted }: { onGranted?: () => void }) {
  const call = useGo();
  const confirm = useConfirm();
  const [driverId, setDriverId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
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
    const phone =
      (isRecord(row.user) && typeof row.user.phone === "string" && row.user.phone.trim()) ||
      (typeof row.phone === "string" && row.phone.trim()) ||
      "";
    return {
      value: String(row.id),
      searchText: phone ? `${name} ${phone}` : name,
      label: phone ? (
        <span className="inline-flex max-w-full items-center gap-1.5 truncate">
          <span className="truncate">{name}</span>
          <span className="shrink-0 text-muted">·</span>
          <PhoneText className="shrink-0 text-muted">{phone}</PhoneText>
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
  const driverName = selected.data ? headline(selected.data) : "";

  return (
    <FormCard
      title={t("مكافأة لسائق محدد")}
      hint={t("تُضاف فوراً إلى محفظة السائق وتظهر في المكافآت المصروفة. لا تمر عبر قواعد السلسلة أو الحملات.")}
    >
      <DeskForm
        className="grid gap-4"
        action={async (form) => {
          const id = String(form.get("driver_id") || driverId || "").trim();
          const rawAmount = String(form.get("amount") || amount || "").trim().replace(/,/g, "");
          const value = Number(rawAmount);
          const noteText = String(form.get("note") || note || "").trim();
          if (!id) return goFailure(t("اختر سائقاً."), { driver_id: t("اختر سائقاً.") });
          if (!Number.isFinite(value) || value < 1) {
            return goFailure(t("أدخل مبلغاً أكبر من صفر."), { amount: t("أدخل مبلغاً أكبر من صفر.") });
          }
          const agreed = await confirm({
            title: t("صرف مكافأة يدوية"),
            body: `${driverName || t("سائق")}\n${formatMoney(value)}${noteText ? `\n${noteText}` : ""}\n${t("سيُضاف المبلغ إلى محفظة السائق فوراً.")}`,
            confirm: t("صرف المكافأة"),
          });
          if (!agreed) return;
          const result = await call("/admin/incentives/grants/manual", {
            method: "POST",
            body: { driver_id: id, amount: value, note: noteText || undefined },
          });
          if (!isGoFailure(result)) {
            setDriverId("");
            setAmount("");
            setNote("");
            setRemoteQuery("");
            onGranted?.();
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
              onValueChange={setDriverId}
              placeholder={list.isLoading ? t("جارٍ التحميل…") : t("اختر سائقاً")}
              searchPlaceholder={t("ابحث بالاسم أو الرقم")}
              options={options}
              filterLocally={false}
              onQueryChange={setRemoteQuery}
              loading={list.isFetching}
            />
          </Field>
          <Field label={t("المبلغ")}>
            <input
              className={inputClass}
              name="amount"
              dir="ltr"
              inputMode="decimal"
              required
              placeholder="25000"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label={t("ملاحظة (اختياري)")}>
            <input
              className={inputClass}
              name="note"
              maxLength={200}
              placeholder={t("سبب المكافأة")}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
        </FormGrid>
        <div className="flex flex-wrap justify-end gap-2">
          <button className={btnDark} type="submit" disabled={!driverId}>
            {t("صرف المكافأة")}
          </button>
        </div>
      </DeskForm>
    </FormCard>
  );
}

function GrantsTable({ items, showDriver }: { items: Row[]; showDriver: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-heading/[0.03] text-xs text-muted">
          <tr>
            <th className="px-3 py-2.5 text-start font-medium">{t("التاريخ")}</th>
            {showDriver ? <th className="px-3 py-2.5 text-start font-medium">{t("السائق")}</th> : null}
            <th className="px-3 py-2.5 text-start font-medium">{t("النوع")}</th>
            <th className="px-3 py-2.5 text-start font-medium">{t("المصدر")}</th>
            <th className="px-3 py-2.5 text-end font-medium">{t("المبلغ")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((row) => (
            <tr key={String(row.id)}>
              <td className="whitespace-nowrap px-3 py-2.5 text-body">{formatScalar("created_at", row.created_at)}</td>
              {showDriver ? (
                <td className="px-3 py-2.5">
                  <Link className="font-medium text-heading hover:text-accent" href={`/admin/drivers/${String(row.driver_id)}`}>{driverName(row)}</Link>
                </td>
              ) : null}
              <td className="px-3 py-2.5">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className={`size-2 rounded-full ${KIND_TONE[row.kind as Kind] ?? "bg-muted"}`} />
                  {enumLabel(String(row.kind))}
                </span>
              </td>
              <td className="px-3 py-2.5 text-body">{grantSource(row)}</td>
              <td className="px-3 py-2.5 text-end font-semibold tabular-nums text-heading">{formatMoney(Number(row.amount ?? 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pager({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3 text-sm text-muted">
      <button className={btnGhost} type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t("السابق")}</button>
      <span className="tabular-nums">{page} / {pages}</span>
      <button className={btnGhost} type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t("التالي")}</button>
    </div>
  );
}

function rangeDays(from: string, to: string) {
  const days: string[] = [];
  for (let at = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`); at <= end && days.length < 400; at += 86_400_000) {
    days.push(new Date(at).toISOString().slice(0, 10));
  }
  return days;
}

function DailyBars({ report }: { report: GrantsReport }) {
  const byDay = new Map(report.by_day.map((d) => [d.day, d]));
  const days = rangeDays(report.from, report.to).map((day) => byDay.get(day) ?? { day, amount: 0, count: 0, by_kind: {}, cap_hits: 0 });
  const max = Math.max(...days.map((d) => d.amount), 1);
  return (
    <div className="grid gap-2">
      <div className="flex h-40 items-end gap-px border-b border-line" dir="ltr">
        {days.map((day) => (
          <div key={day.day} className="flex h-full min-w-2 flex-1 flex-col justify-end" title={`${day.day}: ${formatMoney(day.amount)} (${day.count})${day.cap_hits ? ` · ${t("السقف اليومي")} ${day.cap_hits}` : ""}`}>
            {KINDS.filter((k) => day.by_kind[k]).map((k) => (
              <div key={k} className={`${KIND_TONE[k]} first:rounded-t`} style={{ height: `${((day.by_kind[k] ?? 0) / max) * 100}%` }} />
            ))}
            {day.amount === 0 ? <div className="h-px bg-heading/[0.08]" /> : null}
            {day.cap_hits ? <div className="mt-0.5 h-1 rounded bg-danger" /> : null}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[11px] tabular-nums text-muted" dir="ltr">
        <span>{report.from}</span>
        <span>{report.to}</span>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted">
        {KINDS.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span aria-hidden className={`size-2 rounded-full ${KIND_TONE[k]}`} />{enumLabel(k)}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-1 w-3 rounded bg-danger" />{t("يوم وصل فيه السقف")}</span>
      </div>
    </div>
  );
}

export function IncentiveGrantsScreen() {
  const { branchId, session } = useDesk();
  const queryClient = useQueryClient();
  const canGrantManual = roleIs(session?.user.role, ["FINANCE", "WALLET_OPERATOR", "ADMIN"]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<Kind | "">("");
  const [page, setPage] = useState(1);
  const report = useGrants({ from: from || undefined, to: to || undefined, kind: kind || undefined, branch_id: branchId ?? undefined, page, limit: 25 });
  const data = report.data;

  return (
    <div className="grid gap-5">
      <PageTitle
        title={t("المكافآت المصروفة")}
        hint={t("كل مكافأة دفعتها الشركة إلى محفظة سائق: السلسلة، حملات الأهداف، الطلبات المرفوضة والبعيدة، والمكافآت اليدوية. الأيام حسب المنطقة الزمنية للحوافز.")}
      />
      {canGrantManual ? (
        <ManualIncentiveGrantForm
          onGranted={() => {
            setKind("MANUAL");
            setPage(1);
            void queryClient.invalidateQueries({ queryKey: ["go", "/admin/incentives/grants"] });
          }}
        />
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className={chipGroup}>
          <button type="button" className={kind === "" ? chipActive : chipClass} onClick={() => { setKind(""); setPage(1); }}>{t("الكل")}</button>
          {KINDS.map((k) => (
            <button key={k} type="button" className={kind === k ? chipActive : chipClass} onClick={() => { setKind(k); setPage(1); }}>{enumLabel(k)}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:w-[22rem]">
          <DateField
            label={t("من")}
            value={from || data?.from || ""}
            onValueChange={(next) => {
              setFrom(next.slice(0, 10));
              setPage(1);
            }}
          />
          <DateField
            label={t("إلى")}
            value={to || data?.to || ""}
            onValueChange={(next) => {
              setTo(next.slice(0, 10));
              setPage(1);
            }}
          />
        </div>
      </div>
      <StateView loading={report.isLoading} error={report.error}>
        {data ? (
          <div className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Panel>
                <p className="text-xs font-medium text-muted">{t("إجمالي المصروف")}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-heading">{formatMoney(data.totals.amount)}</p>
                <p className="mt-1 text-xs text-muted">{data.totals.count} {t("مكافأة")}</p>
              </Panel>
              {data.totals.by_kind.slice(0, 2).map((row) => (
                <Panel key={row.kind}>
                  <p className="text-xs font-medium text-muted">{enumLabel(row.kind)}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-heading">{formatMoney(row.amount)}</p>
                  <p className="mt-1 text-xs text-muted">{row.count} {t("مكافأة")}</p>
                </Panel>
              ))}
              <Panel>
                <p className="text-xs font-medium text-muted">{t("السقف اليومي")}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-heading">{data.daily_cap == null ? t("بدون سقف") : formatMoney(data.daily_cap)}</p>
                <p className={`mt-1 text-xs ${data.totals.cap_hits ? "text-danger-ink" : "text-muted"}`}>
                  {data.totals.cap_hits ? `${data.totals.cap_hits} ${t("مكافأة لم تُصرف بسبب السقف")}` : t("لم يُتجاوز السقف")}
                </p>
              </Panel>
            </div>
            {data.totals.by_kind.length > 2 ? (
              <div className="flex flex-wrap gap-4 text-sm text-body">
                {data.totals.by_kind.slice(2).map((row) => (
                  <span key={row.kind}>{enumLabel(row.kind)}: <b className="tabular-nums text-heading">{formatMoney(row.amount)}</b> ({row.count})</span>
                ))}
              </div>
            ) : null}
            <FormCard title={t("المصروف حسب اليوم")}>
              {data.by_day.length ? <DailyBars report={data} /> : <p className="text-sm text-muted">{t("لا توجد مكافآت في هذه الفترة.")}</p>}
              {data.by_day.length ? <p className="text-xs text-muted">{t("مكافآت السلسلة والحملات تُصرف بعد انتهاء اليوم أو الحملة، لذلك تظهر في يوم الصرف.")}</p> : null}
            </FormCard>
            <Panel flush>
              {data.items.length ? <GrantsTable items={data.items} showDriver /> : <p className="p-5 text-sm text-muted">{t("لا توجد مكافآت في هذه الفترة.")}</p>}
              <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
            </Panel>
          </div>
        ) : null}
      </StateView>
    </div>
  );
}

/** Last bonuses paid to one driver (driver page and wallet page). */
export function DriverGrantsCard({ driverId }: { driverId: string }) {
  const [page, setPage] = useState(1);
  const today = new Date();
  const from = new Date(today.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
  const report = useGrants({ driver_id: driverId, from, page, limit: 10 });
  const data = report.data;
  return (
    <FormCard
      title={t("المكافآت المصروفة")}
      hint={data ? `${t("آخر 12 شهراً")}: ${formatMoney(data.totals.amount)} · ${data.totals.count} ${t("مكافأة")}` : undefined}
    >
      <StateView bare loading={report.isLoading} error={report.error}>
        {data && data.items.length ? (
          <div className="grid gap-2">
            {data.totals.cap_hits ? <Notice>{`${data.totals.cap_hits} ${t("مكافأة لم تُصرف بسبب السقف")}`}</Notice> : null}
            <GrantsTable items={data.items} showDriver={false} />
            <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
          </div>
        ) : (
          <p className="text-sm text-muted">{t("لم تُصرف مكافآت لهذا السائق بعد.")}</p>
        )}
      </StateView>
    </FormCard>
  );
}
