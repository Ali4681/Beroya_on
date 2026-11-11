import { site } from "@/core/config/site";
import type { Locale } from "@/core/i18n/config";
import { getDictionary } from "@/core/i18n/dictionaries";

import { MotionRuntime } from "./client/motion-runtime";
import { Benefits } from "./sections/benefits";
import { Categories } from "./sections/categories";
import { DriverTools } from "./sections/driver-tools";
import { Drivers } from "./sections/drivers";
import { Faq } from "./sections/faq";
import { FinalCta } from "./sections/final-cta";
import { Footer } from "./sections/footer";
import { Header } from "./sections/header";
import { Hero } from "./sections/hero";
import { HowItWorks } from "./sections/how-it-works";
import { LivePricing } from "./sections/live-pricing";
import { MoreServices } from "./sections/more-services";
import { Passport } from "./sections/passport";
import { Rewards } from "./sections/rewards";
import { RideModes } from "./sections/ride-modes";
import { Safety } from "./sections/safety";
import { Seasonal } from "./sections/seasonal";
import { ServiceAreas } from "./sections/service-areas";
import { Showcase } from "./sections/showcase";
import { StopsAndOthers } from "./sections/stops-others";
import { Support } from "./sections/support";
import { Vip } from "./sections/vip";
import { Why } from "./sections/why";
import { loadPublicSupport } from "./load-public-support";

function organizationJsonLd(locale: Locale, description: string) {
  const sameAs = [site.links.instagram, site.links.facebook].filter((link): link is string => Boolean(link));
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: new URL(`/${locale}`, site.url).toString(),
    logo: new URL("/brand/lockup.svg", site.url).toString(),
    description,
    ...(sameAs.length ? { sameAs } : {}),
  };

  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export async function LandingPage({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const support = await loadPublicSupport();
  const props = { dict, locale, support };

  return (
    <>
      <a
        href="#main"
        className="sr-only z-[60] rounded-full bg-heading px-5 py-3 text-sm font-semibold text-canvas focus:not-sr-only focus:fixed focus:top-4 focus:start-4"
      >
        {dict.a11y.skip}
      </a>
      <Header {...props} />
      <main id="main">
        <Hero {...props} />
        <Benefits {...props} />
        <HowItWorks {...props} />
        <Categories {...props} />
        <RideModes {...props} />
        <StopsAndOthers {...props} />
        <LivePricing {...props} />
        <Safety {...props} />
        <Support {...props} />
        <Passport {...props} />
        <Seasonal {...props} />
        <Rewards {...props} />
        <Vip {...props} />
        <MoreServices {...props} />
        <Drivers {...props} />
        <DriverTools {...props} />
        <Showcase {...props} />
        <Why {...props} />
        <ServiceAreas {...props} />
        <Faq {...props} />
        <FinalCta {...props} />
      </main>
      <Footer {...props} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: organizationJsonLd(locale, dict.meta.description) }} />
      <MotionRuntime />
    </>
  );
}
