"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { io, type Socket } from "socket.io-client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

import type { Locale } from "@/core/i18n/config";
import { ConfirmProvider } from "@/features/desk/confirm";
import { applyDeskLocale, bindDeskLocale, t } from "@/features/desk/i18n/t";
import { refreshStaffSession } from "@/features/desk/go-api";
import { readSession, type StaffSession } from "@/features/desk/session";

type Toast = { id: number; text: string; detail?: string; href?: string };

export type DeskNotice = { id: number; text: string; detail?: string; href?: string; at: number; read: boolean };

type DeskContextValue = {
  session: StaffSession | null;
  setSession: (session: StaffSession | null) => void;
  connected: boolean;
  link: LinkState;
  toasts: Toast[];
  notices: DeskNotice[];
  unreadNotices: number;
  markNoticesRead: () => void;
  removeNotice: (id: number) => void;
  clearNotices: () => void;
  pushToast: (text: string, href?: string, detail?: string) => void;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  ready: boolean;
  branchId: string | null;
  setBranchId: (branchId: string | null) => void;
  branchLocked: boolean;
};

const DeskContext = createContext<DeskContextValue | null>(null);

const QUIET_EVENTS = new Set(["connected", "system.ping", "radar.updated"]);
/**
 * Desk-only silence (toast + bell + browser Notification). Apps unchanged.
 * Only the events the ops team asked to hide.
 */
const QUIET_NOTICE_EVENTS = new Set([
  "ride.created",
  "ride.driver_assigned",
  "ride.assigned",
  "ride.driver_arrived",
  "location_stale.created",
]);
const QUIET_ALERT_TYPES = new Set(["LOCATION_STALE"]);
const BRANCH_KEY = "beroya-go.desk.branch";
const NOTICES_KEY = "beroya-go.desk.notices";
/** Command Center queries refetch at most this often from socket traffic. */
const LIVE_REFRESH_MS = 10_000;

/** True → skip toast + inbox + device banner (desk UI only). */
function skipDeskNotice(event: string, payload: unknown) {
  if (QUIET_NOTICE_EVENTS.has(event)) return true;
  if (event === "alert.created" && payload && typeof payload === "object") {
    const type = (payload as Record<string, unknown>).type;
    return typeof type === "string" && QUIET_ALERT_TYPES.has(type);
  }
  return false;
}

function noticesStorageKey(userId: string) {
  return `${NOTICES_KEY}.${userId}`;
}

/** Recover a detail link from notice text (for older items saved without href). */
function hrefFromNoticeText(text: string, detail?: string) {
  const blob = `${text}\n${detail ?? ""}`;
  const publicNo = blob.match(/\bSEED-[A-Z0-9-]+\b/i)?.[0] ?? blob.match(/\bGO-\d{4,}\b/i)?.[0];
  if (publicNo) return `/erp/rides?q=${encodeURIComponent(publicNo)}`;
  if (/إسناد|عطل|متوقفة|تعطّل|تنبيه/.test(blob)) return "/erp/alerts";
  if (/شكوى/.test(blob)) return "/erp/complaints";
  if (/طوارئ/.test(blob)) return "/erp/emergencies";
  if (/حادث|قضية/.test(blob)) return "/erp/cases";
  return "/admin/notifications";
}

function withNoticeHref(notice: DeskNotice): DeskNotice {
  if (notice.href) return notice;
  return { ...notice, href: hrefFromNoticeText(notice.text, notice.detail) };
}

function readStoredNotices(userId: string): DeskNotice[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(noticesStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is DeskNotice => {
        if (!item || typeof item !== "object") return false;
        const row = item as Record<string, unknown>;
        return typeof row.id === "number" && typeof row.text === "string" && typeof row.at === "number";
      })
      .map(withNoticeHref);
  } catch {
    return [];
  }
}

function writeStoredNotices(userId: string, notices: DeskNotice[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(noticesStorageKey(userId), JSON.stringify(notices));
  } catch {
    /* Quota or private mode — keep in-memory only. */
  }
}

export type LinkState = "online" | "reconnecting" | "offline";

export function deskBranchLock(user: StaffSession["user"] | null | undefined) {
  if (!user) return null;
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return null;
  if ((user.role === "OPERATIONS" || user.role === "FINANCE") && !user.branch_id) return null;
  return user.branch_id;
}

const EVENT_LABELS: Record<string, string> = {
  "alert.created": "تنبيه جديد",
  "alert.claimed": "تم استلام تنبيه",
  "alert.resolved": "تم حل تنبيه",
  "replacement_needed.created": "بحاجة لإسناد سائق بديل",
  "long_stop.created": "توقف طويل",
  "location_stale.created": "موقع غير محدّث",
  "route_deviation.created": "انحراف عن المسار",
  "scheduled_driver.offline": "سائق مجدول غير متصل",
  "scheduled_driver.delay": "تأخر سائق مجدول",
  "complaint.created": "شكوى جديدة",
  "complaint.urgent": "شكوى عاجلة",
  "complaint.during_ride": "شكوى أثناء الرحلة",
  "complaint.updated": "تحديث شكوى",
  "emergency.created": "طوارئ جديدة",
  "emergency.started": "بدأت جلسة طوارئ",
  "emergency.claimed": "تم استلام الطوارئ",
  "emergency.closed": "أُغلقت حالة الطوارئ",
  "case.created": "حادث جديد",
  "accident_case.created": "حادث سير",
  "breakdown_case.created": "عطل مركبة",
  "case.updated": "تحديث قضية",
  "case.note_added": "ملاحظة على القضية",
  "case.closed": "أُغلقت قضية",
  "case.reopened": "أُعيد فتح قضية",
  "ride.created": "رحلة جديدة",
  "ride.searching": "البحث عن سائق",
  "ride.driver_assigned": "تم تعيين سائق",
  "ride.assigned": "أُسندت الرحلة للسائق",
  "ride.driver_en_route": "السائق في الطريق",
  "ride.en_route": "السائق في الطريق",
  "ride.driver_arrived": "وصل السائق",
  "ride.started": "بدأت الرحلة",
  "ride.completed": "اكتملت الرحلة",
  "ride.cancelled": "أُلغيت الرحلة",
  "ride.customer_cancelled": "ألغى العميل الرحلة",
  "ride.driver_cancelled": "ألغى السائق الرحلة",
  "ride.staff_cancelled": "ألغى الموظف الرحلة",
  "ride.failed_no_driver": "لم يُعثر على سائق",
  "ride.no_show": "لم يحضر العميل",
  "ride.route_updated": "تغيّر المسار",
  "ride.stop_updated": "تغيّرت المحطة",
  "ride.estimated_fare_updated": "تغيّرت الأجرة المتوقعة",
  "ride.interrupted": "توقفت الرحلة",
  "ride.breakdown_reported": "بلاغ تعطّل سيارة",
  "ride.replacement_created": "رحلة بديلة للعميل",
  "replacement_ride.created": "رحلة بديلة",
  "ride.compensation_applied": "طُبّق تعويض على الرحلة",
  "compensation.applied": "تم تطبيق تعويض",
  "ride_offer.created": "عرض رحلة جديد",
  "ride.offer": "عرض رحلة جديد",
  "ride_offer.expired": "انتهت صلاحية العرض",
  "ride_offer.taken": "أُخذ عرض الرحلة",
  "wallet.updated": "تحديث محفظة سائق",
  "wallet.low_balance": "رصيد سائق منخفض",
  "driver.forced_offline": "إيقاف سائق إجباري",
  "scheduled_ride.reminder": "تذكير برحلة مجدولة",
  "scheduled_ride.attention_required": "رحلة مجدولة تحتاج متابعة",
  "passport.updated": "تحديث جواز العميل",
  "discount_code.available": "كود خصم متاح",
  "notification.message": "رسالة من التشغيل",
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  LONG_STOP: "توقف طويل",
  LOCATION_STALE: "موقع غير محدّث",
  MAJOR_ROUTE_DEVIATION: "انحراف عن المسار",
  SCHEDULED_DRIVER_OFFLINE: "سائق الموعد غير متصل",
  SCHEDULED_DRIVER_DELAY: "تأخر سائق الموعد",
  URGENT_COMPLAINT: "شكوى عاجلة",
  EMERGENCY: "طوارئ",
  DRIVER_COVERAGE_LOW: "نقص تغطية السائقين",
  ASSIGNMENT_DELAYED: "تأخر إسناد سائق",
  RIDE_DELAYED: "رحلة متأخرة",
  CANCELLATION_RATE_HIGH: "ارتفاع نسبة الإلغاء",
  REPLACEMENT_NEEDED: "بحاجة لإسناد سائق بديل",
};

const BREAKDOWN_SUBTYPE_LABELS: Record<string, string> = {
  ENGINE: "عطل محرك",
  TIRE: "إطار مثقوب",
  FUEL: "نفاد وقود",
  ACCIDENT: "حادث",
  OTHER: "أخرى",
  BREAKDOWN: "عطل",
};

function deviceNotify(title: string, body: string, opts?: { force?: boolean }) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  // Quiet operational events stay toast-only while the tab is focused.
  // Admin broadcasts (notification.message) always raise a device banner.
  if (!opts?.force && typeof document !== "undefined" && !document.hidden) return;
  try {
    new Notification(title, { body: body || undefined });
  } catch {
    /* The in-app toast already showed the event. */
  }
}

const AUDIENCE_LABELS: Record<string, string> = {
  ALL: "الكل",
  DRIVERS: "السائقون",
  CUSTOMERS: "العملاء",
  STAFF: "الموظفون",
};

function eventParts(event: string, payload: unknown): { title: string; detail?: string; text: string } {
  if (event === "notification.message" && payload && typeof payload === "object") {
    const row = payload as { title?: unknown; body?: unknown; audience?: unknown; at?: unknown };
    const title = typeof row.title === "string" && row.title.trim() ? row.title.trim() : t("رسالة من التشغيل");
    const body = typeof row.body === "string" ? row.body.trim() : "";
    const audienceKey = typeof row.audience === "string" ? row.audience : "";
    const audience = audienceKey ? t(AUDIENCE_LABELS[audienceKey] ?? audienceKey) : "";
    const when =
      typeof row.at === "string" && row.at
        ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(row.at))
        : "";
    const meta = [audience, when].filter(Boolean).join(" · ");
    const detail = [body, meta].filter(Boolean).join("\n") || undefined;
    return { title, detail, text: [title, body].filter(Boolean).join(" — ") || title };
  }

  const row = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const meta = row && row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : null;
  const type = typeof row?.type === "string" ? row.type : typeof meta?.case_type === "string" ? meta.case_type : "";
  const subtype =
    typeof row?.subtype === "string"
      ? row.subtype
      : typeof meta?.subtype === "string"
        ? meta.subtype
        : "";
  const publicNumber =
    typeof row?.public_number === "string"
      ? row.public_number
      : typeof meta?.public_number === "string"
        ? meta.public_number
        : "";
  const note =
    typeof row?.note === "string"
      ? row.note
      : typeof meta?.note === "string"
        ? meta.note
        : "";
  const reasonLine = [
    subtype ? t(BREAKDOWN_SUBTYPE_LABELS[subtype] ?? subtype) : "",
    type && type !== subtype ? t(BREAKDOWN_SUBTYPE_LABELS[type] ?? ALERT_TYPE_LABELS[type] ?? type) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  if (
    event === "alert.created" ||
    event === "replacement_needed.created" ||
    event === "ride.breakdown_reported" ||
    event === "breakdown_case.created"
  ) {
    const alertType = typeof row?.type === "string" ? row.type : "";
    const isReplacement =
      event === "replacement_needed.created" ||
      alertType === "REPLACEMENT_NEEDED" ||
      event === "ride.breakdown_reported" ||
      event === "breakdown_case.created";
    const title = isReplacement
      ? t("بحاجة لإسناد سائق بديل")
      : t(ALERT_TYPE_LABELS[alertType] ?? EVENT_LABELS[event] ?? "تنبيه جديد");
    const detail = [
      isReplacement ? t("أسند سائقاً آخر لإكمال الرحلة.") : "",
      reasonLine ? `${t("السبب")}: ${reasonLine}` : "",
      publicNumber ? `${t("الرحلة")}: ${publicNumber}` : "",
      note ? `${t("ملاحظة")}: ${note}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return { title, detail: detail || undefined, text: detail ? `${title} — ${detail.replace(/\n/g, " · ")}` : title };
  }

  if (event === "long_stop.created" || event === "location_stale.created" || event === "route_deviation.created") {
    const title = t(EVENT_LABELS[event] ?? "تنبيه جديد");
    const detail = [
      publicNumber ? `${t("الرحلة")}: ${publicNumber}` : "",
      typeof row?.severity === "string" ? `${t("الخطورة")}: ${row.severity}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return { title, detail: detail || undefined, text: detail ? `${title} — ${detail}` : title };
  }

  const text = t(EVENT_LABELS[event] ?? "إشعار تشغيلي");
  return { title: text, text };
}

function pickId(row: Record<string, unknown>, meta: Record<string, unknown> | null, ...keys: string[]) {
  for (const key of keys) {
    const top = row[key];
    if (typeof top === "string" && top.trim()) return top.trim();
    const nested = meta?.[key];
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  return "";
}

/** Deep-link each notice to its detail screen (ride / case / complaint / …). */
function toastHref(event: string, payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return event === "notification.message" ? "/admin/notifications" : undefined;
  }
  const row = payload as Record<string, unknown>;
  const meta = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : null;

  if (event === "notification.message") {
    const title = typeof row.title === "string" ? row.title : "";
    const body = typeof row.body === "string" ? row.body : "";
    return hrefFromNoticeText(title, body);
  }

  const emergencyId = pickId(row, meta, "emergency_id");
  if (emergencyId) return `/erp/emergencies/${emergencyId}`;

  const complaintId = pickId(row, meta, "complaint_id");
  if (complaintId) return `/erp/complaints/${complaintId}`;

  const compensationId = pickId(row, meta, "compensation_id");
  if (compensationId) return `/erp/finance/compensation/${compensationId}`;

  const replacementId = pickId(row, meta, "replacement_ride_id");
  const rideId = pickId(row, meta, "ride_id", "original_ride_id");
  const caseId = pickId(row, meta, "case_id");
  const alertId = pickId(row, meta, "alert_id");
  const alertType = typeof row.type === "string" ? row.type : "";
  const publicNumber = pickId(row, meta, "public_number");

  const preferRide =
    event === "ride.breakdown_reported" ||
    event === "replacement_needed.created" ||
    event === "ride.replacement_created" ||
    event === "replacement_ride.created" ||
    event === "alert.created" ||
    event === "long_stop.created" ||
    event === "location_stale.created" ||
    event === "route_deviation.created" ||
    alertType === "REPLACEMENT_NEEDED";

  if (preferRide) {
    if (replacementId) return `/erp/rides/${replacementId}`;
    if (rideId) return `/erp/rides/${rideId}`;
    if (publicNumber) return `/erp/rides?q=${encodeURIComponent(publicNumber)}`;
    if (caseId) return `/erp/cases/${caseId}`;
    if (alertId) return "/erp/alerts";
  }

  if (caseId) return `/erp/cases/${caseId}`;
  if (replacementId) return `/erp/rides/${replacementId}`;
  if (rideId) return `/erp/rides/${rideId}`;
  if (publicNumber) return `/erp/rides?q=${encodeURIComponent(publicNumber)}`;
  if (alertId) return "/erp/alerts";
  return undefined;
}

function alertIdOf(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const row = payload as Record<string, unknown>;
  return typeof row.alert_id === "string" ? row.alert_id : "";
}

export function DeskProvider({ children, initialLocale }: { children: ReactNode; initialLocale: Locale }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<StaffSession | null>(null);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [link, setLink] = useState<LinkState>("reconnecting");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notices, setNotices] = useState<DeskNotice[]>([]);
  const noticesHydrated = useRef(false);
  const [locale, setLocaleState] = useState(initialLocale);
  const [branchId, setBranchIdState] = useState<string | null>(null);
  bindDeskLocale(locale);

  const branchLocked = deskBranchLock(session?.user) !== null;

  const setBranchId = useCallback((next: string | null) => {
    if (deskBranchLock(session?.user)) return;
    setBranchIdState(next);
    if (typeof window === "undefined") return;
    if (next) window.sessionStorage.setItem(BRANCH_KEY, next);
    else window.sessionStorage.removeItem(BRANCH_KEY);
  }, [session]);

  useEffect(() => {
    if (!ready) return;
    const locked = deskBranchLock(session?.user);
    if (locked) {
      setBranchIdState(locked);
      return;
    }
    if (!session) {
      setBranchIdState(null);
      return;
    }
    const saved = window.sessionStorage.getItem(BRANCH_KEY);
    setBranchIdState(saved || null);
  }, [ready, session]);

  const setLocale = useCallback((next: Locale) => {
    const commit = () => {
      applyDeskLocale(next);
      setLocaleState(next);
    };
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof document === "undefined" || !document.startViewTransition || reduce || document.hidden) {
      commit();
      return;
    }
    const update = () => {
      flushSync(commit);
    };
    try {
      const transition = document.startViewTransition({ update, types: ["locale"] });
      const watchdog = window.setTimeout(() => {
        try {
          transition.skipTransition();
        } catch {
          /* ignore */
        }
      }, 1500);
      transition.finished.finally(() => window.clearTimeout(watchdog)).catch(() => {});
      transition.updateCallbackDone.catch(() => {});
    } catch {
      try {
        const transition = document.startViewTransition(update);
        const watchdog = window.setTimeout(() => {
          try {
            transition.skipTransition();
          } catch {
            /* ignore */
          }
        }, 1500);
        transition.finished.finally(() => window.clearTimeout(watchdog)).catch(() => {});
      } catch {
        commit();
      }
    }
  }, []);

  useEffect(() => {
    setSession(readSession());
    setReady(true);
  }, []);

  // Load persisted notices for the signed-in staff user; clear inbox when logged out.
  useEffect(() => {
    if (!ready) return;
    const userId = session?.user.id;
    if (!userId) {
      noticesHydrated.current = false;
      setNotices([]);
      return;
    }
    noticesHydrated.current = false;
    setNotices(readStoredNotices(userId));
    noticesHydrated.current = true;
  }, [ready, session?.user.id]);

  // Backfill detail links on older notices that were saved without href.
  useEffect(() => {
    if (!noticesHydrated.current) return;
    setNotices((current) => {
      let changed = false;
      const next = current.map((item) => {
        const fixed = withNoticeHref(item);
        if (fixed.href !== item.href) changed = true;
        return fixed;
      });
      return changed ? next : current;
    });
  }, [ready, session?.user.id, notices.length]);

  // Persist notices — never auto-expire; only user delete removes them.
  useEffect(() => {
    const userId = session?.user.id;
    if (!ready || !userId || !noticesHydrated.current) return;
    writeStoredNotices(userId, notices);
  }, [notices, ready, session?.user.id]);

  function pushToast(text: string, href?: string, detail?: string) {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-4), { id, text, detail, href }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 6000);
  }

  const sessionUserId = session?.user.id ?? null;
  // Store cashiers have no staff scope: the /go/staff socket would reject them.
  const socketUserId = session && session.user.role !== "STORE_OPERATOR" ? session.user.id : null;

  useEffect(() => {
    if (ready && !sessionUserId) queryClient.clear();
  }, [queryClient, ready, sessionUserId]);

  useEffect(() => {
    if (!socketUserId) return;
    const origin = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8000";
    const socket: Socket = io(`${origin}/go/staff`, {
      // Read on every (re)connect so a refreshed access token is used.
      auth: (cb) => cb({ token: readSession()?.accessToken ?? "" }),
      transports: ["websocket", "polling"],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 20_000,
      randomizationFactor: 0.5,
    });
    const seenAlerts = new Set<string>();
    let closed = false;
    let hadConnection = false;
    let authRetries = 0;
    let liveTimer: number | null = null;
    let liveAt = 0;
    const lostState = (): LinkState => (navigator.onLine === false ? "offline" : "reconnecting");
    const refreshLive = () => {
      if (liveTimer != null) return;
      liveTimer = window.setTimeout(() => {
        liveTimer = null;
        liveAt = Date.now();
        void queryClient.invalidateQueries({ queryKey: ["cc"] });
      }, Math.max(0, liveAt + LIVE_REFRESH_MS - Date.now()));
    };
    socket.on("connect", () => {
      authRetries = 0;
      setConnected(true);
      setLink("online");
      if (hadConnection) {
        void queryClient.invalidateQueries({ queryKey: ["go"] });
        refreshLive();
      }
      hadConnection = true;
    });
    socket.on("disconnect", (reason) => {
      setConnected(false);
      setLink(lostState());
      if (reason === "io server disconnect" && !closed) socket.connect();
    });
    socket.on("connect_error", (error: Error) => {
      setConnected(false);
      setLink(lostState());
      if (socket.active) return;
      if (error.message !== "UNAUTHORIZED" || authRetries >= 2) {
        setLink("offline");
        return;
      }
      authRetries += 1;
      void refreshStaffSession()
        .then((token) => {
          if (closed) return;
          if (token) socket.connect();
          else setLink("offline");
        })
        .catch(() => setLink("offline"));
    });
    const onOnline = () => {
      if (!socket.connected && !closed) socket.connect();
    };
    const onOffline = () => setLink("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    socket.onAny((event: string, payload: unknown) => {
      if (event === "radar.updated") {
        refreshLive();
        return;
      }
      if (QUIET_EVENTS.has(event)) return;
      void queryClient.invalidateQueries({ queryKey: ["go"] });
      refreshLive();
      if (event === "alert.created" || event === "route_deviation.created" || event === "replacement_needed.created") {
        const alertId = alertIdOf(payload);
        if (alertId) {
          if (seenAlerts.has(alertId)) return;
          seenAlerts.add(alertId);
          if (seenAlerts.size > 200) seenAlerts.clear();
        }
      }
      if (skipDeskNotice(event, payload)) return;
      const parts = eventParts(event, payload);
      const href = toastHref(event, payload);
      setNotices((current) => [
        withNoticeHref({
          id: Date.now() + Math.random(),
          text: parts.title,
          detail: parts.detail,
          href,
          at: Date.now(),
          read: false,
        }),
        ...current,
      ]);
      pushToast(parts.title, href, parts.detail);
      deviceNotify(parts.title, parts.detail ?? parts.text, { force: event === "notification.message" });
    });
    return () => {
      closed = true;
      if (liveTimer != null) window.clearTimeout(liveTimer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      socket.close();
      setConnected(false);
      setLink("offline");
    };
  }, [queryClient, socketUserId]);

  const markNoticesRead = useCallback(() => {
    setNotices((current) => current.map((item) => (item.read ? item : { ...item, read: true })));
  }, []);

  const removeNotice = useCallback((id: number) => {
    setNotices((current) => current.filter((item) => item.id !== id));
  }, []);

  const clearNotices = useCallback(() => {
    setNotices([]);
  }, []);

  const unreadNotices = notices.reduce((count, item) => count + (item.read ? 0 : 1), 0);

  const value = useMemo(
    () => ({
      session: ready ? session : null,
      setSession,
      connected,
      link,
      toasts,
      notices,
      unreadNotices,
      markNoticesRead,
      removeNotice,
      clearNotices,
      pushToast,
      locale,
      setLocale,
      ready,
      branchId,
      setBranchId,
      branchLocked,
    }),
    [branchId, branchLocked, clearNotices, connected, link, locale, markNoticesRead, notices, ready, removeNotice, session, setBranchId, setLocale, toasts, unreadNotices],
  );

  return (
    <DeskContext.Provider value={value}>
      <ConfirmProvider>
      {children}
      <div className="pointer-events-none fixed bottom-4 start-4 z-50 grid gap-2">
        {toasts.map((toast) => {
          const content = (
            <>
              <span aria-hidden className="absolute inset-y-0 start-0 w-1 bg-brand" />
              <span className="block text-sm font-semibold text-heading">{toast.text}</span>
              {toast.detail ? (
                <span className="mt-1 block whitespace-pre-line text-xs leading-5 text-muted">{toast.detail}</span>
              ) : null}
            </>
          );
          return toast.href ? (
            <Link
              key={toast.id}
              href={toast.href}
              className="desk-toast pointer-events-auto relative max-w-sm overflow-hidden rounded-xl border border-line bg-surface py-2.5 ps-4 pe-4 shadow-float"
            >
              {content}
            </Link>
          ) : (
            <div key={toast.id} className="desk-toast relative max-w-sm overflow-hidden rounded-xl border border-line bg-surface py-2.5 ps-4 pe-4 shadow-float">
              {content}
            </div>
          );
        })}
      </div>
      </ConfirmProvider>
    </DeskContext.Provider>
  );
}

export function useDesk() {
  const value = useContext(DeskContext);
  if (!value) throw new Error("DeskProvider is missing");
  return value;
}
