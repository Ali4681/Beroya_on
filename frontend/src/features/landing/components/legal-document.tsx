import Link from "next/link";

import { site } from "@/core/config/site";
import type { Locale } from "@/core/i18n/config";
import { ThemeToggle } from "@/shared/theme/theme-toggle";

import { LanguageSwitch } from "../client/language-switch";
import { Logo } from "./logo";

type LegalSection = { title: string; body: string };

export type LegalDocBody = {
  title: string;
  effective: string;
  intro: string;
  sections: LegalSection[];
  steps?: LegalSection[];
  stepsTitle?: string;
  notice?: string;
};

type LegalVersion = {
  lang: Locale;
  label: string;
  doc: LegalDocBody;
};

type LegalDocumentProps = {
  locale: Locale;
  backLabel: string;
  themeLabel: string;
  langSwitchLabel: string;
  langSwitchTitle: string;
  tocLabel: string;
  relatedLabel: string;
  /** Ordered versions — Arabic first, then English. */
  versions: LegalVersion[];
  related: { label: string; href: string }[];
  path: string;
};

function pad(index: number) {
  return String(index + 1).padStart(2, "0");
}

function LegalVersionBlock({
  version,
  showDivider,
}: {
  version: LegalVersion;
  showDivider: boolean;
}) {
  const { lang, label, doc } = version;
  const dir = lang === "ar" ? "rtl" : "ltr";
  const prefix = lang;

  return (
    <div
      lang={lang}
      dir={dir}
      className={showDivider ? "mt-16 border-t border-line pt-14" : undefined}
    >
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-accent">
          {label}
        </span>
        <span className="text-sm text-muted">{doc.effective}</span>
      </div>

      <h2
        id={`${prefix}-title`}
        className="text-[1.85rem] font-semibold leading-[1.2] text-balance text-heading sm:text-[2.25rem] ltr:tracking-tight rtl:leading-[1.3]"
      >
        {doc.title}
      </h2>
      <p className="mt-5 max-w-2xl text-base leading-8 text-body sm:text-[1.05rem] sm:leading-8">{doc.intro}</p>

      {doc.notice ? (
        <aside className="mt-8 rounded-2xl border border-warning/35 bg-warning/[0.08] px-4 py-4 text-sm leading-7 text-body sm:px-5">
          <p className="font-medium text-warning-ink">{doc.notice}</p>
        </aside>
      ) : null}

      {doc.steps && doc.steps.length > 0 ? (
        <section className="mt-12" aria-labelledby={`${prefix}-steps-title`}>
          {doc.stepsTitle ? (
            <h3 id={`${prefix}-steps-title`} className="text-lg font-semibold text-heading">
              {doc.stepsTitle}
            </h3>
          ) : null}
          <ol className="mt-6 grid gap-0">
            {doc.steps.map((step, index) => (
              <li
                key={`${prefix}-step-${index}`}
                className="relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-4 pb-8 last:pb-0"
              >
                {index < doc.steps!.length - 1 ? (
                  <span aria-hidden className="absolute start-[1.05rem] top-9 bottom-0 w-px bg-line" />
                ) : null}
                <span className="relative z-[1] grid size-9 place-items-center rounded-full bg-teal text-[12px] font-semibold text-on-teal tabular-nums shadow-[0_0_0_4px_color-mix(in_oklab,var(--bg)_88%,transparent)]">
                  {index + 1}
                </span>
                <div className="min-w-0 pt-1">
                  <h4 className="text-[15px] font-semibold text-heading">{step.title}</h4>
                  <p className="mt-2 text-[15px] leading-7 text-body">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="mt-14 grid gap-0">
        {doc.sections.map((section, index) => (
          <section
            key={`${prefix}-section-${index}`}
            id={`${prefix}-section-${index + 1}`}
            className="scroll-mt-28 border-t border-line py-9 first:border-t-0 first:pt-0"
          >
            <div className="grid gap-3 sm:grid-cols-[3.25rem_minmax(0,1fr)] sm:gap-6">
              <p className="text-[13px] font-semibold tabular-nums text-accent">{pad(index)}</p>
              <div className="min-w-0">
                <h3 className="text-xl font-semibold leading-snug text-heading">{section.title}</h3>
                <p className="mt-3 text-[15px] leading-8 text-body sm:text-base sm:leading-8">{section.body}</p>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function LegalDocument({
  locale,
  backLabel,
  themeLabel,
  langSwitchLabel,
  langSwitchTitle,
  tocLabel,
  relatedLabel,
  versions,
  related,
  path,
}: LegalDocumentProps) {
  const otherLocale: Locale = locale === "ar" ? "en" : "ar";
  const primary = versions[0];

  return (
    <main className="relative min-h-dvh overflow-x-clip bg-canvas text-body">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(42rem_22rem_at_85%_-4rem,color-mix(in_oklab,var(--brand)_22%,transparent),transparent_70%),radial-gradient(28rem_18rem_at_10%_0,color-mix(in_oklab,var(--teal)_14%,transparent),transparent_65%)]"
      />

      <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href={`/${locale}`} className="rounded-full" aria-label={backLabel}>
            <Logo />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href={`/${locale}`}
              className="hidden text-sm text-muted transition hover:text-heading sm:inline"
            >
              {backLabel}
            </Link>
            <LanguageSwitch
              target={otherLocale}
              label={langSwitchLabel}
              title={langSwitchTitle}
              path={path}
            />
            <ThemeToggle label={themeLabel} />
          </div>
        </div>
      </header>

      <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14 xl:grid-cols-[16rem_minmax(0,42rem)_1fr]">
        <aside className="hidden lg:block">
          <nav aria-label={tocLabel} className="sticky top-28 max-h-[calc(100dvh-8rem)] overflow-y-auto pe-2">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">{tocLabel}</p>
            <div className="mt-5 grid gap-6">
              {versions.map((version) => (
                <div key={version.lang} lang={version.lang} dir={version.lang === "ar" ? "rtl" : "ltr"}>
                  <a
                    href={`#${version.lang}-title`}
                    className="text-[11px] font-semibold tracking-wide text-accent transition hover:text-brand-strong"
                  >
                    {version.label}
                  </a>
                  <ol className="mt-3 grid gap-1 border-s border-line ps-4">
                    {version.doc.sections.map((section, index) => (
                      <li key={`${version.lang}-toc-${index}`}>
                        <a
                          href={`#${version.lang}-section-${index + 1}`}
                          className="group flex gap-2.5 py-1.5 text-sm leading-5 text-muted transition hover:text-heading"
                        >
                          <span className="tabular-nums text-[11px] text-muted/70 group-hover:text-accent">
                            {pad(index)}
                          </span>
                          <span className="min-w-0">{section.title}</span>
                        </a>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </nav>
        </aside>

        <article className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-[11px] font-semibold tracking-wide text-muted">
              <span aria-hidden className="size-1.5 rounded-full bg-brand" />
              {site.name}
            </span>
            <span className="text-sm text-muted">العربية · English</span>
          </div>

          {primary ? (
            <h1 className="mt-6 text-[2.15rem] font-semibold leading-[1.2] text-balance text-heading sm:text-[2.75rem]">
              <span lang="ar" dir="rtl" className="block">
                {primary.doc.title}
              </span>
              {versions[1] ? (
                <span lang="en" dir="ltr" className="mt-2 block text-[1.35rem] font-semibold tracking-tight text-muted sm:text-[1.55rem]">
                  {versions[1].doc.title}
                </span>
              ) : null}
            </h1>
          ) : null}

          {versions.map((version, index) => (
            <LegalVersionBlock key={version.lang} version={version} showDivider={index > 0} />
          ))}

          {related.length > 0 ? (
            <footer className="mt-6 border-t border-line pt-10">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">{relatedLabel}</p>
              <ul className="mt-4 flex flex-wrap gap-2.5">
                {related.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="inline-flex items-center rounded-full border border-line bg-surface/80 px-3.5 py-2 text-sm font-medium text-heading transition hover:border-teal/45 hover:bg-teal/5"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </footer>
          ) : null}
        </article>
      </div>
    </main>
  );
}
