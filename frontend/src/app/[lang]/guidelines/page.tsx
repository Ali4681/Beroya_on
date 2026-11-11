import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { site } from "@/core/config/site";
import { isLocale, locales } from "@/core/i18n/config";
import { getDictionary } from "@/core/i18n/dictionaries";
import { BilingualLegalPage } from "@/features/landing/components/legal-page";

export async function generateMetadata(props: PageProps<"/[lang]/guidelines">): Promise<Metadata> {
  const { lang } = await props.params;
  if (!isLocale(lang)) return {};

  const { legal } = getDictionary(lang);
  const alternate = locales.filter((locale) => locale !== lang);

  return {
    title: legal.guidelines.metaTitle,
    description: legal.guidelines.metaDescription,
    alternates: {
      canonical: `/${lang}/guidelines`,
      languages: { ar: "/ar/guidelines", en: "/en/guidelines", "x-default": "/ar/guidelines" },
    },
    openGraph: {
      type: "website",
      url: `/${lang}/guidelines`,
      siteName: site.name,
      title: legal.guidelines.metaTitle,
      description: legal.guidelines.metaDescription,
      locale: getDictionary(lang).meta.ogLocale,
      alternateLocale: alternate.map((locale) => getDictionary(locale).meta.ogLocale),
    },
  };
}

export default async function GuidelinesPage(props: PageProps<"/[lang]/guidelines">) {
  const { lang } = await props.params;
  if (!isLocale(lang)) notFound();
  return <BilingualLegalPage locale={lang} docKey="guidelines" />;
}
