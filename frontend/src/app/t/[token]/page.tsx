import type { Metadata } from "next";
import { connection } from "next/server";

import { publicEnv } from "@/core/config/public-env";
import { getServerEnv } from "@/core/config/server-env";
import { getDictionary } from "@/core/i18n/dictionaries";
import { PublicTrackView } from "@/features/tracking/components/public-track-view";
import { trackingCopy } from "@/features/tracking/copy";
import { resolveTrackingLang } from "@/features/tracking/resolve-lang";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
};

function resolveGoApiBase(apiUrl: string | undefined) {
  if (apiUrl) {
    return `${apiUrl.replace(/\/$/, "")}/api/v1/go`;
  }
  return publicEnv.goApiUrl;
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { lang: langParam } = await props.searchParams;
  const lang = resolveTrackingLang(langParam);
  return {
    title: { absolute: trackingCopy[lang].title },
    robots: { index: false, follow: false },
  };
}

export default async function PublicTrackingPage(props: PageProps) {
  await connection();
  const { token } = await props.params;
  const { lang: langParam } = await props.searchParams;
  const lang = resolveTrackingLang(langParam);
  const { apiUrl } = getServerEnv();
  const apiBase = resolveGoApiBase(apiUrl);
  const { a11y } = getDictionary(lang);

  return <PublicTrackView token={token} lang={lang} apiBase={apiBase} themeLabel={a11y.theme} />;
}
