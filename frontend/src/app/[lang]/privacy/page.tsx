import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { site } from "@/core/config/site";
import { isLocale, locales } from "@/core/i18n/config";
import { getDictionary } from "@/core/i18n/dictionaries";
import { BilingualLegalPage } from "@/features/landing/components/legal-page";

export async function generateMetadata(props: PageProps<"/[lang]/privacy">): Promise<Metadata> {
  const { lang } = await props.params;
  if (!isLocale(lang)) return {};

  const { legal } = getDictionary(lang);
  const alternate = locales.filter((locale) => locale !== lang);

  return {
    title: legal.privacy.metaTitle,
    description: legal.privacy.metaDescription,
    alternates: {
      canonical: `/${lang}/privacy`,
      languages: { ar: "/ar/privacy", en: "/en/privacy", "x-default": "/ar/privacy" },
    },
    openGraph: {
      type: "website",
      url: `/${lang}/privacy`,
      siteName: site.name,
      title: legal.privacy.metaTitle,
      description: legal.privacy.metaDescription,
      locale: getDictionary(lang).meta.ogLocale,
      alternateLocale: alternate.map((locale) => getDictionary(locale).meta.ogLocale),
    },
  };
}

export default async function PrivacyPage(props: PageProps<"/[lang]/privacy">) {
  const { lang } = await props.params;
  if (!isLocale(lang)) notFound();
  return <BilingualLegalPage locale={lang} docKey="privacy" />;
}
