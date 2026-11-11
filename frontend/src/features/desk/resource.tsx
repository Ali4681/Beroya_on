"use client";

import { pageWindow, t } from "@/features/desk/i18n/t";

import { ChevronLeft, Search, X } from "lucide";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

const REMOTE_SEARCH_PATHS = new Set(["/erp/drivers", "/erp/customers"]);

import { DateField } from "@/features/desk/controls";
import { isRecord } from "@/features/desk/go-api";
import { useGoList, useGoRecord } from "@/features/desk/hooks";
import { NAV_ICONS } from "@/features/desk/icons";
import { navMatch } from "@/features/desk/nav";
import { ChoiceSelect, SearchSelect } from "@/features/desk/select";
import { columnsFor, enumLabel, factsOf, formatScalar, headline, searchBlob, tally } from "@/features/desk/present";
import {
  btnGhostSm,
  chipActive,
  chipClass,
  ChipCount,
  chipGroup,
  Count,
  EmptyState,
  FormCard,
  inputBase,
  inputClass,
  isPhoneField,
  labelClass,
  looksLikePhone,
  PageTitle,
  Panel,
  PhoneText,
  StateView,
  StatusBadge,
} from "@/features/desk/ui";
import { Icon } from "@/shared/ui/icon";

export function LookupSelect({
  path,
  label,
  value,
  onValueChange,
}: {
  path: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const list = useGoList(path, { limit: 100 });
  return (
    <div className="min-w-48">
      <ChoiceSelect
        value={value}
        onValueChange={onValueChange}
        emptyLabel={label}
        placeholder={list.isLoading ? t("جارٍ التحميل…") : label}
        options={(list.data ?? []).map((row) => ({ value: String(row.id), label: headline(row) }))}
      />
    </div>
  );
}

const FOLD: Record<string, string> = { "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي" };

/** Calendar day `YYYY-MM-DD` in the browser's local zone (never UTC-slice an ISO string). */
function asLocalDay(value: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Expand local calendar days to ISO bounds for the API without shifting the shown day. */
function withDateBounds(query: Record<string, string>) {
  const next = { ...query };
  const fromDay = typeof next.from === "string" ? asLocalDay(next.from) : "";
  const toDay = typeof next.to === "string" ? asLocalDay(next.to) : "";
  if (fromDay) next.from = new Date(`${fromDay}T00:00:00`).toISOString();
  else delete next.from;
  if (toDay) next.to = new Date(`${toDay}T23:59:59.999`).toISOString();
  else delete next.to;
  return next;
}

/** Same folding as the server search, one output char per input char so indexes still line up. */
function foldText(value: string) {
  return Array.from(value.toLowerCase(), (char) => {
    if (/[\u0660-\u0669]/.test(char)) return String(char.charCodeAt(0) - 0x0660);
    if (/[\u06F0-\u06F9]/.test(char)) return String(char.charCodeAt(0) - 0x06f0);
    return FOLD[char] ?? char;
  }).join("");
}

function Highlight({ text, term }: { text: string; term: string }) {
  const haystack = foldText(text);
  const ranges: [number, number][] = [];
  for (const word of foldText(term).split(/\s+/).filter(Boolean)) {
    const digits = word.replace(/\D/g, "");
    const candidates = [word];
    if (digits.length >= 3 && digits === word.replace(/[+-]/g, "")) {
      candidates.push(digits.startsWith("00") ? digits.slice(2) : digits.startsWith("0") ? `963${digits.slice(1)}` : digits);
    }
    for (const candidate of candidates) {
      const at = haystack.indexOf(candidate);
      if (at >= 0) {
        ranges.push([at, at + candidate.length]);
        break;
      }
    }
  }
  if (ranges.length === 0) return <>{text}</>;
  ranges.sort((a, b) => a[0] - b[0]);
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (end <= cursor) continue;
    const from = Math.max(start, cursor);
    if (from > cursor) parts.push(text.slice(cursor, from));
    parts.push(
      <mark key={from} className="rounded-sm bg-brand/25 px-0.5 text-heading">
        {text.slice(from, end)}
      </mark>,
    );
    cursor = end;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}

export function ListScreen({
  title,
  hint,
  path,
  filters = [],
  lookups = [],
  flags = [],
  rowHref,
  extra,
  onPick,
  rowActions,
  action,
  initialQuery,
  dates = false,
  heading = true,
  search,
  segments,
}: {
  title: string;
  hint?: string;
  path: string;
  filters?: { name: string; label: string; options: string[] }[];
  lookups?: { name: string; label: string; path: string }[];
  flags?: { name: string; label: string }[];
  rowHref?: (row: Record<string, unknown>) => string | null;
  extra?: ReactNode;
  onPick?: (row: Record<string, unknown>) => void;
  rowActions?: (row: Record<string, unknown>) => ReactNode;
  action?: ReactNode;
  initialQuery?: Record<string, string>;
  dates?: boolean;
  heading?: boolean;
  /** Search on the server across every page instead of filtering the rows already loaded. */
  search?: { param: string; placeholder: string; hint?: string };
  segments?: { param: string; options: { value: string; label: string }[] };
}) {
  const router = useRouter();
  const [query, setQuery] = useState<Record<string, string>>({ page: "1", limit: "20", ...initialQuery });
  const [needle, setNeedle] = useState(() => (search ? (initialQuery?.[search.param] ?? "") : ""));
  const [chip, setChip] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const list = useGoList(path, dates ? withDateBounds(query) : query, true, Boolean(search));
  const rows = list.data ?? [];
  const serverTerm = search ? (query[search.param] ?? "") : "";
  const settling = Boolean(search) && needle.trim() !== serverTerm;
  const facet = segments ? "" : rows.some((row) => typeof row.status === "string") ? "status" : rows.some((row) => typeof row.type === "string") ? "type" : "";
  const counts = facet ? tally(rows, facet) : [];
  const visible = rows.filter((row) => {
    if (chip && row[facet] !== chip) return false;
    if (search) return true;
    const term = needle.trim().toLowerCase();
    return !term || searchBlob(row).includes(term);
  });
  const columns = columnsFor(visible.length > 0 ? visible : rows);
  const page = Number(query.page || "1");
  const term = search ? serverTerm : needle.trim();
  const searching = Boolean(search) && (settling || list.isFetching);

  const searchParam = search?.param;
  useEffect(() => {
    if (!searchParam) return;
    const id = window.setTimeout(() => {
      const value = needle.trim();
      setQuery((current) => ((current[searchParam] ?? "") === value ? current : { ...current, [searchParam]: value, page: "1" }));
    }, 300);
    return () => window.clearTimeout(id);
  }, [needle, searchParam]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      event.preventDefault();
      field.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const placeholder = search?.placeholder ?? t("بحث بالاسم أو الرقم أو الحالة");

  return (
    <div>
      {heading ? <PageTitle title={title} hint={hint} action={action} /> : action ? <div className="mb-4 flex justify-end">{action}</div> : null}
      {extra}
      <Panel flush>
        <div className="grid gap-3 border-b border-line p-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="relative min-w-60 flex-1">
              <label htmlFor={`${path}-search`} className="sr-only">{placeholder}</label>
              {searching ? (
                <span aria-hidden className="absolute start-3 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-line border-t-accent" />
              ) : (
                <Icon node={Search} size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
              )}
              <input
                id={`${path}-search`}
                ref={field}
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                spellCheck={false}
                className={`${inputBase} pe-16 ps-9 [&::-webkit-search-cancel-button]:hidden`}
                value={needle}
                onChange={(event) => setNeedle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && needle) {
                    event.preventDefault();
                    setNeedle("");
                  }
                }}
                placeholder={placeholder}
              />
              <div className="absolute end-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                {needle ? (
                  <button
                    type="button"
                    className="grid size-7 place-items-center rounded-md text-muted transition-colors hover:bg-heading/5 hover:text-heading"
                    aria-label={t("مسح البحث")}
                    onClick={() => {
                      setNeedle("");
                      field.current?.focus();
                    }}
                  >
                    <Icon node={X} size={15} />
                  </button>
                ) : (
                  <kbd className="hidden h-6 min-w-6 place-items-center rounded-md border border-line px-1.5 font-sans text-[11px] text-muted sm:grid" title={t("اضغط / للبحث")}>/</kbd>
                )}
              </div>
            </div>
            {filters.map((filter) => (
              <div key={filter.name} className="min-w-48">
                <ChoiceSelect
                  value={query[filter.name] ?? ""}
                  onValueChange={(next) => setQuery((current) => ({ ...current, [filter.name]: next, page: "1" }))}
                  emptyLabel={filter.label}
                  options={filter.options.map((option) => ({ value: option, label: enumLabel(option) }))}
                />
              </div>
            ))}
            {lookups.map((lookup) => (
              <LookupSelect
                key={lookup.name}
                path={lookup.path}
                label={lookup.label}
                value={query[lookup.name] ?? ""}
                onValueChange={(next) => setQuery((current) => ({ ...current, [lookup.name]: next, page: "1" }))}
              />
            ))}
            {dates ? (
              <>
                <div className="min-w-48 max-w-56">
                  <DateField
                    label={t("من تاريخ")}
                    value={typeof query.from === "string" ? asLocalDay(query.from) : ""}
                    max={typeof query.to === "string" && query.to ? asLocalDay(query.to) : undefined}
                    onValueChange={(next) => {
                      const day = asLocalDay(next);
                      setQuery((current) => {
                        const toDay = typeof current.to === "string" ? asLocalDay(current.to) : "";
                        const bumpTo = Boolean(day && toDay && day > toDay);
                        return {
                          ...current,
                          from: day,
                          ...(bumpTo ? { to: day } : {}),
                          page: "1",
                        };
                      });
                    }}
                  />
                </div>
                <div className="min-w-48 max-w-56">
                  <DateField
                    label={t("إلى تاريخ")}
                    value={typeof query.to === "string" ? asLocalDay(query.to) : ""}
                    min={typeof query.from === "string" && query.from ? asLocalDay(query.from) : undefined}
                    onValueChange={(next) => {
                      const day = asLocalDay(next);
                      setQuery((current) => {
                        const fromDay = typeof current.from === "string" ? asLocalDay(current.from) : "";
                        const clamped = day && fromDay && day < fromDay ? fromDay : day;
                        return {
                          ...current,
                          to: clamped,
                          page: "1",
                        };
                      });
                    }}
                  />
                </div>
              </>
            ) : null}
            {flags.map((flag) => (
              <div key={flag.name} className="min-w-48">
                <ChoiceSelect
                  value={query[flag.name] ?? ""}
                  onValueChange={(next) => setQuery((current) => ({ ...current, [flag.name]: next, page: "1" }))}
                  emptyLabel={t("الكل")}
                  options={[{ value: "true", label: flag.label }]}
                />
              </div>
            ))}
          </div>
          {search?.hint ? <p className="-mt-1 text-xs text-muted">{search.hint}</p> : null}
          {segments ? (
            <div className={chipGroup}>
              <button
                type="button"
                className={query[segments.param] ? chipClass : chipActive}
                onClick={() => setQuery((current) => ({ ...current, [segments.param]: "", page: "1" }))}
              >
                {t("الكل")}
              </button>
              {segments.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={query[segments.param] === option.value ? chipActive : chipClass}
                  onClick={() =>
                    setQuery((current) => ({
                      ...current,
                      [segments.param]: current[segments.param] === option.value ? "" : option.value,
                      page: "1",
                    }))
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
          {counts.length > 0 ? (
            <div className={chipGroup}>
              <button type="button" className={chip ? chipClass : chipActive} onClick={() => setChip("")}>
                {t("الكل")}
                <ChipCount value={rows.length} active={!chip} />
              </button>
              {counts.map(([value, count]) => (
                <button
                  key={value}
                  type="button"
                  className={chip === value ? chipActive : chipClass}
                  onClick={() => setChip((current) => (current === value ? "" : value))}
                >
                  {enumLabel(value)}
                  <ChipCount value={count} active={chip === value} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <StateView bare loading={list.isLoading} error={list.error} empty={!list.isLoading && rows.length === 0 && !term && !(segments && query[segments.param])}>
          {visible.length === 0 ? (
            search ? (
              <EmptyState
                bare
                icon={Search}
                title={term ? `${t("لا توجد نتائج مطابقة لـ")} «${term}»` : t("لا توجد نتائج بهذا الفلتر.")}
                hint={t("جرّب جزءاً من الاسم، أو آخر أرقام الهاتف، أو أزل الفلاتر.")}
              />
            ) : (
              <EmptyState bare icon={Search} title={t("لا توجد نتائج مطابقة لبحثك ضمن هذه الصفحة.")} />
            )
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line bg-heading/[0.025]">
                      {columns.map((column) => {
                        const phoneCol = column.id === "phone" || /phone|mobile/i.test(column.id);
                        return (
                          <th
                            key={column.id}
                            scope="col"
                            className={`h-10 whitespace-nowrap px-4 text-xs font-semibold text-muted ${phoneCol ? "text-center" : "text-start"}`}
                          >
                            {column.label}
                          </th>
                        );
                      })}
                      <th className="h-10 px-4" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {visible.map((row, index) => {
                      const href = rowHref?.(row);
                      const open = onPick ? () => onPick(row) : href ? () => router.push(href) : undefined;
                      return (
                        <tr
                          key={String(row.id ?? index)}
                          className={`transition-colors hover:bg-brand/[0.04] ${open ? "cursor-pointer" : ""}`}
                          onClick={open}
                        >
                          {columns.map((column) => {
                            const text = column.read(row);
                            const raw = column.raw?.(row) ?? "";
                            const phoneCol = column.id === "phone" || /phone|mobile/i.test(column.id);
                            const cell = text ? (search ? <Highlight text={text} term={term} /> : text) : "—";
                            return (
                              <td
                                key={column.id}
                                className={`px-4 py-3 align-middle ${phoneCol ? "text-center" : ""}`}
                                dir={phoneCol ? "ltr" : undefined}
                              >
                                {column.kind === "title" ? (
                                  <div>
                                    <p className="font-semibold text-heading">{cell}</p>
                                    {typeof row.code === "string" && text !== row.code ? (
                                      <p className="mt-0.5 text-xs text-muted">{row.code}</p>
                                    ) : null}
                                  </div>
                                ) : column.kind === "badge" && raw ? (
                                  <StatusBadge value={raw} label={text} />
                                ) : phoneCol ? (
                                  <bdi className="desk-ltr-num phone-ltr text-body tabular-nums" dir="ltr" data-phone="">
                                    {cell}
                                  </bdi>
                                ) : (
                                  <span className="text-body">{cell}</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-end" onClick={(event) => event.stopPropagation()}>
                            <div className="flex items-center justify-end gap-2">
                              {rowActions?.(row)}
                              {href ? (
                                <Link
                                  className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold text-accent transition-colors hover:bg-brand/10"
                                  href={href}
                                >
                                  {t("فتح")}
                                  <Icon node={ChevronLeft} size={14} className="ltr:rotate-180" />
                                </Link>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
                <span className="text-xs text-muted">{pageWindow(visible.length, rows.length)}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    className={btnGhostSm}
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setQuery((current) => ({ ...current, page: String(page - 1) }))}
                  >
                    <Icon node={ChevronLeft} size={14} className="rtl:rotate-180" />
                    {t("السابق")}
                  </button>
                  <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-brand/12 px-2 text-xs font-semibold tabular-nums text-heading">{page}</span>
                  <button
                    className={btnGhostSm}
                    type="button"
                    disabled={rows.length < 20}
                    onClick={() => setQuery((current) => ({ ...current, page: String(page + 1) }))}
                  >
                    {t("التالي")}
                    <Icon node={ChevronLeft} size={14} className="ltr:rotate-180" />
                  </button>
                </div>
              </div>
            </>
          )}
        </StateView>
      </Panel>
    </div>
  );
}

const HERO_KEYS = new Set([
  "customer",
  "driver",
  "branch",
  "ride_category",
  "category",
  "ride",
  "vehicle",
  "active_vehicle",
  "phone",
  "email",
  "final_fare",
  "estimated_fare",
  "gross_final_fare",
  "customer_payable",
  "payment_status",
  "fare_stack_decision",
  "amount",
  "approved_amount",
  "balance",
  "created_at",
  "started_at",
  "public_number",
  "code",
  "plate_number",
  "case_number",
]);

function FactTiles({ facts }: { facts: ReturnType<typeof factsOf> }) {
  if (facts.length === 0) return null;
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {facts.map((fact) => {
        const phone = isPhoneField(fact.key) || looksLikePhone(fact.value);
        return (
          <div key={fact.key} className="min-w-0 rounded-lg border border-line bg-heading/[0.02] px-3.5 py-3">
            <dt className="text-[11px] font-medium text-muted">{fact.label}</dt>
            <dd
              className={`mt-1 break-words text-sm font-semibold text-heading ${phone ? "desk-ltr-num tabular-nums" : ""}`}
              dir={phone ? "ltr" : undefined}
            >
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

export function DetailScreen({
  title,
  path,
  children,
  facts = "all",
  omitPhones = false,
  omitFactKeys,
}: {
  title: string;
  path: string;
  children?: (data: Record<string, unknown>) => ReactNode;
  facts?: "all" | "none";
  omitPhones?: boolean;
  /** Keys already shown in custom detail cards — hide from «بيانات السجل». */
  omitFactKeys?: Iterable<string>;
}) {
  const pathname = usePathname();
  const parent = navMatch(pathname);
  const record = useGoRecord(path);
  const data = record.data ?? {};
  const details = factsOf(data, { omitPhones, omitKeys: omitFactKeys });
  const status = typeof data.status === "string" ? data.status : "";
  const type = typeof data.type === "string" ? data.type : "";
  const priority = typeof data.priority === "string" ? data.priority : "";
  const code =
    typeof data.case_number === "string"
      ? data.case_number
      : typeof data.public_number === "string"
        ? data.public_number
        : typeof data.code === "string"
          ? data.code
          : "";
  const when = formatScalar("created_at", data.updated_at ?? data.created_at);
  const icon = parent ? NAV_ICONS[parent.href] : null;
  const backHref = parent && pathname !== parent.href ? parent.href : null;
  const extra = details.filter((fact) => !HERO_KEYS.has(fact.key) && fact.key !== "status" && fact.key !== "type" && fact.key !== "priority");
  const hero = details.filter((fact) => HERO_KEYS.has(fact.key)).slice(0, 8);
  const body = record.isLoading || record.error ? null : children?.(data);

  return (
    <div className="grid gap-5">
      <header className="grid gap-3">
        {backHref ? (
          <Link href={backHref} className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-accent transition-colors hover:text-brand-strong">
            <Icon node={ChevronLeft} size={15} className="rtl:rotate-180" />
            {t("العودة إلى القائمة")}
          </Link>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {icon ? (
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand/12 text-accent ring-1 ring-inset ring-brand/25">
                <Icon node={icon} size={20} />
              </span>
            ) : null}
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted">{title}</p>
              <h1 className="mt-0.5 break-words text-[22px] font-semibold leading-8 tracking-tight text-heading">
                {record.isLoading ? title : headline(data) || title}
              </h1>
              {!record.isLoading && (code || when) ? (
                <p className="mt-1 text-xs text-muted">{[code, when].filter(Boolean).join(" · ")}</p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {status ? <StatusBadge value={status} label={enumLabel(status)} /> : null}
            {type ? <StatusBadge value={type} label={enumLabel(type)} /> : null}
            {priority ? <StatusBadge value={priority} label={enumLabel(priority)} /> : null}
          </div>
        </div>
      </header>
      <StateView loading={record.isLoading} error={record.error}>
        {facts === "all" && hero.length > 0 ? (
          <Panel>
            <FactTiles facts={hero} />
          </Panel>
        ) : null}
        {body || (facts === "all" && extra.length > 0) ? (
          <div className={body && facts === "all" && extra.length > 0 ? "grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20.5rem]" : "grid gap-5"}>
            {body ? <div className="grid gap-5">{body}</div> : null}
            {facts === "all" && extra.length > 0 ? (
              <FormCard title={t("بيانات السجل")}>
                <FactTiles facts={extra} />
              </FormCard>
            ) : null}
          </div>
        ) : null}
      </StateView>
    </div>
  );
}

export function RecordList({
  title,
  rows,
  href,
}: {
  title: string;
  rows: Record<string, unknown>[];
  href: (row: Record<string, unknown>) => string | null;
}) {
  if (rows.length === 0) return null;
  return (
    <FormCard title={title} action={<Count value={rows.length} />}>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
        {rows.map((row) => {
          const link = href(row);
          return (
            <li key={String(row.id ?? headline(row))} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3 text-sm transition-colors hover:bg-heading/[0.03]">
              <span className="min-w-0 font-semibold text-heading">{headline(row)}</span>
              <span className="flex items-center gap-2">
                {typeof row.status === "string" ? <StatusBadge value={row.status} label={enumLabel(row.status)} /> : null}
                {link ? (
                  <Link className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold text-accent transition-colors hover:bg-brand/10" href={link}>
                    {t("فتح")}
                    <Icon node={ChevronLeft} size={14} className="ltr:rotate-180" />
                  </Link>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </FormCard>
  );
}

export function NamedSelect({
  path,
  name,
  label,
  required = false,
  placeholder = t("اختر"),
  defaultValue = "",
  activeOnly = false,
  searchable = false,
  searchPlaceholder = t("ابحث"),
  /** API caps page size at 100. */
  limit = 100,
}: {
  path: string;
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  /** Hide rows with is_active === false (e.g. retired ride categories). */
  activeOnly?: boolean;
  /** Open a filterable menu (useful for long lists like drivers). */
  searchable?: boolean;
  searchPlaceholder?: string;
  limit?: number;
}) {
  const pageSize = Math.min(100, Math.max(1, limit));
  const remoteSearch = searchable && REMOTE_SEARCH_PATHS.has(path);
  const [remoteQuery, setRemoteQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    if (!remoteSearch) return;
    const timer = window.setTimeout(() => setDebouncedQuery(remoteQuery.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [remoteQuery, remoteSearch]);
  const list = useGoList(path, remoteSearch && debouncedQuery ? { limit: pageSize, q: debouncedQuery } : { limit: pageSize }, true, remoteSearch);
  const rows = (list.data ?? []).filter((row) => {
    if (!activeOnly) return true;
    if (row.is_active !== true) return false;
    if (typeof row.code === "string" && row.code === "COMFORT") return false;
    return true;
  });
  const options = rows.map((row) => {
    const optionLabel = headline(row);
    const phone =
      (isRecord(row.user) && typeof row.user.phone === "string" && row.user.phone.trim()) ||
      (typeof row.phone === "string" && row.phone.trim()) ||
      "";
    return {
      value: String(row.id),
      searchText: phone ? `${optionLabel} ${phone}` : optionLabel,
      label: searchable && phone ? (
        <span className="inline-flex max-w-full items-center gap-1.5 truncate">
          <span className="truncate">{optionLabel}</span>
          <span className="shrink-0 text-muted">·</span>
          <PhoneText className="shrink-0 text-muted">{phone}</PhoneText>
        </span>
      ) : (
        optionLabel
      ),
    };
  });
  const loading = list.isLoading ? t("جارٍ التحميل…") : placeholder;
  return (
    <label className="grid content-start gap-1.5 text-sm">
      <span className={labelClass}>{label}</span>
      {searchable ? (
        <SearchSelect
          name={name}
          required={required}
          defaultValue={defaultValue}
          placeholder={loading}
          searchPlaceholder={searchPlaceholder}
          emptyLabel={required ? undefined : placeholder}
          options={options}
          filterLocally={!remoteSearch}
          onQueryChange={remoteSearch ? setRemoteQuery : undefined}
          loading={list.isFetching && remoteSearch}
        />
      ) : (
        <ChoiceSelect
          name={name}
          required={required}
          defaultValue={defaultValue}
          placeholder={loading}
          emptyLabel={required ? undefined : placeholder}
          options={options}
        />
      )}
    </label>
  );
}
