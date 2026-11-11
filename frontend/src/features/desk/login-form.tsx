"use client";

import { Eye, EyeOff, Headphones, LockKeyhole, Mail, MessageCircle, Phone } from "lucide";
import type { IconNode } from "lucide";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";

import { useDesk } from "@/features/desk/desk-context";
import { go, GoApiError } from "@/features/desk/go-api";
import { t } from "@/features/desk/i18n/t";
import { DeskLocaleSwitch } from "@/features/desk/locale-switch";
import { canOpen } from "@/features/desk/nav";
import { deskReturnPath, homeFor, isStaffRole, isStoreOperator, readSession, writeSession, type StaffRole, type StaffUser } from "@/features/desk/session";
import { goFailure } from "@/features/desk/hooks";
import { BrandMark, btnGhost, btnIcon, DeskForm, Field, inputBase } from "@/features/desk/ui";
import { Icon } from "@/shared/ui/icon";
import { ThemeToggle } from "@/shared/theme/theme-toggle";

export type SupportInfo = {
  phone: string;
  whatsapp: string;
  email: string;
};

function supportFromPayload(info: {
  support_phone?: string | null;
  support_whatsapp?: string | null;
  support_email?: string | null;
}): SupportInfo {
  return {
    phone: typeof info.support_phone === "string" ? info.support_phone.trim() : "",
    whatsapp: typeof info.support_whatsapp === "string" ? info.support_whatsapp.trim() : "",
    email: typeof info.support_email === "string" ? info.support_email.trim() : "",
  };
}

function telHref(phone: string) {
  const trimmed = phone.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "";
}

function whatsappHref(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed) || /^wa\.me\//i.test(trimmed)) {
    return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
  }
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "";
}

type LoginResponse = {
  access_token: string;
  refresh_token: string;
  user: StaffUser;
};

function landingFor(role: StaffRole) {
  const next = deskReturnPath(new URLSearchParams(window.location.search).get("next"));
  const path = next?.split(/[?#]/)[0] ?? "";
  return next && canOpen(role, path) ? next : homeFor(role);
}

function SupportContact({
  icon,
  value,
  href,
  external = false,
}: {
  icon: IconNode;
  value: string;
  href: string;
  external?: boolean;
}) {
  return (
    <a
      className="desk-login-support-link"
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
    >
      <Icon node={icon} size={14} />
      <span className="desk-ltr-num" dir="ltr">
        {value}
      </span>
    </a>
  );
}

export function LoginForm({ initialSupport }: { initialSupport?: SupportInfo }) {
  const router = useRouter();
  const { setSession, locale, setLocale } = useDesk();
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [support, setSupport] = useState<SupportInfo>(
    initialSupport ?? { phone: "", whatsapp: "", email: "" },
  );

  useEffect(() => {
    const existing = readSession();
    if (!existing) return;
    writeSession(existing);
    setSession(existing);
    router.replace(landingFor(existing.user.role));
  }, [router, setSession]);

  useEffect(() => {
    // Keep contacts fresh after settings changes; SSR already painted initialSupport.
    let alive = true;
    let attempt = 0;
    const load = () => {
      void go<{
        support_phone?: string | null;
        support_whatsapp?: string | null;
        support_email?: string | null;
      }>("/app/info", { auth: false, query: { app: "customer" } })
        .then((info) => {
          if (!alive) return;
          setSupport(supportFromPayload(info));
        })
        .catch(() => {
          if (!alive || attempt >= 2) return;
          attempt += 1;
          window.setTimeout(load, 600 * attempt);
        });
    };
    load();
    return () => {
      alive = false;
    };
  }, []);

  async function onSubmit(form: FormData) {
    setPending(true);
    try {
      const data = await go<LoginResponse>("/auth/staff/login", {
        method: "POST",
        auth: false,
        body: {
          identifier: String(form.get("identifier") ?? ""),
          password: String(form.get("password") ?? ""),
          platform: "WEB",
          device_name: "Beroya On Web",
        },
      });
      if (!isStaffRole(data.user.role)) {
        const message = t("هذا الحساب ليس حساب موظف.");
        return goFailure(message, { identifier: message });
      }
      const session = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        user: data.user,
      };
      writeSession(session);
      setSession(session);
      if (
        !isStoreOperator(data.user.role) &&
        typeof Notification !== "undefined" &&
        Notification.permission === "default"
      ) {
        try {
          await Notification.requestPermission();
        } catch {
          /* browser may block; desk still works */
        }
      }
      router.replace(landingFor(data.user.role));
    } catch (cause) {
      const message = cause instanceof GoApiError ? cause.message : t("تعذّر تسجيل الدخول");
      const fields = cause instanceof GoApiError && Object.keys(cause.fields).length ? cause.fields : { password: message };
      return goFailure(message, fields);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="desk-login relative grid min-h-dvh overflow-hidden lg:grid-cols-[minmax(22rem,0.92fr)_minmax(0,1.08fr)]">
      <section className="desk-brand desk-login-brand relative hidden overflow-hidden p-10 lg:flex lg:flex-col lg:justify-between">
        <div className="desk-login-aurora" aria-hidden>
          <span className="desk-login-orb desk-login-orb-a" />
          <span className="desk-login-orb desk-login-orb-b" />
          <span className="desk-login-orb desk-login-orb-c" />
        </div>
        <svg className="desk-login-routes" viewBox="0 0 640 720" aria-hidden preserveAspectRatio="xMidYMid slice">
          <path className="desk-login-route desk-login-route-a" d="M80 640 C140 520, 220 480, 300 360 S460 220, 560 80" />
          <path className="desk-login-route desk-login-route-b" d="M40 520 C160 440, 210 360, 310 280 S470 160, 600 120" />
          <circle className="desk-login-node" cx="300" cy="360" r="5" />
          <circle className="desk-login-node desk-login-node-delay" cx="470" cy="220" r="4" />
          <circle className="desk-login-node desk-login-node-soft" cx="560" cy="80" r="6" />
        </svg>

        <div className="desk-login-reveal relative z-10" style={{ "--desk-login-delay": "40ms" } as CSSProperties}>
          <BrandMark size="lg" className="h-10 text-white drop-shadow-[0_12px_30px_rgb(0_0_0/0.28)]" />
        </div>

        <div className="relative z-10 max-w-lg">
          <p
            className="desk-login-reveal inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-[11px] font-semibold tracking-wide text-brand backdrop-blur-md"
            style={{ "--desk-login-delay": "120ms" } as CSSProperties}
          >
            <span aria-hidden className="size-1.5 rounded-full bg-brand shadow-[0_0_12px_var(--brand)]" />
            {t("التشغيل والمالية والإدارة")}
          </p>
          <p
            className="desk-login-reveal mt-6 text-[2.65rem] font-semibold leading-[1.15] tracking-tight text-white"
            style={{ "--desk-login-delay": "200ms" } as CSSProperties}
          >
            {t("لوحة واحدة للرحلات والسائقين والعملاء والفروع.")}
          </p>
          <p
            className="desk-login-reveal mt-5 max-w-md text-sm leading-7 text-white/65"
            style={{ "--desk-login-delay": "280ms" } as CSSProperties}
          >
            {t("استخدم بريد أو هاتف حساب الموظف.")}
          </p>
        </div>

        <p className="desk-login-reveal relative z-10 text-xs font-medium tracking-[0.22em] text-white/40" style={{ "--desk-login-delay": "360ms" } as CSSProperties}>
          Beroya
        </p>
      </section>

      <section className="desk-login-stage relative grid place-items-center px-4 py-10">
        <div className="desk-login-stage-glow" aria-hidden />
        <div className="absolute end-4 top-4 z-20 flex items-center gap-2">
          <ThemeToggle label={t("المظهر")} buttonClassName={`${btnIcon} backdrop-blur-md`} />
          <DeskLocaleSwitch locale={locale} onChange={setLocale} />
        </div>

        <DeskForm
          action={onSubmit}
          className="desk-login-card desk-login-reveal relative grid w-full max-w-[26rem] gap-5 p-7 sm:p-8"
          style={{ "--desk-login-delay": "80ms" } as CSSProperties}
        >
          <div className="lg:hidden">
            <BrandMark className="h-8" />
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wide text-accent">{t("التشغيل والمالية والإدارة")}</p>
            <h1 className="mt-1.5 text-[1.75rem] font-semibold tracking-tight text-heading">{t("دخول الموظفين")}</h1>
            <p className="mt-2 text-sm leading-6 text-muted">{t("استخدم بريد أو هاتف حساب الموظف.")}</p>
          </div>

          <Field label={t("البريد أو الهاتف")}>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 start-3.5 grid place-items-center text-muted">
                <Icon node={Mail} size={16} />
              </span>
              <input
                className={`${inputBase} pe-3.5 ps-10`}
                name="identifier"
                autoComplete="username"
                required
                placeholder="superadmin@beroyaon.com"
              />
            </div>
          </Field>

          <Field label={t("كلمة المرور")}>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 start-3.5 grid place-items-center text-muted">
                <Icon node={LockKeyhole} size={16} />
              </span>
              <input
                className={`${inputBase} pe-11 ps-10`}
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="absolute inset-y-0 end-1.5 grid w-9 place-items-center rounded-md text-muted transition-colors hover:bg-heading/5 hover:text-heading"
                aria-label={showPassword ? t("إخفاء كلمة المرور") : t("إظهار كلمة المرور")}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
              >
                <Icon node={showPassword ? EyeOff : Eye} size={16} />
              </button>
            </div>
          </Field>

          <button className="desk-login-submit inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-teal text-sm font-semibold text-on-teal shadow-glow transition-[transform,background-color,box-shadow] duration-300 hover:bg-teal-strong hover:shadow-[0_14px_36px_-12px_color-mix(in_oklab,var(--brand)_55%,transparent)] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-55" disabled={pending} type="submit">
            <span className="relative z-10">{pending ? t("جارٍ الدخول…") : t("دخول إلى اللوحة")}</span>
          </button>

          <a
            className={`${btnGhost} h-auto justify-center border-0 bg-transparent py-0 text-accent hover:bg-transparent hover:text-brand-strong`}
            href={locale === "en" ? "/en" : "/ar"}
          >
            {t("العودة إلى الصفحة العامة")}
          </a>

          {support.phone || support.whatsapp || support.email ? (
            <div className="desk-login-support">
              <p className="desk-login-support-title">
                <Icon node={Headphones} size={12} />
                {t("الدعم الفني")}
              </p>
              <div className="desk-login-support-list">
                {support.phone ? (
                  <SupportContact icon={Phone} value={support.phone} href={telHref(support.phone)} />
                ) : null}
                {support.whatsapp ? (
                  <SupportContact
                    icon={MessageCircle}
                    value={support.whatsapp}
                    href={whatsappHref(support.whatsapp)}
                    external
                  />
                ) : null}
                {support.email ? (
                  <SupportContact icon={Mail} value={support.email} href={`mailto:${support.email}`} />
                ) : null}
              </div>
            </div>
          ) : null}
        </DeskForm>
      </section>
    </main>
  );
}
