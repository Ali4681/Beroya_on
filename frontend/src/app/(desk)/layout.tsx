import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { cookies } from "next/headers";

import { AppProviders } from "@/app/providers";
import { directionOf, isLocale, localeCookie } from "@/core/i18n/config";
import { DeskProvider } from "@/features/desk/desk-context";
import { InlineScript } from "@/shared/ui/inline-script";
import { themeInitScript } from "@/shared/theme/theme";
import { ThemeSync } from "@/shared/theme/theme-sync";

import "../globals.css";

const deskFont = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-desk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Beroya On",
  description: "Beroya On staff console",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const raw = jar.get(localeCookie)?.value ?? "ar";
  const locale = isLocale(raw) ? raw : "ar";

  return (
    <html lang={locale} dir={directionOf(locale)} data-app="desk" className={deskFont.variable} suppressHydrationWarning>
      <head>
        <InlineScript html={themeInitScript} />
      </head>
      <body className="min-h-dvh bg-canvas font-sans text-body antialiased" suppressHydrationWarning>
        <ThemeSync />
        <AppProviders>
          <DeskProvider initialLocale={locale}>{children}</DeskProvider>
        </AppProviders>
      </body>
    </html>
  );
}
