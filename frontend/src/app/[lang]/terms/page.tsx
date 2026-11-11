import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { site } from "@/core/config/site";
import { isLocale, locales } from "@/core/i18n/config";
import { getDictionary } from "@/core/i18n/dictionaries";
import { BilingualLegalPage } from "@/features/landing/components/legal-page";

export async function generateMetadata(props: PageProps<"/[lang]/terms">): Promise<Metadata> {
  const { lang } = await props.params;
  if (!isLocale(lang)) return {};

  const { legal } = getDictionary(lang);
  const alternate = locales.filter((locale) => locale !== lang);

  return {
    title: legal.terms.metaTitle,
    description: legal.terms.metaDescription,
    alternates: {
      canonical: `/${lang}/terms`,
      languages: { ar: "/ar/terms", en: "/en/terms", "x-default": "/ar/terms" },
    },
    openGraph: {
      type: "website",
      url: `/${lang}/terms`,
      siteName: site.name,
      title: legal.terms.metaTitle,
      description: legal.terms.metaDescription,
      locale: getDictionary(lang).meta.ogLocale,
      alternateLocale: alternate.map((locale) => getDictionary(locale).meta.ogLocale),
    },
  };
}

export default async function TermsPage(props: PageProps<"/[lang]/terms">) {
  const { lang } = await props.params;
  if (!isLocale(lang)) notFound();
  return <BilingualLegalPage locale={lang} docKey="terms" />;
}
