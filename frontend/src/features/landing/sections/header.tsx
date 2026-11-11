import { site } from "@/core/config/site";

import { SiteHeader } from "../client/site-header";
import { ButtonLink } from "../components/button-link";
import { Logo } from "../components/logo";
import { StoreButtons } from "../components/store-buttons";
import type { SectionProps } from "../types";

export function Header({ dict, locale }: SectionProps) {
  return (
    <SiteHeader
      logo={<Logo />}
      homeLabel={site.name}
      nav={dict.nav}
      labels={{
        primaryNav: dict.a11y.primaryNav,
        openMenu: dict.a11y.openMenu,
        closeMenu: dict.a11y.closeMenu,
        theme: dict.a11y.theme,
        download: dict.common.download,
        downloadShort: dict.common.downloadShort,
      }}
      language={{ target: locale === "ar" ? "en" : "ar", ...dict.language }}
      mobileExtra={
        <div className="grid gap-3">
          <StoreButtons common={dict.common} />
          <ButtonLink href="#drivers" variant="secondary" size="md" className="w-full">
            {dict.common.joinDriver}
          </ButtonLink>
        </div>
      }
    />
  );
}
