import type { Metadata, Viewport } from "next";
import { Readex_Pro } from "next/font/google";
import { notFound } from "next/navigation";
import { ViewTransition } from "react";

import { site } from "@/core/config/site";
import { directionOf, isLocale, locales } from "@/core/i18n/config";
import { getDictionary } from "@/core/i18n/dictionaries";
import { viewTransitionGuardScript } from "@/shared/lib/view-transition-guard";
import { themeInitScript } from "@/shared/theme/theme";
import { ThemeSync } from "@/shared/theme/theme-sync";
import { InlineScript } from "@/shared/ui/inline-script";

import "../globals.css";

const readex = Readex_Pro({
  subsets: ["arabic", "latin"],
  variable: "--font-readex",
  display: "swap",
});

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata(props: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await props.params;

  if (!isLocale(lang)) {
    return {};
  }

  const dictionary = getDictionary(lang);

  return {
    metadataBase: new URL(site.url),
    applicationName: site.name,
    title: { default: dictionary.meta.title, template: `%s · ${site.name}` },
    description: dictionary.meta.description,
    formatDetection: { telephone: false, email: false, address: false },
    icons: {
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1017" },
  ],
  colorScheme: "light dark",
};

export default async function RootLayout(props: LayoutProps<"/[lang]">) {
  const { lang } = await props.params;

  if (!isLocale(lang)) {
    notFound();
  }

  // Switching locale remounts this whole tree. React only runs a mount as a view transition when
  // a <ViewTransition> sits above the first DOM element, hence the wrapper around <html>. Naming
  // the root explicitly stops React from cancelling the page cross-fade, which it otherwise does
  // when nothing outside a boundary changed size.
  return (
    <ViewTransition default="none">
      <html
        lang={lang}
        dir={directionOf(lang)}
        className={readex.variable}
        style={{ viewTransitionName: "root" }}
        suppressHydrationWarning
      >
        <head>
          <InlineScript html={viewTransitionGuardScript} />
          <InlineScript html={themeInitScript} />
        </head>
        <body className="min-h-dvh antialiased" suppressHydrationWarning>
          <ThemeSync />
          {props.children}
        </body>
      </html>
    </ViewTransition>
  );
}
