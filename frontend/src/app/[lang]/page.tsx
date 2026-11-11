import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { site } from "@/core/config/site";
import { isLocale, locales } from "@/core/i18n/config";
import { getDictionary } from "@/core/i18n/dictionaries";
import { LandingPage } from "@/features/landing/landing-page";

export async function generateMetadata(props: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await props.params;

  if (!isLocale(lang)) {
    return {};
  }

  const { meta } = getDictionary(lang);
  const alternate = locales.filter((locale) => locale !== lang);

  return {
    title: { absolute: meta.title },
    description: meta.description,
    alternates: {
      canonical: `/${lang}`,
      languages: { ar: "/ar", en: "/en", "x-default": "/ar" },
    },
    openGraph: {
      type: "website",
      url: `/${lang}`,
      siteName: site.name,
      title: meta.title,
      description: meta.description,
      locale: meta.ogLocale,
      alternateLocale: alternate.map((locale) => getDictionary(locale).meta.ogLocale),
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
    },
  };
}

export default async function Page(props: PageProps<"/[lang]">) {
  const { lang } = await props.params;

  if (!isLocale(lang)) {
    notFound();
  }

  return <LandingPage locale={lang} />;
}
