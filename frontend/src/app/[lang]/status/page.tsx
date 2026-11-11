import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AppProviders } from "@/app/providers";
import { getServerEnv } from "@/core/config/server-env";
import { isLocale } from "@/core/i18n/config";
import { getDictionary } from "@/core/i18n/dictionaries";
import { BackendStatusCard } from "@/features/health/components/backend-status-card";
import { statusCopy } from "@/features/health/copy";
import { Logo } from "@/features/landing/components/logo";
import { ThemeToggle } from "@/shared/theme/theme-toggle";

export async function generateMetadata(props: PageProps<"/[lang]/status">): Promise<Metadata> {
  const { lang } = await props.params;

  return {
    title: isLocale(lang) ? statusCopy[lang].pageTitle : undefined,
    robots: { index: false, follow: false },
  };
}

export default async function StatusPage(props: PageProps<"/[lang]/status">) {
  const { lang } = await props.params;

  if (!isLocale(lang)) {
    notFound();
  }

  // API_URL is read per request so the card shows the deployed value, not the one present at build time.
  await connection();
  const { apiUrl } = getServerEnv();
  const { a11y } = getDictionary(lang);

  return (
    <AppProviders>
      <main className="shell grid min-h-dvh content-center gap-8 py-16">
        <div className="flex items-center justify-between gap-4">
          <a href={`/${lang}`} aria-label={statusCopy[lang].back} className="rounded-full">
            <Logo />
          </a>
          <ThemeToggle label={a11y.theme} />
        </div>
        <BackendStatusCard locale={lang} upstreamHost={apiUrl ? new URL(apiUrl).host : null} />
      </main>
    </AppProviders>
  );
}
