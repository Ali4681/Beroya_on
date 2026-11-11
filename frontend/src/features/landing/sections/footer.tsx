import { Mail } from "lucide";
import type { ReactNode } from "react";

import { site } from "@/core/config/site";
import { cx } from "@/shared/lib/cx";
import { formatNumber } from "@/shared/lib/format";
import { ThemeToggle } from "@/shared/theme/theme-toggle";
import { Icon } from "@/shared/ui/icon";
import { Tooltip } from "@/shared/ui/tooltip";

import { LanguageSwitch } from "../client/language-switch";
import { SupportContactActions } from "../client/support-contact-actions";
import { Logo } from "../components/logo";
import { StoreButtons } from "../components/store-buttons";
import type { SectionProps } from "../types";

type FooterLink = { label: string; href: string | null };

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="18" height="18" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M13.6 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.9v3h2.6V21h3.1Z" />
    </svg>
  );
}

function SoonTag({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold text-muted ring-1 ring-line">{children}</span>;
}

function FooterColumn({ title, links, soon }: { title: string; links: FooterLink[]; soon: string }) {
  return (
    <nav aria-label={title}>
      <h3 className="text-sm font-semibold text-heading">{title}</h3>
      <ul className="mt-5 grid gap-3.5 text-sm">
        {links.map((link) => (
          <li key={link.label}>
            {link.href ? (
              <a
                href={link.href}
                {...(link.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="text-muted transition hover:text-heading"
              >
                {link.label}
              </a>
            ) : (
              <span className="inline-flex items-center gap-2 text-muted/80">
                {link.label}
                <SoonTag>{soon}</SoonTag>
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SocialLink({ href, label, soon, children }: { href: string | null; label: string; soon: string; children: ReactNode }) {
  const className = cx(
    "grid size-10 place-items-center rounded-full border border-line text-heading transition",
    href ? "hover:border-line-strong hover:bg-surface-2" : "cursor-default opacity-50",
  );

  if (!href) {
    const hint = `${label} · ${soon}`;
    return (
      <Tooltip label={hint}>
        <span className={className}>
          {children}
          <span className="sr-only">{hint}</span>
        </span>
      </Tooltip>
    );
  }

  return (
    <Tooltip label={label}>
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={className}>
        {children}
      </a>
    </Tooltip>
  );
}

export function Footer({ dict, locale, support }: SectionProps) {
  const { footer, common } = dict;
  const { columns } = footer;
  const { instagram, facebook } = site.links;
  const year = formatNumber(new Date().getFullYear(), locale, { useGrouping: false });
  const email = support.email.trim();

  return (
    <footer className="border-t border-line bg-surface">
      <div className="shell grid grid-cols-2 gap-x-6 gap-y-12 py-16 sm:py-20 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] lg:gap-10">
        <div className="col-span-2 lg:col-span-1 lg:max-w-sm">
          <Logo />
          <p className="mt-5 text-sm leading-7 text-muted">{footer.tagline}</p>
          <StoreButtons common={common} className="mt-7" />
        </div>

        <FooterColumn title={site.name} links={columns.brand} soon={common.soon} />
        <FooterColumn title={columns.servicesTitle} links={columns.services} soon={common.soon} />
        <FooterColumn
          title={columns.legalTitle}
          links={columns.legal.map((link) => {
            const raw = site.links[link.key];
            const href =
              !raw ? null : raw.startsWith("http") ? raw : `/${locale}${raw.startsWith("/") ? raw : `/${raw}`}`;
            return { label: link.label, href };
          })}
          soon={common.soon}
        />

        <div>
          <h3 className="text-sm font-semibold text-heading">{columns.contactTitle}</h3>
          <ul className="mt-5 grid gap-3.5 text-sm">
            <li>
              <SupportContactActions
                support={support}
                label={columns.support}
                labels={{
                  title: columns.chooseTitle,
                  call: columns.call,
                  whatsapp: columns.whatsapp,
                  soon: common.soon,
                }}
              />
            </li>
            {email ? (
              <li>
                <a href={`mailto:${email}`} className="inline-flex items-center gap-2 text-muted transition hover:text-heading">
                  <Icon node={Mail} size={16} />
                  {email}
                </a>
              </li>
            ) : null}
          </ul>
          <h3 className="mt-8 text-sm font-semibold text-heading">{columns.social}</h3>
          <div className="mt-4 flex gap-2">
            <SocialLink href={instagram} label="Instagram" soon={common.soon}>
              <InstagramIcon />
            </SocialLink>
            <SocialLink href={facebook} label="Facebook" soon={common.soon}>
              <FacebookIcon />
            </SocialLink>
          </div>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="shell flex flex-col-reverse items-center justify-between gap-4 py-6 text-[13px] text-muted sm:flex-row">
          <p>
            © {year} {site.name}. {footer.rights}
          </p>
          <div className="flex items-center gap-2">
            <LanguageSwitch target={locale === "ar" ? "en" : "ar"} label={dict.language.label} title={dict.language.title} />
            <ThemeToggle label={dict.a11y.theme} />
          </div>
        </div>
      </div>
    </footer>
  );
}
