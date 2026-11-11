"use client";

import {
  Check,
  ImagePlus,
  LoaderCircle,
  MonitorSmartphone,
  Palette,
  Sparkles,
  Trash2,
  Upload,
} from "lucide";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";

import { useGo, useGoRecord } from "@/features/desk/hooks";
import { t } from "@/features/desk/i18n/t";
import { readSession } from "@/features/desk/session";
import { btnDark, btnGhost, btnGhostSm, btnPrimary, inputClass, Notice, PageTitle, Panel, PanelHeader, StateView } from "@/features/desk/ui";
import { Icon } from "@/shared/ui/icon";

type AppIdentity = "customer" | "driver";

type AppIcon = {
  id: string;
  name: string;
  android: boolean;
  ios: boolean;
  preview_color: string;
};

/** Desk previews from `frontend/public/icon/{customer|driver}/NN.png` (icon_01 → 01.png). */
function iconPublicSrc(app: AppIdentity, iconId: string) {
  const num = iconId.replace(/^icon_/, "");
  return `/icon/${app}/${num}.png`;
}

function AppIconThumb({
  app,
  icon,
  sizeClass = "size-12",
  radiusClass = "rounded-[18px]",
}: {
  app: AppIdentity;
  icon: AppIcon;
  sizeClass?: string;
  radiusClass?: string;
}) {
  const [broken, setBroken] = useState(false);
  const src = iconPublicSrc(app, icon.id);
  if (broken) {
    return (
      <span
        className={`mx-auto grid ${sizeClass} place-items-center ${radiusClass} text-sm font-bold text-white shadow-[0_8px_18px_-10px_rgb(0_0_0/0.55)]`}
        style={{ background: icon.preview_color }}
      >
        {icon.name.replace("Icon ", "")}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local static branding assets under /public/icon
    <img
      src={src}
      alt={icon.name}
      className={`mx-auto ${sizeClass} ${radiusClass} object-cover shadow-[0_8px_18px_-10px_rgb(0_0_0/0.55)]`}
      onError={() => setBroken(true)}
    />
  );
}

type BrandingView = {
  version: number;
  logo_url: string | null;
  login_top_url: string | null;
  home_top_url: string | null;
  account_top_url: string | null;
  colors: { primary: string; secondary: string; background: string };
  splash: {
    image_url: string | null;
    animation_url: string | null;
    animation_type: string;
    duration_ms: number;
    animation_enabled: boolean;
  };
  animations: {
    loading_url: string | null;
    home_url: string | null;
    success_url: string | null;
    error_url: string | null;
    empty_url: string | null;
  };
  app_icon: { android: string; ios: string };
  available_icons: AppIcon[];
};

type AdminBranding = {
  version: number;
  updated_at: string;
  unpublished_changes: boolean;
  available_icons: AppIcon[];
  published: BrandingView;
  draft: BrandingView;
};

type PreviewTab = "splash" | "login" | "home" | "account";

const SLOTS: {
  id: string;
  label: string;
  group: "general" | "tops" | "splash" | "animations";
  accept: string;
  hint: string;
  affect?: string;
}[] = [
  {
    id: "logo",
    label: "شعار التطبيق",
    group: "general",
    accept: "image/png,image/jpeg,image/webp,image/gif",
    hint: "PNG · JPG · WEBP · GIF",
    affect: "يظهر في تسجيل الدخول والرئيسية.",
  },
  {
    id: "login_top",
    label: "زينة أعلى · تسجيل الدخول",
    group: "tops",
    accept: "image/png,image/jpeg,image/webp,image/gif,application/json,.json",
    hint: "PNG · JPG · WEBP · GIF · Lottie",
    affect: "تظهر فقط فوق شاشة تسجيل الدخول بعد النشر.",
  },
  {
    id: "home_top",
    label: "زينة أعلى · الرئيسية",
    group: "tops",
    accept: "image/png,image/jpeg,image/webp,image/gif,application/json,.json",
    hint: "PNG · JPG · WEBP · GIF · Lottie",
    affect: "تظهر فقط فوق الشاشة الرئيسية بعد النشر.",
  },
  {
    id: "account_top",
    label: "زينة أعلى · حسابي",
    group: "tops",
    accept: "image/png,image/jpeg,image/webp,image/gif,application/json,.json",
    hint: "PNG · JPG · WEBP · GIF · Lottie",
    affect: "تظهر فقط فوق شاشة حسابي بعد النشر.",
  },
  {
    id: "splash_image",
    label: "صورة شاشة الافتتاح",
    group: "splash",
    accept: "image/png,image/jpeg,image/webp,image/gif",
    hint: "فريم كامل للموسم (صورة ثابتة)",
    affect: "تُعرض كاملة على الشاشة في التطبيق.",
  },
  {
    id: "splash_animation",
    label: "حركة شاشة الافتتاح",
    group: "splash",
    accept: "image/gif,image/png,image/jpeg,image/webp,application/json,.json",
    hint: "GIF أو Lottie — فريم كامل",
    affect: "تُعرض كاملة على الشاشة في التطبيق.",
  },
  { id: "loading", label: "حركة التحميل", group: "animations", accept: "image/gif,image/png,image/jpeg,image/webp,application/json,.json", hint: "GIF أو Lottie" },
  { id: "home", label: "حركة الصفحة الرئيسية", group: "animations", accept: "image/gif,image/png,image/jpeg,image/webp,application/json,.json", hint: "GIF أو Lottie" },
  { id: "success", label: "حركة النجاح", group: "animations", accept: "image/gif,image/png,image/jpeg,image/webp,application/json,.json", hint: "GIF أو Lottie" },
  { id: "error", label: "حركة الخطأ", group: "animations", accept: "image/gif,image/png,image/jpeg,image/webp,application/json,.json", hint: "GIF أو Lottie" },
  { id: "empty", label: "حركة الحالة الفارغة", group: "animations", accept: "image/gif,image/png,image/jpeg,image/webp,application/json,.json", hint: "GIF أو Lottie" },
];

const ANIMATION_TYPES = [
  { id: "none", label: "بدون" },
  { id: "image", label: "صورة ثابتة" },
  { id: "gif", label: "GIF" },
  { id: "lottie", label: "Lottie" },
] as const;

const BLOCKED = /\.(exe|dll|apk|aab|ipa|php|js|html|htm|bat|cmd|sh|msi)$/i;
const ALLOWED = /\.(png|jpe?g|webp|gif|json)$/i;
const MAX_BYTES = 5 * 1024 * 1024;
const HEX = /^#([0-9A-Fa-f]{6})$/;

function asBranding(value: unknown): AdminBranding | null {
  if (!value || typeof value !== "object") return null;
  const row = value as AdminBranding;
  if (!row.draft?.colors || !row.published?.colors) return null;
  return row;
}

function proxyPath(url: string | null) {
  if (!url) return null;
  try {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const parsed = new URL(url);
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return null;
  }
  return url.startsWith("/") ? url : `/${url}`;
}

async function fileBase64(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function validateFile(file: File) {
  if (BLOCKED.test(file.name) || !ALLOWED.test(file.name)) return t("نوع الملف غير مسموح.");
  if (file.size > MAX_BYTES) return t("حجم الملف أكبر من الحد المسموح.");
  return null;
}

function hexOr(value: string, fallback: string) {
  return HEX.test(value) ? value.toUpperCase() : fallback;
}

const APP_TABS: { id: AppIdentity; label: string }[] = [
  { id: "customer", label: "تطبيق الزبون" },
  { id: "driver", label: "تطبيق السائق" },
];

export function BrandingScreen() {
  const [app, setApp] = useState<AppIdentity>("customer");
  return (
    <div className="grid gap-6">
      <PageTitle
        title={t("هوية التطبيق")}
        hint={t("هوية الزبون منفصلة عن هوية السائق. اختر التطبيق ثم عدّل الشعار والألوان والسبلاش ثم انشر.")}
      />
      <div className="flex flex-wrap gap-2">
        {APP_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={app === tab.id ? btnPrimary : btnGhost}
            onClick={() => setApp(tab.id)}
          >
            {t(tab.label)}
          </button>
        ))}
      </div>
      <BrandingEditor key={app} app={app} />
    </div>
  );
}

function BrandingEditor({ app }: { app: AppIdentity }) {
  const call = useGo();
  const query = useGoRecord("/admin/config/branding", true, { app });
  const data = asBranding(query.data);
  const draft = data?.draft;
  const [primary, setPrimary] = useState("#313193");
  const [secondary, setSecondary] = useState("#25C5D1");
  const [background, setBackground] = useState("#FFFFFF");
  const [animationType, setAnimationType] = useState("none");
  const [duration, setDuration] = useState(2500);
  const [animationEnabled, setAnimationEnabled] = useState(false);
  const [androidIcon, setAndroidIcon] = useState("icon_01");
  const [iosIcon, setIosIcon] = useState("icon_01");
  const [busy, setBusy] = useState(false);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("splash");
  const appQuery = { app };

  useEffect(() => {
    if (!draft) return;
    setPrimary(draft.colors.primary);
    setSecondary(draft.colors.secondary);
    setBackground(draft.colors.background);
    setAnimationType(draft.splash.animation_type);
    setDuration(draft.splash.duration_ms);
    setAnimationEnabled(draft.splash.animation_enabled);
    setAndroidIcon(draft.app_icon.android);
    setIosIcon(draft.app_icon.ios);
  }, [draft]);

  async function saveDraft() {
    setBusy(true);
    await call("/admin/config/branding", {
      method: "PATCH",
      idempotent: true,
      query: appQuery,
      body: {
        primary_color: hexOr(primary, "#313193"),
        secondary_color: hexOr(secondary, "#25C5D1"),
        background_color: hexOr(background, "#FFFFFF"),
        splash_animation_type: animationType,
        splash_duration_ms: duration,
        splash_animation_enabled: animationEnabled,
        selected_android_icon: androidIcon,
        selected_ios_icon: iosIcon,
      },
    });
    setBusy(false);
  }

  async function publish() {
    setBusy(true);
    await saveDraft();
    await call("/admin/config/branding/publish", { method: "POST", idempotent: true, query: appQuery, body: {} });
    setBusy(false);
  }

  async function upload(slot: string, file: File) {
    const error = validateFile(file);
    if (error) return error;
    setBusy(true);
    await call("/admin/config/branding/upload", {
      method: "POST",
      idempotent: true,
      query: appQuery,
      body: { slot, filename: file.name, data_base64: await fileBase64(file) },
    });
    setBusy(false);
    return null;
  }

  function clearSlot(slot: string) {
    return call("/admin/config/branding", { method: "PATCH", idempotent: true, query: appQuery, body: { clear_slot: slot } });
  }

  if (query.isLoading) return <StateView loading>{null}</StateView>;
  if (!data || !draft) return <StateView error={query.error ?? t("تعذّر تحميل هوية التطبيق")}>{null}</StateView>;

  const icons = data.available_icons ?? [];
  const selectedIcon = icons.find((icon) => icon.id === androidIcon) ?? icons[0];
  const splashMedia = animationEnabled
    ? animationType === "gif" || animationType === "lottie" || animationType === "image"
      ? draft.splash.animation_url ?? draft.splash.image_url
      : draft.splash.image_url
    : draft.splash.image_url;
  const logoSlot = SLOTS.find((slot) => slot.id === "logo")!;
  const topSlots = SLOTS.filter((slot) => slot.group === "tops");
  const appLabel = app === "customer" ? t("تطبيق الزبون") : t("تطبيق السائق");

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-heading">{appLabel}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-medium text-muted">
            {t("النسخة المنشورة")} {data.version}
          </span>
          <button className={btnGhost} disabled={busy} type="button" onClick={() => void saveDraft()}>{t("حفظ المسودة")}</button>
          <button className={btnDark} disabled={busy} type="button" onClick={() => void publish()}>{t("نشر التغييرات")}</button>
        </div>
      </div>
      {data.unpublished_changes ? <Notice>{t("هناك تغييرات غير منشورة. التطبيقات تستخدم آخر نسخة منشورة حتى تضغط نشر.")}</Notice> : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-6">
          <Panel>
            <PanelHeader title={t("المظهر")} hint={t("الألوان والشعار والزينة المشتركة تظهر فوراً في المعاينة")} />
            <div className="grid gap-6 p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <ColorField label={t("اللون الأساسي")} value={primary} onChange={setPrimary} />
                <ColorField label={t("اللون الثانوي")} value={secondary} onChange={setSecondary} />
                <ColorField label={t("لون الخلفية")} value={background} onChange={setBackground} />
              </div>
              <div className="overflow-hidden rounded-2xl border border-line">
                <div className="h-16" style={{ background: `linear-gradient(105deg, ${primary} 0%, ${secondary} 100%)` }} />
                <div className="flex flex-wrap items-center gap-3 bg-surface p-4">
                  <span className="grid size-11 place-items-center rounded-xl text-sm font-bold text-white shadow-card" style={{ background: primary }}>B</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-heading">{t("شريط التطبيق")}</p>
                    <p className="text-xs text-muted">{t("معاينة سريعة للألوان على الواجهة")}</p>
                  </div>
                  <span className="h-8 rounded-full px-4 text-xs font-semibold leading-8 text-white" style={{ background: secondary }}>{t("إجراء")}</span>
                </div>
              </div>
              <AssetDrop slot={logoSlot} currentUrl={draft.logo_url} busy={busy} onUpload={upload} onClear={() => void clearSlot("logo")} />
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title={t("زينة أعلى الشاشات")}
              hint={t("كل شاشة لها ملف منفصل: تسجيل الدخول · الرئيسية · حسابي")}
            />
            <div className="grid gap-4 p-5">
              <Notice>
                {t("ارفع زينة مستقلة لكل شاشة. المسح + النشر يزيل الزينة من تلك الشاشة فقط.")}
              </Notice>
              <div className="grid gap-4 md:grid-cols-3">
                {topSlots.map((slot) => {
                  const url =
                    slot.id === "login_top"
                      ? draft.login_top_url
                      : slot.id === "home_top"
                        ? draft.home_top_url
                        : draft.account_top_url;
                  return (
                    <AssetDrop
                      key={slot.id}
                      slot={slot}
                      currentUrl={url ?? null}
                      busy={busy}
                      onUpload={upload}
                      onClear={() => void clearSlot(slot.id)}
                    />
                  );
                })}
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title={t("شاشة الافتتاح")} hint={t("تُعرض كاملة على الشاشة في التطبيق. إن لم يُرفع ملف، يظهر السبلاش الافتراضي.")} />
            <div className="grid gap-6 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-canvas/60 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-heading">{t("تفعيل حركة الافتتاح")}</p>
                  <p className="text-xs text-muted">{t("عند الإيقاف تُعرض صورة الافتتاح كاملة إن وُجدت")}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={animationEnabled}
                  onClick={() => setAnimationEnabled((value) => !value)}
                  className={`relative h-7 w-12 rounded-full transition ${animationEnabled ? "bg-teal" : "bg-line-strong"}`}
                >
                  <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow-card transition ${animationEnabled ? "start-5" : "start-0.5"}`} />
                </button>
              </div>
              <div>
                <p className="mb-2 text-[13px] font-medium text-body">{t("نوع الحركة")}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {ANIMATION_TYPES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setAnimationType(item.id)}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${animationType === item.id ? "border-brand bg-brand/10 text-heading ring-2 ring-brand/25" : "border-line bg-surface text-body hover:border-teal/40"}`}
                    >
                      {t(item.label)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-[13px] font-medium text-body">
                  <span>{t("مدة العرض")}</span>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{(duration / 1000).toFixed(1)}s</span>
                </div>
                <input
                  className="w-full accent-teal"
                  type="range"
                  min={500}
                  max={8000}
                  step={100}
                  value={duration}
                  onChange={(event) => setDuration(Number(event.target.value))}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {SLOTS.filter((slot) => slot.group === "splash").map((slot) => (
                  <AssetDrop
                    key={slot.id}
                    slot={slot}
                    currentUrl={slot.id === "splash_image" ? draft.splash.image_url : draft.splash.animation_url}
                    busy={busy}
                    onUpload={upload}
                    onClear={() => void clearSlot(slot.id)}
                  />
                ))}
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title={t("الحركات")} hint={t("GIF أو Lottie أو صورة")} />
            <div className="grid gap-4 p-5 md:grid-cols-2">
              {SLOTS.filter((slot) => slot.group === "animations").map((slot) => (
                <AssetDrop
                  key={slot.id}
                  slot={slot}
                  currentUrl={draft.animations[`${slot.id}_url` as keyof BrandingView["animations"]]}
                  busy={busy}
                  onUpload={upload}
                  onClear={() => void clearSlot(slot.id)}
                />
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title={t("أيقونة التطبيق")}
              hint={t("معاينة من public/icon لهذا التطبيق. الاختيار يُرسل كـ id للتطبيق (icon_01 …).")}
            />
            <div className="grid gap-5 p-5">
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-canvas/50 px-4 py-3">
                {selectedIcon ? (
                  <AppIconThumb app={app} icon={selectedIcon} sizeClass="size-12" radiusClass="rounded-[14px]" />
                ) : (
                  <span className="grid size-12 place-items-center rounded-[14px] text-lg font-bold text-white shadow-card" style={{ background: "#313193" }}>01</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-heading">{selectedIcon?.name ?? androidIcon}</p>
                  <p className="text-xs text-muted">{t("الأيقونة الحالية")} · Android · iOS</p>
                </div>
                <button className={btnPrimary} disabled={busy} type="button" onClick={() => void saveDraft()}>{t("حفظ التغييرات")}</button>
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-5">
                {icons.map((icon) => {
                  const selected = androidIcon === icon.id;
                  return (
                    <button
                      key={icon.id}
                      type="button"
                      className={`relative grid gap-2 rounded-2xl border p-3 text-center transition hover:border-teal/40 ${selected ? "border-brand bg-brand/8 ring-2 ring-brand/25" : "border-line bg-surface"}`}
                      onClick={() => {
                        setAndroidIcon(icon.id);
                        setIosIcon(icon.id);
                      }}
                    >
                      {selected ? (
                        <span className="absolute end-2 top-2 grid size-5 place-items-center rounded-full bg-teal text-on-teal">
                          <Icon node={Check} size={12} />
                        </span>
                      ) : null}
                      <AppIconThumb app={app} icon={icon} />
                      <span className="text-[11px] font-medium text-muted">{icon.id}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Panel>
        </div>

        <PhonePreview
          background={background}
          primary={primary}
          secondary={secondary}
          logoUrl={draft.logo_url}
          loginTopUrl={draft.login_top_url ?? null}
          homeTopUrl={draft.home_top_url ?? null}
          accountTopUrl={draft.account_top_url ?? null}
          splashMedia={splashMedia}
          homeMedia={draft.animations.home_url}
          loadingMedia={draft.animations.loading_url}
          tab={previewTab}
          onTab={setPreviewTab}
          icon={selectedIcon}
          duration={duration}
          animationType={animationEnabled ? animationType : "image"}
          version={data.version}
        />
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid content-start gap-2 rounded-2xl border border-line bg-canvas/40 p-3">
      <span className="text-[13px] font-medium text-body">{label}</span>
      <div className="flex items-center gap-2">
        <input
          className="size-11 cursor-pointer rounded-xl border border-line bg-transparent p-1"
          type="color"
          value={HEX.test(value) ? value : "#313193"}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
        <input
          className={inputClass}
          value={value}
          maxLength={7}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
      </div>
    </label>
  );
}

function AssetDrop({
  slot,
  currentUrl,
  busy,
  onUpload,
  onClear,
}: {
  slot: (typeof SLOTS)[number];
  currentUrl: string | null;
  busy: boolean;
  onUpload: (slot: string, file: File) => Promise<string | null>;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  async function take(file: File | undefined) {
    if (!file) return;
    const message = await onUpload(slot.id, file);
    setError(message);
  }

  function drop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setOver(false);
    void take(event.dataTransfer.files[0]);
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-body">{t(slot.label)}</p>
          {slot.affect ? <p className="mt-0.5 text-xs leading-5 text-muted">{t(slot.affect)}</p> : null}
        </div>
        {currentUrl ? (
          <button className={btnGhostSm} type="button" disabled={busy} onClick={onClear}>
            <Icon node={Trash2} size={14} />
            {t("إزالة")}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={`grid min-h-[148px] place-items-center overflow-hidden rounded-2xl border border-dashed p-3 text-start transition ${over ? "border-teal bg-teal/10" : "border-line-strong bg-canvas/50 hover:border-teal/45"}`}
      >
        {currentUrl ? (
          <AuthMedia
            url={currentUrl}
            className={slot.id.endsWith("_top") || slot.id.startsWith("splash_") ? "h-28 w-full max-w-none" : "h-28 w-full max-w-[220px]"}
            fit={slot.id.endsWith("_top") || slot.id.startsWith("splash_") ? "cover" : "contain"}
          />
        ) : (
          <span className="grid justify-items-center gap-2 text-center text-muted">
            <span className="grid size-11 place-items-center rounded-xl bg-surface text-accent">
              <Icon node={over ? Upload : ImagePlus} size={20} />
            </span>
            <span className="text-sm font-medium text-heading">{t("اسحب الملف أو اضغط للاختيار")}</span>
            <span className="text-xs">{t(slot.hint)}</span>
          </span>
        )}
      </button>
      <input ref={input} className="sr-only" type="file" accept={slot.accept} disabled={busy} onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ""; void take(file); }} />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function PhonePreview({
  background,
  primary,
  secondary,
  logoUrl,
  loginTopUrl,
  homeTopUrl,
  accountTopUrl,
  splashMedia,
  homeMedia,
  loadingMedia,
  tab,
  onTab,
  icon,
  duration,
  animationType,
  version,
}: {
  background: string;
  primary: string;
  secondary: string;
  logoUrl: string | null;
  loginTopUrl: string | null;
  homeTopUrl: string | null;
  accountTopUrl: string | null;
  splashMedia: string | null;
  homeMedia: string | null;
  loadingMedia: string | null;
  tab: PreviewTab;
  onTab: (tab: PreviewTab) => void;
  icon?: AppIcon;
  duration: number;
  animationType: string;
  version: number;
}) {
  const tabs: { id: PreviewTab; label: string }[] = [
    { id: "splash", label: "افتتاح" },
    { id: "login", label: "دخول" },
    { id: "home", label: "الرئيسية" },
    { id: "account", label: "حسابي" },
  ];
  const topForTab =
    tab === "login" ? loginTopUrl : tab === "home" ? homeTopUrl : tab === "account" ? accountTopUrl : null;

  return (
    <aside className="xl:sticky xl:top-6">
      <Panel>
        <PanelHeader
          title={t("معاينة مباشرة")}
          hint={t("كل شاشة لها زينة أعلى مستقلة")}
          action={
            <div className="flex flex-wrap rounded-lg border border-line p-0.5">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold ${tab === item.id ? "bg-heading/8 text-heading" : "text-muted"}`}
                  onClick={() => onTab(item.id)}
                >
                  {t(item.label)}
                </button>
              ))}
            </div>
          }
        />
        <div className="grid justify-items-center gap-4 p-5">
          <div className="relative w-[248px] rounded-[36px] bg-heading p-2 shadow-float">
            <div className="overflow-hidden rounded-[28px]" style={{ background }}>
              <div className="relative z-10 flex items-center justify-between px-5 pt-3 text-[10px] font-semibold" style={{ color: tab === "splash" ? "#fff" : primary }}>
                <span>9:41</span>
                <span className={`mx-auto h-4 w-20 rounded-full ${tab === "splash" ? "bg-white/25" : "bg-heading/15"}`} />
                <span>5G</span>
              </div>
              {tab === "splash" ? (
                <div className="relative -mt-7 h-[454px]">
                  {splashMedia ? (
                    <AuthMedia url={splashMedia} className="absolute inset-0 h-full w-full rounded-none" fit="cover" />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_30%_20%,#dbeafe,transparent_45%),linear-gradient(160deg,#0f172a,#1e293b)] px-6">
                      <div className="grid justify-items-center gap-4 text-center">
                        <AuthMedia url={logoUrl} className="h-24 w-24" />
                        <p className="text-sm font-semibold text-white/90">{t("السبلاش الافتراضي")}</p>
                      </div>
                    </div>
                  )}
                  <p className="absolute inset-x-0 bottom-5 text-center text-[10px] font-medium text-white/80 drop-shadow">
                    v{version} · {(duration / 1000).toFixed(1)}s · {animationType}
                  </p>
                </div>
              ) : (
                <div className="grid h-[430px] grid-rows-[auto_1fr_auto]">
                  <div className="relative">
                    {topForTab ? (
                      <AuthMedia url={topForTab} className="h-16 w-full rounded-none" fit="cover" />
                    ) : (
                      <div className="h-10 bg-transparent" />
                    )}
                    {tab !== "account" ? (
                      <div className="flex justify-center px-4 pb-2 pt-1">
                        <AuthMedia url={logoUrl} className="h-14 w-14" />
                      </div>
                    ) : (
                      <div className="px-4 pb-2 pt-1">
                        <p className="text-center text-sm font-semibold text-heading">{t("حسابي")}</p>
                      </div>
                    )}
                  </div>
                  <div className="grid content-start gap-3 px-5 pt-2">
                    {tab === "login" ? (
                      <>
                        <div className="h-10 rounded-xl border border-line bg-surface/80" />
                        <div className="h-10 rounded-xl border border-line bg-surface/80" />
                        <span className="mt-2 h-10 rounded-xl text-center text-xs font-semibold leading-10 text-white" style={{ background: primary }}>{t("تسجيل الدخول")}</span>
                      </>
                    ) : null}
                    {tab === "home" ? (
                      <div className="grid place-items-center pt-4">
                        <AuthMedia url={homeMedia} className="h-20 w-20" />
                        <div className="mt-4 h-2 w-28 rounded-full bg-heading/10" />
                        <div className="mt-2 h-2 w-20 rounded-full bg-heading/8" />
                        {loadingMedia ? <div className="mt-4"><AuthMedia url={loadingMedia} className="h-10 w-10" /></div> : <Icon node={LoaderCircle} size={20} className="mt-4 animate-spin text-muted" />}
                      </div>
                    ) : null}
                    {tab === "account" ? (
                      <div className="grid gap-2 pt-2">
                        <div className="h-12 rounded-xl border border-line bg-surface/70" />
                        <div className="h-12 rounded-xl border border-line bg-surface/70" />
                        <div className="h-12 rounded-xl border border-line bg-surface/70" />
                        <p className="pt-2 text-center text-[10px] text-muted">{t("حسابي بدون لوجو كبير — زينته من account_top")}</p>
                      </div>
                    ) : null}
                  </div>
                  {tab !== "login" ? (
                    <div className="flex justify-around border-t border-line px-2 py-3 text-[10px] text-muted">
                      <span style={{ color: tab === "home" ? primary : undefined }}>{t("الرئيسية")}</span>
                      <span>{t("الرحلات")}</span>
                      <span style={{ color: tab === "account" ? primary : undefined }}>{t("حسابي")}</span>
                    </div>
                  ) : (
                    <div className="pb-4" />
                  )}
                </div>
              )}
            </div>
            <span className="absolute inset-x-0 bottom-3 mx-auto h-1 w-24 rounded-full bg-white/35" />
          </div>
          <div className="flex flex-wrap justify-center gap-2 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1"><Icon node={Palette} size={12} /> {primary}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1"><Icon node={Sparkles} size={12} /> {animationType}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1"><Icon node={MonitorSmartphone} size={12} /> {icon?.id ?? "icon_01"}</span>
          </div>
        </div>
      </Panel>
    </aside>
  );
}

function AuthMedia({
  url,
  className = "h-24 w-24",
  fit = "contain",
}: {
  url: string | null;
  className?: string;
  fit?: "contain" | "cover";
}) {
  const path = proxyPath(url);
  const blob = useAuthObject(path);
  if (!path) return <div className={`${className} rounded-xl border border-dashed border-line bg-surface/40`} />;
  if (blob?.kind === "lottie") return <LottieBox data={blob.json} className={className} />;
  if (blob?.kind === "object") {
    return <img src={blob.src} alt="" className={`${className} rounded-xl ${fit === "cover" ? "object-cover" : "object-contain"}`} />;
  }
  return <div className={`${className} animate-pulse rounded-xl bg-heading/8`} />;
}

function useAuthObject(path: string | null) {
  const [blob, setBlob] = useState<{ kind: "object"; src: string } | { kind: "lottie"; json: object } | null>(null);
  useEffect(() => {
    if (!path) {
      setBlob(null);
      return;
    }
    const session = readSession();
    if (!session) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    void fetch(`/api/proxy${path}`, { headers: { Authorization: `Bearer ${session.accessToken}` } })
      .then(async (response) => {
        if (!response.ok) return;
        const type = response.headers.get("content-type") ?? "";
        if (type.includes("json")) {
          const json = (await response.json()) as object;
          if (!cancelled) setBlob({ kind: "lottie", json });
          return;
        }
        objectUrl = URL.createObjectURL(await response.blob());
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setBlob({ kind: "object", src: objectUrl });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return blob;
}

function LottieBox({ data, className }: { data: object; className: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let destroyed = false;
    let anim: { destroy: () => void } | undefined;
    void import("lottie-web").then((mod) => {
      if (destroyed || !host.current) return;
      host.current.replaceChildren();
      anim = mod.default.loadAnimation({
        container: host.current,
        renderer: "svg",
        loop: true,
        autoplay: true,
        animationData: data,
      });
    });
    return () => {
      destroyed = true;
      anim?.destroy();
    };
  }, [data]);
  return <div ref={host} className={`${className} overflow-hidden rounded-xl`} />;
}
