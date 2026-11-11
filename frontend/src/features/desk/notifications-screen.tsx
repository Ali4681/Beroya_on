"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { useConfirm } from "@/features/desk/confirm";
import { CheckField, DateField, TimeField } from "@/features/desk/controls";
import { go } from "@/features/desk/go-api";
import { goFailureMessage, isGoFailure, useGo, useGoList, useGoRecord } from "@/features/desk/hooks";
import { t } from "@/features/desk/i18n/t";
import { enumLabel, formatScalar } from "@/features/desk/present";
import {
  btnDark,
  btnGhost,
  btnGhostSm,
  DeskForm,
  Field,
  inputClass,
  Notice,
  PageTitle,
  Panel,
  PanelHeader,
  StatusBadge,
  StateView,
} from "@/features/desk/ui";

const AUDIENCES = [
  { value: "ALL", label: "الكل", hint: "السائقون والعملاء والموظفون المتصلون." },
  { value: "DRIVERS", label: "السائقون", hint: "حسابات السائقين فقط." },
  { value: "CUSTOMERS", label: "العملاء", hint: "حسابات العملاء فقط." },
  { value: "STAFF", label: "الموظفون", hint: "لوحة التشغيل فقط." },
] as const;

type Audience = (typeof AUDIENCES)[number]["value"];

const CUSTOMER_FILTERS = [
  {
    value: "CUSTOMER_BIRTHDAY_TODAY",
    label: "عيد ميلاد اليوم",
    hint: "العملاء المسجّل ميلادهم اليوم في التطبيق.",
    needsLimit: false,
  },
  {
    value: "CUSTOMER_TOP_ORDERS",
    label: "أكثر الطلبات",
    hint: "أكثر العملاء إكمالاً للرحلات.",
    needsLimit: true,
  },
  {
    value: "CUSTOMER_BOTTOM_ORDERS",
    label: "أقل الطلبات",
    hint: "أقل العملاء إكمالاً للرحلات.",
    needsLimit: true,
  },
  {
    value: "CUSTOMER_TOP_POINTS",
    label: "أكثر النقاط",
    hint: "أعلى رصيد نقاط جواز السفر.",
    needsLimit: true,
  },
] as const;

const DRIVER_FILTERS = [
  {
    value: "DRIVER_TOP_RATING",
    label: "أفضل تقييم",
    hint: "أعلى متوسط تقييم من العملاء.",
    needsLimit: true,
  },
  {
    value: "DRIVER_BIRTHDAY_TODAY",
    label: "عيد ميلاد اليوم",
    hint: "السائقون المسجّل ميلادهم اليوم.",
    needsLimit: false,
  },
] as const;

type FilterValue =
  | (typeof CUSTOMER_FILTERS)[number]["value"]
  | (typeof DRIVER_FILTERS)[number]["value"]
  | "";

type PreviewPerson = {
  user_id?: string;
  full_name?: string | null;
  phone?: string | null;
  metric?: number | null;
  metric_label?: string;
};

type PreviewResponse = {
  filter?: string;
  limit?: number | null;
  total?: number;
  items?: PreviewPerson[];
};

type BirthdayCopy = { title?: string; body?: string };

type TemplatesResponse = {
  customer_birthday?: BirthdayCopy;
  driver_birthday?: BirthdayCopy;
};

const BIRTHDAY_FILTERS = new Set(["CUSTOMER_BIRTHDAY_TODAY", "DRIVER_BIRTHDAY_TODAY"]);

function audienceLabel(value: unknown) {
  const found = AUDIENCES.find((item) => item.value === value);
  return found ? t(found.label) : typeof value === "string" ? value : "—";
}

function filterLabel(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const found = [...CUSTOMER_FILTERS, ...DRIVER_FILTERS].find((item) => item.value === value);
  return found ? t(found.label) : value;
}

function whenLabel(value: string | null) {
  return value ? formatScalar("created_at", value) || value : "—";
}

function actorLabel(row: Record<string, unknown>) {
  const created = row.created_by;
  if (created && typeof created === "object" && !Array.isArray(created)) {
    const person = created as Record<string, unknown>;
    if (typeof person.full_name === "string" && person.full_name.trim()) return person.full_name;
    if (typeof person.email === "string" && person.email.trim()) return person.email;
  }
  return "—";
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function splitDateTime(value: string) {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return {
    date: match?.[1] ?? "",
    time: match?.[2] ?? "12:00",
  };
}

function joinDateTime(date: string, time: string) {
  const day = date.slice(0, 10);
  const clock = time.slice(0, 5);
  if (!day || !clock) return "";
  return `${day}T${clock}`;
}

function defaultScheduleParts() {
  const next = new Date(Date.now() + 60 * 60 * 1000);
  return {
    date: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`,
    time: `${pad(next.getHours())}:${pad(next.getMinutes())}`,
  };
}

function metricText(person: PreviewPerson) {
  if (person.metric == null) return null;
  if (person.metric_label === "completed_rides") return `${person.metric} ${t("رحلة")}`;
  if (person.metric_label === "points") return `${person.metric} ${t("نقطة")}`;
  if (person.metric_label === "rating_avg") return `${person.metric} ★`;
  return String(person.metric);
}

function personName(person: PreviewPerson) {
  if (typeof person.full_name === "string" && person.full_name.trim()) return person.full_name;
  if (typeof person.phone === "string" && person.phone.trim()) return person.phone;
  return "—";
}

export function NotificationsScreen() {
  const call = useGo();
  const confirm = useConfirm();
  const history = useGoList("/admin/notifications", { limit: 50 }, false, true);
  const birthdays = useGoRecord("/admin/notifications/birthdays-today");
  const templates = useGoRecord("/admin/notifications/templates");
  const [audience, setAudience] = useState<Audience>("CUSTOMERS");
  const [filter, setFilter] = useState<FilterValue>("");
  const [limit, setLimit] = useState(10);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scheduleLater, setScheduleLater] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(() => defaultScheduleParts().date);
  const [scheduleTime, setScheduleTime] = useState(() => defaultScheduleParts().time);
  const scheduledAt = useMemo(() => joinDateTime(scheduleDate, scheduleTime), [scheduleDate, scheduleTime]);
  const [fault, setFault] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const chosen = AUDIENCES.find((item) => item.value === audience) ?? AUDIENCES[0];

  const filtersForAudience =
    audience === "CUSTOMERS" ? CUSTOMER_FILTERS : audience === "DRIVERS" ? DRIVER_FILTERS : [];
  const activeFilterMeta = filtersForAudience.find((item) => item.value === filter);
  const needsLimit = activeFilterMeta?.needsLimit === true;
  const isBirthdayFilter = BIRTHDAY_FILTERS.has(filter);

  function applyBirthdayTemplate(nextFilter: FilterValue, data?: TemplatesResponse | null) {
    const source = data ?? (templates.data as TemplatesResponse | undefined);
    const copy =
      nextFilter === "CUSTOMER_BIRTHDAY_TODAY"
        ? source?.customer_birthday
        : nextFilter === "DRIVER_BIRTHDAY_TODAY"
          ? source?.driver_birthday
          : null;
    if (!copy) return;
    if (typeof copy.title === "string") setTitle(copy.title);
    if (typeof copy.body === "string") setBody(copy.body);
  }

  function selectFilter(next: FilterValue) {
    const leavingBirthday = BIRTHDAY_FILTERS.has(filter) && !BIRTHDAY_FILTERS.has(next);
    setFilter(next);
    if (BIRTHDAY_FILTERS.has(next)) {
      applyBirthdayTemplate(next);
      return;
    }
    if (leavingBirthday) {
      setTitle("");
      setBody("");
    }
  }

  useEffect(() => {
    if (audience !== "CUSTOMERS" && audience !== "DRIVERS") {
      if (BIRTHDAY_FILTERS.has(filter)) {
        setTitle("");
        setBody("");
      }
      setFilter("");
      return;
    }
    const allowed: FilterValue[] =
      audience === "CUSTOMERS"
        ? CUSTOMER_FILTERS.map((item) => item.value)
        : DRIVER_FILTERS.map((item) => item.value);
    if (filter && !allowed.includes(filter)) {
      if (BIRTHDAY_FILTERS.has(filter)) {
        setTitle("");
        setBody("");
      }
      setFilter("");
    }
  }, [audience, filter]);

  useEffect(() => {
    if (!BIRTHDAY_FILTERS.has(filter) || !templates.data) return;
    if (title.trim() || body.trim()) return;
    applyBirthdayTemplate(filter);
    // Fill once when templates arrive and fields are still empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, templates.data]);

  const preview = useQuery({
    queryKey: ["go", "/admin/notifications/audience-preview", filter, needsLimit ? limit : null],
    enabled: Boolean(filter),
    queryFn: () =>
      go<PreviewResponse>("/admin/notifications/audience-preview", {
        query: {
          filter,
          ...(needsLimit ? { limit } : {}),
        },
      }),
  });

  async function cancelBroadcast(id: string, title: string) {
    await confirm({
      title: t("إلغاء الإشعار المجدول"),
      body: title,
      confirm: t("إلغاء الجدولة"),
      perform: async () => {
        const saved = await call(`/admin/notifications/${id}`, { method: "DELETE" });
        if (isGoFailure(saved)) throw new Error(goFailureMessage(saved));
      },
    });
  }

  const previewItems = preview.data?.items ?? [];
  const birthdayCustomers =
    birthdays.data && Array.isArray(birthdays.data.customers) ? (birthdays.data.customers as PreviewPerson[]) : [];
  const birthdayDrivers =
    birthdays.data && Array.isArray(birthdays.data.drivers) ? (birthdays.data.drivers as PreviewPerson[]) : [];
  const birthdayTotal = birthdayCustomers.length + birthdayDrivers.length;

  return (
    <div className="grid gap-4">
      <PageTitle
        title={t("الإشعارات")}
        hint={t("أرسل الآن أو لاحقاً، وتابع سجل البث والحالات من هنا.")}
      />

      {birthdayTotal > 0 ? (
        <Panel className="grid gap-3 border-teal/40 bg-brand/5">
          <PanelHeader
            title={t("أعياد الميلاد اليوم")}
            hint={t("عملاء وسائقون ميلادهم اليوم حسب المسجّل في التطبيق.")}
          />
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
            <BirthdayGroup
              title={t("العملاء")}
              people={birthdayCustomers}
              onUse={() => {
                setAudience("CUSTOMERS");
                selectFilter("CUSTOMER_BIRTHDAY_TODAY");
              }}
            />
            <BirthdayGroup
              title={t("السائقون")}
              people={birthdayDrivers}
              onUse={() => {
                setAudience("DRIVERS");
                selectFilter("DRIVER_BIRTHDAY_TODAY");
              }}
            />
          </div>
        </Panel>
      ) : null}

      <Panel className="grid gap-4">
        <DeskForm
          className="grid gap-4"
          noValidate
          action={async () => {
            setFault(null);
            setMessage(null);
            const nextTitle = title.trim();
            const nextBody = body.trim();
            if (nextTitle.length < 2 || nextBody.length < 2) {
              setFault(t("اكتب عنواناً ونصاً للإشعار."));
              return;
            }
            if (filter && needsLimit && (limit < 1 || limit > 100)) {
              setFault(t("حدد عدداً بين 1 و 100."));
              return;
            }
            if (filter && preview.isError) {
              setFault(t("تعذّر تحميل قائمة المستلمين."));
              return;
            }
            if (filter && previewItems.length === 0) {
              setFault(t("لا يوجد مستلمون لهذا الفلتر حالياً."));
              return;
            }

            const payload: Record<string, unknown> = { audience, title: nextTitle, body: nextBody };
            if (filter) {
              payload.filter = filter;
              if (needsLimit) payload.limit = limit;
            }

            const filterHint = filter
              ? `${filterLabel(filter)}${needsLimit ? ` · ${limit}` : ""} · ${previewItems.length} ${t("مستلم")}`
              : t(chosen.label);

            if (scheduleLater) {
              if (!scheduledAt) {
                setFault(t("اختر التاريخ والوقت."));
                return;
              }
              const when = new Date(scheduledAt);
              if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 5_000) {
                setFault(t("اختر وقتاً لاحقاً بخمس ثوانٍ على الأقل."));
                return;
              }
              const ok = await confirm({
                title: t("جدولة الإشعار"),
                body: `${filterHint}. ${nextTitle}`,
                confirm: t("جدولة"),
                perform: async () => {
                  const saved = await call("/admin/notifications/schedule", {
                    method: "POST",
                    idempotent: true,
                    body: { ...payload, scheduled_at: when.toISOString() },
                  });
                  if (isGoFailure(saved)) {
                    setFault(goFailureMessage(saved));
                    return;
                  }
                  setMessage(t("تمت جدولة الإشعار."));
                },
              });
              if (!ok) return;
              return;
            }

            const ok = await confirm({
              title: t("إرسال الإشعار"),
              body: `${filterHint}. ${nextTitle}`,
              confirm: t("إرسال"),
              perform: async () => {
                const saved = await call<{ devices?: number; recipients?: number | null }>("/admin/notifications", {
                  method: "POST",
                  idempotent: true,
                  body: payload,
                });
                if (isGoFailure(saved)) {
                  setFault(goFailureMessage(saved));
                  return;
                }
                const devices = typeof saved.devices === "number" ? saved.devices : 0;
                const recipients = typeof saved.recipients === "number" ? saved.recipients : null;
                setMessage(
                  recipients != null
                    ? `${t("أُرسل الإشعار.")} ${t("المستلمون")}: ${recipients} · ${t("الأجهزة المسجّلة")}: ${devices}`
                    : `${t("أُرسل الإشعار.")} ${t("الأجهزة المسجّلة")}: ${devices}`,
                );
              },
            });
            if (!ok) return;
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {AUDIENCES.map((item) => {
              const active = audience === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  className={`grid gap-0.5 rounded-xl border px-3 py-3 text-start transition-colors ${active ? "border-teal bg-brand/10 shadow-glow" : "border-line bg-surface hover:border-teal/40"}`}
                  onClick={() => setAudience(item.value)}
                >
                  <span className="text-sm font-semibold text-heading">{t(item.label)}</span>
                  <span className="text-xs leading-5 text-muted">{t(item.hint)}</span>
                </button>
              );
            })}
          </div>

          {filtersForAudience.length > 0 ? (
            <div className="grid gap-3">
              <p className="text-sm font-medium text-heading">{t("فلتر الجمهور")}</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <button
                  type="button"
                  className={`rounded-xl border px-3 py-3 text-start text-sm transition-colors ${!filter ? "border-teal bg-brand/10" : "border-line bg-surface hover:border-teal/40"}`}
                  onClick={() => selectFilter("")}
                >
                  <span className="font-semibold text-heading">{t("بدون فلتر")}</span>
                  <span className="mt-0.5 block text-xs text-muted">{t("كل الحسابات في الجمهور المختار.")}</span>
                </button>
                {filtersForAudience.map((item) => {
                  const active = filter === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      className={`rounded-xl border px-3 py-3 text-start text-sm transition-colors ${active ? "border-teal bg-brand/10" : "border-line bg-surface hover:border-teal/40"}`}
                      onClick={() => selectFilter(item.value)}
                    >
                      <span className="font-semibold text-heading">{t(item.label)}</span>
                      <span className="mt-0.5 block text-xs text-muted">{t(item.hint)}</span>
                    </button>
                  );
                })}
              </div>
              {filter ? (
                <div className={`grid gap-3 ${needsLimit ? "sm:grid-cols-[160px_1fr]" : ""}`}>
                  {needsLimit ? (
                    <Field label={t("عدد الأشخاص")}>
                      <input
                        className={inputClass}
                        type="number"
                        min={1}
                        max={100}
                        value={limit}
                        onChange={(event) => setLimit(Math.max(1, Math.min(100, Number(event.target.value) || 1)))}
                      />
                    </Field>
                  ) : null}
                  <div className="rounded-xl border border-line bg-surface/70 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-heading">{t("المستلمون")}</p>
                      <span className="text-xs text-muted">
                        {preview.isLoading
                          ? t("جارٍ التحميل…")
                          : `${previewItems.length} ${t("شخص")}`}
                      </span>
                    </div>
                    {preview.isError ? <Notice>{t("تعذّر تحميل قائمة المستلمين.")}</Notice> : null}
                    {!preview.isLoading && !preview.isError && previewItems.length === 0 ? (
                      <p className="text-sm text-muted">{t("لا يوجد مستلمون لهذا الفلتر حالياً.")}</p>
                    ) : null}
                    {previewItems.length > 0 ? (
                      <ul className="grid max-h-48 gap-1.5 overflow-y-auto text-sm">
                        {previewItems.map((person) => (
                          <li
                            key={String(person.user_id)}
                            className="flex items-center justify-between gap-2 rounded-lg bg-canvas/60 px-2.5 py-1.5"
                          >
                            <span className="font-medium text-heading">{personName(person)}</span>
                            <span className="shrink-0 text-xs text-muted" dir="ltr" data-phone="">
                              {metricText(person) ?? (typeof person.phone === "string" ? person.phone : "")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <Field label={t("العنوان")}>
            <input
              className={inputClass}
              name="title"
              maxLength={80}
              placeholder={t("عنوان الإشعار")}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label={t("النص")}>
            <textarea
              className={`${inputClass} !h-28 py-2.5`}
              name="body"
              maxLength={280}
              placeholder={t("نص الإشعار")}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </Field>
          {isBirthdayFilter ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface/60 px-3 py-2.5">
              <p className="text-xs leading-5 text-muted">
                {t("استخدم {name} في النص ليظهر اسم المستلم تلقائياً. إن لم تضعه، يُضاف الاسم في بداية الرسالة عند الإرسال. يمكنك حفظ الرسالة كافتراضية.")}
              </p>
              <button
                type="button"
                className={btnGhost}
                onClick={async () => {
                  setFault(null);
                  setMessage(null);
                  const nextTitle = title.trim();
                  const nextBody = body.trim();
                  if (nextTitle.length < 2 || nextBody.length < 2) {
                    setFault(t("اكتب عنواناً ونصاً للإشعار."));
                    return;
                  }
                  const payload =
                    filter === "CUSTOMER_BIRTHDAY_TODAY"
                      ? { customer_birthday_title: nextTitle, customer_birthday_body: nextBody }
                      : { driver_birthday_title: nextTitle, driver_birthday_body: nextBody };
                  const saved = await call("/admin/notifications/templates", {
                    method: "PATCH",
                    idempotent: true,
                    body: payload,
                  });
                  if (isGoFailure(saved)) {
                    setFault(goFailureMessage(saved));
                    return;
                  }
                  setMessage(t("تم حفظ رسالة عيد الميلاد الافتراضية."));
                }}
              >
                {t("حفظ كرسالة افتراضية")}
              </button>
            </div>
          ) : null}
          <CheckField
            label={t("إرسال لاحقاً")}
            hint={t("جدولة الإشعار لوقت محدد بدل الإرسال الفوري.")}
            checked={scheduleLater}
            onCheckedChange={setScheduleLater}
          />
          {scheduleLater ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <DateField
                label={t("التاريخ")}
                value={scheduleDate}
                onValueChange={(next) => setScheduleDate(splitDateTime(next).date || next.slice(0, 10))}
              />
              <Field label={t("الوقت")}>
                <TimeField
                  value={scheduleTime}
                  onValueChange={setScheduleTime}
                  presets={["09:00", "12:00", "17:00", "21:00"]}
                />
              </Field>
            </div>
          ) : null}
          {fault ? <Notice>{fault}</Notice> : null}
          {message ? <p className="text-sm text-success">{message}</p> : null}
          <div className="flex justify-end">
            <button className={btnDark} type="submit">
              {scheduleLater ? t("جدولة الإشعار") : t("إرسال الإشعار")}
            </button>
          </div>
        </DeskForm>
      </Panel>

      <Panel flush>
        <PanelHeader title={t("سجل البث")} hint={t("كل إشعار فوري أو مجدول يظهر هنا.")} />
        <div className="p-5">
          <StateView
            loading={history.isLoading}
            error={history.error}
            empty={!history.isLoading && !history.error && (history.data?.length ?? 0) === 0}
            bare
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-start text-xs text-muted">
                    <th className="px-2 py-2 font-medium">{t("الوقت")}</th>
                    <th className="px-2 py-2 font-medium">{t("الجمهور")}</th>
                    <th className="px-2 py-2 font-medium">{t("العنوان")}</th>
                    <th className="px-2 py-2 font-medium">{t("الحالة")}</th>
                    <th className="px-2 py-2 font-medium">{t("الأجهزة")}</th>
                    <th className="px-2 py-2 font-medium">{t("المرسل")}</th>
                    <th className="px-2 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {(history.data ?? []).map((row) => {
                    const id = String(row.id ?? "");
                    const status = typeof row.status === "string" ? row.status : "";
                    const title = typeof row.title === "string" ? row.title : "—";
                    const when =
                      status === "SCHEDULED" && typeof row.scheduled_at === "string"
                        ? row.scheduled_at
                        : typeof row.sent_at === "string"
                          ? row.sent_at
                          : typeof row.created_at === "string"
                            ? row.created_at
                            : null;
                    const segment = filterLabel(row.filter);
                    return (
                      <tr key={id} className="border-b border-line/70 align-top">
                        <td className="px-2 py-3 text-muted">{whenLabel(when)}</td>
                        <td className="px-2 py-3">
                          <div>{audienceLabel(row.audience)}</div>
                          {segment ? (
                            <div className="mt-0.5 text-xs text-muted">
                              {segment}
                              {typeof row.audience_limit === "number" ? ` · ${row.audience_limit}` : ""}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-2 py-3">
                          <div className="font-medium text-heading">{title}</div>
                          {typeof row.body === "string" ? (
                            <div className="mt-0.5 line-clamp-2 text-xs text-muted">{row.body}</div>
                          ) : null}
                        </td>
                        <td className="px-2 py-3">
                          {status ? <StatusBadge value={status} label={enumLabel(status)} /> : "—"}
                        </td>
                        <td className="px-2 py-3 text-muted">
                          {typeof row.devices_queued === "number" ? row.devices_queued : "—"}
                        </td>
                        <td className="px-2 py-3 text-muted">{actorLabel(row)}</td>
                        <td className="px-2 py-3 text-end">
                          {status === "SCHEDULED" && id ? (
                            <button
                              type="button"
                              className={btnGhostSm}
                              onClick={() => void cancelBroadcast(id, title)}
                            >
                              {t("إلغاء")}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </StateView>
        </div>
      </Panel>
    </div>
  );
}

function BirthdayGroup({
  title,
  people,
  onUse,
}: {
  title: string;
  people: PreviewPerson[];
  onUse: () => void;
}) {
  if (people.length === 0) {
    return (
      <div className="rounded-xl border border-line/80 bg-surface/50 p-3">
        <p className="text-sm font-medium text-heading">{title}</p>
        <p className="mt-1 text-xs text-muted">{t("لا أحد اليوم")}</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-line/80 bg-surface/80 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-heading">
          {title} · {people.length}
        </p>
        <button type="button" className={btnGhostSm} onClick={onUse}>
          {t("استخدام الفلتر")}
        </button>
      </div>
      <ul className="grid gap-1 text-sm text-body">
        {people.slice(0, 8).map((person) => (
          <li key={String(person.user_id)}>{personName(person)}</li>
        ))}
        {people.length > 8 ? (
          <li className="text-xs text-muted">+{people.length - 8} {t("آخر")}</li>
        ) : null}
      </ul>
    </div>
  );
}
