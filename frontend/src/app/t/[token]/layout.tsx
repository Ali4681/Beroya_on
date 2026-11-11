import type { Metadata, Viewport } from "next";
import { Readex_Pro } from "next/font/google";
import { ViewTransition } from "react";

import { site } from "@/core/config/site";
import { viewTransitionGuardScript } from "@/shared/lib/view-transition-guard";
import { themeInitScript } from "@/shared/theme/theme";
import { ThemeSync } from "@/shared/theme/theme-sync";
import { InlineScript } from "@/shared/ui/inline-script";

import "../../globals.css";

const readex = Readex_Pro({
  subsets: ["arabic", "latin"],
  variable: "--font-readex",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  applicationName: site.name,
  robots: { index: false, follow: false },
};

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

export default function TrackingLayout({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition default="none">
      <html lang="ar" dir="rtl" className={readex.variable} style={{ viewTransitionName: "root" }} suppressHydrationWarning>
        <head>
          <InlineScript html={viewTransitionGuardScript} />
          <InlineScript html={themeInitScript} />
        </head>
        <body className="min-h-dvh antialiased" suppressHydrationWarning>
          <ThemeSync />
          {children}
        </body>
      </html>
    </ViewTransition>
  );
}
