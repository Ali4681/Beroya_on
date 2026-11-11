import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { site } from "@/core/config/site";
import { isLocale, locales } from "@/core/i18n/config";
import { getDictionary } from "@/core/i18n/dictionaries";
import { BilingualLegalPage } from "@/features/landing/components/legal-page";

export async function generateMetadata(props: PageProps<"/[lang]/account-deletion">): Promise<Metadata> {
  const { lang } = await props.params;
  if (!isLocale(lang)) return {};

  const { legal } = getDictionary(lang);
  const alternate = locales.filter((locale) => locale !== lang);

  return {
    title: legal.accountDeletion.metaTitle,
    description: legal.accountDeletion.metaDescription,
    alternates: {
      canonical: `/${lang}/account-deletion`,
      languages: { ar: "/ar/account-deletion", en: "/en/account-deletion", "x-default": "/ar/account-deletion" },
    },
    openGraph: {
      type: "website",
      url: `/${lang}/account-deletion`,
      siteName: site.name,
      title: legal.accountDeletion.metaTitle,
      description: legal.accountDeletion.metaDescription,
      locale: getDictionary(lang).meta.ogLocale,
      alternateLocale: alternate.map((locale) => getDictionary(locale).meta.ogLocale),
    },
  };
}

export default async function AccountDeletionPage(props: PageProps<"/[lang]/account-deletion">) {
  const { lang } = await props.params;
  if (!isLocale(lang)) notFound();
  return <BilingualLegalPage locale={lang} docKey="accountDeletion" />;
}
