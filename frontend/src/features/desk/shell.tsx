"use client";

import { Bell, Camera, ChevronDown, ChevronLeft, MapPin, Menu, ShieldCheck, Trash2, X } from "lucide";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode, type TransitionEvent } from "react";

import { useConfirm } from "@/features/desk/confirm";
import { useDesk } from "@/features/desk/desk-context";
import { isGoFailure, useGo, useGoList } from "@/features/desk/hooks";
import { headline } from "@/features/desk/present";
import { ChoiceSelect } from "@/features/desk/select";
import { CHROME_ICONS, NAV_ICONS } from "@/features/desk/icons";
import { localeTag, t } from "@/features/desk/i18n/t";
import { DeskLocaleSwitch } from "@/features/desk/locale-switch";
import { canOpen, navFor, navMatch, SECTION_LABEL, type NavSection } from "@/features/desk/nav";
import { clearSession, homeFor, isStoreOperator, readSession, roleLabel, writeSession, type StaffUser } from "@/features/desk/session";
import { BrandMark, btnGhost, btnIcon, btnIconQuiet, btnPrimary, DeskForm, Field, inputClass } from "@/features/desk/ui";
import { Icon } from "@/shared/ui/icon";
import { Tooltip } from "@/shared/ui/tooltip";
import { ThemeToggle } from "@/shared/theme/theme-toggle";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]).join("") || "B";
}

function StaffAvatarFace({
  person,
  avatarUrl,
  sizeClass = "size-8",
  textClass = "text-xs",
}: {
  person: string;
  avatarUrl?: string | null;
  sizeClass?: string;
  textClass?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!avatarUrl) {
      setSrc(null);
      return;
    }
    const session = readSession();
    if (!session?.accessToken) {
      setSrc(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    const path = avatarUrl.startsWith("/") ? avatarUrl : `/${avatarUrl}`;
    void fetch(`/api/proxy${path}`, { headers: { Authorization: `Bearer ${session.accessToken}` } })
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [avatarUrl]);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className={`${sizeClass} shrink-0 rounded-full object-cover ring-1 ring-inset ring-line`} />
    );
  }
  return (
    <span className={`grid ${sizeClass} shrink-0 place-items-center rounded-full bg-teal font-semibold text-on-teal ${textClass}`}>
      {initials(person)}
    </span>
  );
}

function SessionSplash() {
  return (
    <div role="status" aria-live="polite" className="desk-fade relative grid min-h-dvh place-items-center overflow-hidden bg-canvas px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/10 blur-3xl"
      />
      <div className="relative grid w-full max-w-xs justify-items-center gap-7 text-center">
        <BrandMark size="lg" className="h-9 text-heading" />
        <div className="relative h-1 w-48 overflow-hidden rounded-full bg-heading/10">
          <span className="indeterminate absolute inset-y-0 start-0 w-2/5 rounded-full bg-linear-to-r from-brand to-accent" />
        </div>
        <div className="grid gap-1.5">
          <p className="flex items-center justify-center gap-2 text-sm font-semibold text-heading">
            <Icon node={ShieldCheck} size={16} className="text-accent" />
            {t("جارٍ التحقق من الجلسة…")}
          </p>
          <p className="text-xs text-muted">{t("نجهّز لوحة التحكم بأمان، لحظات فقط.")}</p>
        </div>
      </div>
      <p className="absolute inset-x-0 bottom-6 text-center text-[11px] text-muted/70" dir="ltr">Beroya On</p>
    </div>
  );
}

function BranchPicker() {
  const { session, branchId, setBranchId, branchLocked } = useDesk();
  const branches = useGoList("/erp/branches", { limit: 100 }, false);
  if (!session) return null;
  const options = (branches.data ?? []).map((row) => ({ value: String(row.id), label: headline(row) }));
  const visible = branchLocked && session.user.branch_id ? options.filter((option) => option.value === session.user.branch_id) : options;
  return (
    <div className="w-44 shrink-0 sm:w-52">
      <ChoiceSelect
        value={branchId ?? ""}
        onValueChange={(next) => setBranchId(next || null)}
        options={visible}
        emptyLabel={branchLocked ? undefined : t("كل الفروع")}
        placeholder={t("كل الفروع")}
      />
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, ready, setSession, locale, setLocale } = useDesk();
  const confirm = useConfirm();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerShown, setDrawerShown] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [devicePush, setDevicePush] = useState<NotificationPermission | "off">("off");
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setDevicePush(Notification.permission);
  }, []);

  useEffect(() => {
    if (ready && !session) router.replace("/login");
  }, [ready, router, session]);

  useEffect(() => {
    if (ready && session && !canOpen(session.user.role, pathname)) router.replace(homeFor(session.user.role));
  }, [pathname, ready, router, session]);

  useEffect(() => {
    if (window.localStorage.getItem("beroya-desk-sidebar") === "closed") setPinned(false);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const id = window.requestAnimationFrame(() => setDrawerShown(true));
    return () => window.cancelAnimationFrame(id);
  }, [menuOpen]);

  function openMobileMenu() {
    setMenuOpen(true);
  }

  function closeMobileMenu() {
    setDrawerShown(false);
  }

  function onDrawerTransitionEnd(event: TransitionEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || event.propertyName !== "transform") return;
    if (!drawerShown) setMenuOpen(false);
  }

  function toggleSidebar() {
    if (window.matchMedia("(min-width: 768px)").matches) {
      setPinned((open) => {
        const next = !open;
        window.localStorage.setItem("beroya-desk-sidebar", next ? "open" : "closed");
        return next;
      });
      return;
    }
    if (menuOpen) closeMobileMenu();
    else openMobileMenu();
  }

  if (!ready || !session) return <SessionSplash />;

  const allowed = canOpen(session.user.role, pathname);
  const items = navFor(session.user.role);
  const current = navMatch(pathname);
  const branchName = session.user.branch
    ? (locale === "en" && session.user.branch.name_en) || session.user.branch.name_ar
    : "";
  const storeDesk = isStoreOperator(session.user.role);
  const branch = storeDesk
    ? session.user.store?.name || t("متجر غير مرتبط")
    : branchName || (session.user.branch_id ? t("فرع محدد") : t("كل الفروع"));
  const person = session.user.full_name || session.user.email || session.user.phone || t("موظف");
  const contact = session.user.email || session.user.phone || "";
  const role = roleLabel(session.user.role);
  const sections = (["pos", "ops", "finance", "admin"] as NavSection[]).filter((section) => items.some((item) => item.section === section));

  async function logout(all = false) {
    const leave = async () => {
      try {
        await fetch("/api/proxy/api/v1/go/auth/logout" + (all ? "-all" : ""), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session!.accessToken}`,
            ...(all ? {} : { "Idempotency-Key": crypto.randomUUID() }),
          },
        });
      } finally {
        clearSession();
        setSession(null);
        router.replace("/login");
      }
    };
    if (!all) {
      await leave();
      return;
    }
    await confirm({
      title: t("خروج من كل الأجهزة"),
      body: t("ستُلغى كل الجلسات المفتوحة لهذا الحساب."),
      confirm: t("خروج من كل الأجهزة"),
      danger: true,
      perform: leave,
    });
  }

  const sidebar = (drawer: boolean) => (
    <>
      <div dir="ltr" className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
        {drawer ? (
          <button type="button" className={btnIconQuiet} aria-label={t("إغلاق")} onClick={closeMobileMenu}>
            <Icon node={X} size={18} />
          </button>
        ) : (
          <Tooltip label={t("إخفاء القائمة")}>
            <button type="button" className={btnIconQuiet} aria-label={t("إخفاء القائمة")} onClick={toggleSidebar}>
              <Icon node={CHROME_ICONS.close} size={18} />
            </button>
          </Tooltip>
        )}
        <BrandMark />
      </div>
      <nav aria-label={t("القائمة")} className="flex-1 overflow-y-auto px-3 py-5">
        <div className="grid gap-6">
          {sections.map((section) => (
            <div key={section}>
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{t(SECTION_LABEL[section])}</p>
              <ul className="grid gap-0.5">
                {items.filter((item) => item.section === section).map((item) => {
                  const active = current?.href === item.href;
                  const icon = NAV_ICONS[item.href];
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        onClick={closeMobileMenu}
                        className={`group relative flex h-10 items-center gap-3 rounded-lg px-3 text-[13.5px] transition-colors ${active ? "bg-brand/12 font-semibold text-heading" : "font-medium text-body hover:bg-heading/5 hover:text-heading"}`}
                      >
                        {active ? <span aria-hidden className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-brand" /> : null}
                        {icon ? <Icon node={icon} size={18} className={active ? "shrink-0 text-accent" : "shrink-0 text-muted transition-colors group-hover:text-heading"} /> : null}
                        <span className="truncate">{t(item.label)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
      <div className="shrink-0 border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-lg bg-heading/[0.03] px-3 py-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand/12 text-accent">
            <Icon node={MapPin} size={16} />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13px] font-semibold text-heading">{branch}</p>
            <p className="mt-0.5 truncate text-xs text-muted">{role}</p>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="desk-shell min-h-dvh" data-sidebar={pinned ? "open" : "closed"}>
      <aside
        className={`desk-sidebar sticky top-0 hidden h-dvh flex-col border-e border-line bg-surface md:flex ${pinned ? "" : "pointer-events-none"}`}
        aria-hidden={!pinned}
      >
        <div className="desk-sidebar-inner flex h-full flex-col">{sidebar(false)}</div>
      </aside>
      {menuOpen ? (
        <>
          <button
            type="button"
            aria-label={t("إغلاق")}
            className="desk-scrim fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px] md:hidden"
            data-open={drawerShown ? "true" : "false"}
            onClick={closeMobileMenu}
          />
          <aside
            className="desk-drawer fixed inset-y-0 start-0 z-50 flex w-[17rem] max-w-[85vw] flex-col border-e border-line bg-surface shadow-float md:hidden"
            data-open={drawerShown ? "true" : "false"}
            onTransitionEnd={onDrawerTransitionEnd}
          >
            {sidebar(true)}
          </aside>
        </>
      ) : null}
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur-md md:px-6">
          {!pinned ? (
            <Tooltip label={t("إظهار القائمة")} className="hidden md:inline-flex">
              <button type="button" className={btnIcon} aria-label={t("إظهار القائمة")} onClick={toggleSidebar}>
                <Icon node={CHROME_ICONS.open} size={18} className="rtl:-scale-x-100" />
              </button>
            </Tooltip>
          ) : null}
          <button type="button" className={`${btnIcon} md:hidden`} aria-label={t("إظهار القائمة")} onClick={openMobileMenu}>
            <Icon node={Menu} size={18} />
          </button>
          <Link href={homeFor(session.user.role)} className={`flex items-center ${pinned ? "md:hidden" : ""}`} aria-label="Beroya On">
            <BrandMark size="sm" />
          </Link>
          {current ? (
            <div className="hidden min-w-0 items-center gap-2 text-[13px] md:flex">
              {!pinned ? <span aria-hidden className="me-1 h-5 w-px bg-line" /> : null}
              <span className="whitespace-nowrap text-muted">{t(SECTION_LABEL[current.section])}</span>
              <Icon node={ChevronLeft} size={14} className="shrink-0 text-muted ltr:rotate-180" />
              <span className="truncate font-semibold text-heading">{t(current.label)}</span>
            </div>
          ) : null}
          {storeDesk ? null : <BranchPicker />}
          <div className="ms-auto flex items-center gap-2">
            {storeDesk ? null : <LinkBadge />}
            {storeDesk ? null : <NoticeBell permission={devicePush} onPermission={setDevicePush} />}
            <ThemeToggle label={t("المظهر")} buttonClassName={btnIcon} />
            <DeskLocaleSwitch locale={locale} onChange={setLocale} />
            <span aria-hidden className="mx-1 hidden h-6 w-px bg-line sm:block" />
            <UserMenu
              person={person}
              contact={contact}
              role={role}
              branch={branch}
              avatarUrl={session.user.avatar_url}
              onUser={(user) => {
                const current = readSession();
                if (!current) return;
                writeSession({ ...current, user });
                setSession({ ...current, user });
              }}
              onPassword={() => setPasswordOpen(true)}
              onLogout={(all) => void logout(all)}
            />
          </div>
        </header>
        <main key={pathname} className="desk-page mx-auto w-full min-w-0 max-w-[90rem] px-4 py-6 md:px-6 lg:px-8">
          {allowed ? children : null}
        </main>
      </div>
      {passwordOpen ? (
        <PasswordDialog
          onClose={() => setPasswordOpen(false)}
          onDone={() => {
            clearSession();
            setSession(null);
            router.replace("/login");
          }}
        />
      ) : null}
    </div>
  );
}

const LINK_VIEW = {
  online: { dot: "bg-success", text: "متصل مباشرة", hint: "التحديثات الحية تصل الآن." },
  reconnecting: { dot: "bg-warning animate-pulse", text: "إعادة الاتصال…", hint: "البيانات المعروضة قد تكون قديمة حتى يعود الاتصال." },
  offline: { dot: "bg-danger", text: "غير متصل", hint: "لا تصل تحديثات حية. حدّث الصفحة أو تحقق من الشبكة." },
} as const;

function LinkBadge() {
  const { link } = useDesk();
  const view = LINK_VIEW[link];
  return (
    <Tooltip label={t(view.hint)}>
      <span role="status" className="hidden h-8 items-center gap-2 rounded-lg border border-line px-2.5 text-xs font-medium text-body sm:inline-flex">
        <span aria-hidden className={`size-2 rounded-full ${view.dot}`} />
        {t(view.text)}
      </span>
    </Tooltip>
  );
}

function NoticeBell({
  permission,
  onPermission,
}: {
  permission: NotificationPermission | "off";
  onPermission: (permission: NotificationPermission | "off") => void;
}) {
  const { notices, unreadNotices, markNoticesRead, removeNotice, clearNotices } = useDesk();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    markNoticesRead();
  }, [markNoticesRead]);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) close();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [close, open]);

  function toggle() {
    if (permission === "default" && typeof Notification !== "undefined") {
      void Notification.requestPermission().then((next) => onPermission(next));
    }
    if (open) close();
    else setOpen(true);
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-3 text-xs font-semibold text-body transition-colors hover:border-teal/45 hover:text-heading"
        onClick={toggle}
      >
        <Icon node={Bell} size={15} />
        <span className="hidden sm:inline">{t("الإشعارات")}</span>
        {unreadNotices > 0 ? (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-on-brand">{unreadNotices > 9 ? "9+" : unreadNotices}</span>
        ) : null}
      </button>
      {open ? (
        <div role="dialog" aria-label={t("الإشعارات")} className="desk-pop absolute end-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-float">
          <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-heading">{t("الإشعارات")}</p>
              <p className="mt-0.5 text-xs text-muted">{t("تبقى محفوظة حتى تحذفها بنفسك.")}</p>
            </div>
            {notices.length > 0 ? (
              <button
                type="button"
                className="shrink-0 text-xs font-semibold text-danger-ink transition-colors hover:underline"
                onClick={() => clearNotices()}
              >
                {t("حذف الكل")}
              </button>
            ) : null}
          </div>
          {notices.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">{t("لا توجد إشعارات بعد")}</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {notices.map((item) => {
                const href = item.href;
                const body = (
                  <>
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.read ? "bg-line-strong" : "bg-brand"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold leading-6 text-heading">{item.text}</span>
                      {item.detail ? (
                        <span className="mt-0.5 block whitespace-pre-line text-xs leading-5 text-body">{item.detail}</span>
                      ) : null}
                      <span className="mt-1 block text-[11px] text-muted">
                        {new Intl.DateTimeFormat(localeTag(), { dateStyle: "medium", timeStyle: "short" }).format(item.at)}
                      </span>
                      {href ? (
                        <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent">
                          {t("فتح التفاصيل")}
                          <Icon node={ChevronLeft} size={14} />
                        </span>
                      ) : null}
                    </span>
                  </>
                );
                return (
                  <li key={item.id} className="border-b border-line last:border-0">
                    <div className="flex items-start gap-1 pe-2">
                      {href ? (
                        <Link
                          href={href}
                          className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 transition-colors hover:bg-heading/[0.03]"
                          onClick={close}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3">{body}</div>
                      )}
                      <button
                        type="button"
                        className={`${btnIconQuiet} mt-2 shrink-0`}
                        aria-label={t("حذف الإشعار")}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          removeNotice(item.id);
                        }}
                      >
                        <Icon node={X} size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

const menuItem = "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-start text-[13px] font-medium transition-colors";

function UserMenu({
  person,
  contact,
  role,
  branch,
  avatarUrl,
  onUser,
  onPassword,
  onLogout,
}: {
  person: string;
  contact: string;
  role: string;
  branch: string;
  avatarUrl?: string | null;
  onUser: (user: StaffUser) => void;
  onPassword: () => void;
  onLogout: (all: boolean) => void;
}) {
  const call = useGo();
  const [open, setOpen] = useState(false);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(action: () => void) {
    setOpen(false);
    action();
  }

  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    setBusyPhoto(true);
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const saved = await call<StaffUser>("/auth/staff/avatar", {
      method: "POST",
      idempotent: true,
      body: { data_base64: btoa(binary) },
    });
    setBusyPhoto(false);
    if (!isGoFailure(saved) && saved.id) {
      onUser(saved);
      setOpen(false);
    }
  }

  async function removePhoto() {
    setBusyPhoto(true);
    const saved = await call<StaffUser>("/auth/staff/avatar", { method: "DELETE" });
    setBusyPhoto(false);
    if (!isGoFailure(saved) && saved.id) {
      onUser(saved);
      setOpen(false);
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 items-center gap-2.5 rounded-lg px-1 transition-colors hover:bg-heading/5 md:pe-2"
      >
        <StaffAvatarFace person={person} avatarUrl={avatarUrl} />
        <span className="hidden min-w-0 text-start leading-tight md:block">
          <span className="block max-w-40 truncate text-[13px] font-semibold text-heading">{person}</span>
          <span className="mt-0.5 block max-w-40 truncate text-[11px] text-muted">{role}</span>
        </span>
        <Icon node={ChevronDown} size={16} className={`hidden shrink-0 text-muted transition-transform md:block ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div role="menu" className="desk-pop absolute end-0 top-full z-50 mt-2 w-72 rounded-xl border border-line bg-surface p-1.5 shadow-float">
          <div className="flex items-center gap-3 px-2.5 pb-3 pt-2.5">
            <StaffAvatarFace person={person} avatarUrl={avatarUrl} sizeClass="size-10" textClass="text-sm" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-heading">{person}</p>
              {contact && contact !== person ? (
                <p className="mt-1 truncate text-xs text-muted" dir={contact.includes("@") ? undefined : "ltr"}>
                  <bdi className={contact.includes("@") ? undefined : "phone-ltr"} dir={contact.includes("@") ? undefined : "ltr"} data-phone={contact.includes("@") ? undefined : ""}>
                    {contact}
                  </bdi>
                </p>
              ) : null}
              <p className="mt-1 truncate text-xs text-muted">{role} · {branch}</p>
            </div>
          </div>
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            role="menuitem"
            disabled={busyPhoto}
            className={`${menuItem} text-body hover:bg-heading/5 hover:text-heading`}
            onClick={() => photoInput.current?.click()}
          >
            <Icon node={Camera} size={16} className="shrink-0 text-muted" />
            {busyPhoto ? t("جاري الرفع…") : avatarUrl ? t("تغيير الصورة الشخصية") : t("رفع صورة شخصية")}
          </button>
          <input
            ref={photoInput}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void uploadPhoto(file);
            }}
          />
          {avatarUrl ? (
            <button
              type="button"
              role="menuitem"
              disabled={busyPhoto}
              className={`${menuItem} text-danger-ink hover:bg-danger/10`}
              onClick={() => void removePhoto()}
            >
              <Icon node={Trash2} size={16} className="shrink-0" />
              {t("إزالة الصورة الشخصية")}
            </button>
          ) : null}
          <button type="button" role="menuitem" className={`${menuItem} text-body hover:bg-heading/5 hover:text-heading`} onClick={() => pick(onPassword)}>
            <Icon node={CHROME_ICONS.password} size={16} className="shrink-0 text-muted" />
            {t("تغيير كلمة المرور")}
          </button>
          <button type="button" role="menuitem" className={`${menuItem} text-body hover:bg-heading/5 hover:text-heading`} onClick={() => pick(() => onLogout(false))}>
            <Icon node={CHROME_ICONS.logout} size={16} className="shrink-0 text-muted rtl:-scale-x-100" />
            {t("خروج")}
          </button>
          <div className="my-1 h-px bg-line" />
          <button type="button" role="menuitem" className={`${menuItem} text-danger-ink hover:bg-danger/10`} onClick={() => pick(() => onLogout(true))}>
            <Icon node={CHROME_ICONS.devices} size={16} className="shrink-0" />
            {t("خروج من كل الأجهزة")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PasswordDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const call = useGo();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSubmit(form: FormData) {
    const done = await call("/auth/staff/change-password", {
      method: "POST",
      body: {
        current_password: String(form.get("current_password") ?? ""),
        new_password: String(form.get("new_password") ?? ""),
      },
    });
    if (!isGoFailure(done)) onDone();
  }

  return (
    <div className="desk-fade fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <DeskForm
        action={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-label={t("تغيير كلمة المرور")}
        className="desk-pop w-full max-w-md rounded-2xl border border-line bg-surface shadow-float"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-brand/12 text-accent">
              <Icon node={CHROME_ICONS.password} size={18} />
            </span>
            <h2 className="text-base font-semibold text-heading">{t("تغيير كلمة المرور")}</h2>
          </div>
          <button type="button" className={btnIconQuiet} aria-label={t("إغلاق")} onClick={onClose}>
            <Icon node={X} size={18} />
          </button>
        </div>
        <div className="grid gap-4 px-5 py-5">
          <Field label={t("الحالية")}>
            <input className={inputClass} name="current_password" type="password" autoComplete="current-password" required />
          </Field>
          <Field label={t("الجديدة")}>
            <input className={inputClass} name="new_password" type="password" autoComplete="new-password" required />
            <span className="text-xs text-muted">{t("ثمانية أحرف على الأقل، وفيها حرف ورقم.")}</span>
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button className={btnGhost} type="button" onClick={onClose}>{t("إلغاء")}</button>
          <button className={btnPrimary} type="submit">{t("حفظ")}</button>
        </div>
      </DeskForm>
    </div>
  );
}

export function useRequireHome() {
  const { session } = useDesk();
  const router = useRouter();
  useEffect(() => {
    if (session) router.replace(homeFor(session.user.role));
  }, [router, session]);
}
