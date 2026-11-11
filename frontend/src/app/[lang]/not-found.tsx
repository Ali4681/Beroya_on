import { lang } from "next/root-params";

import { defaultLocale, isLocale } from "@/core/i18n/config";
import { getDictionary } from "@/core/i18n/dictionaries";
import { buttonClass } from "@/features/landing/components/button-link";
import { Logo } from "@/features/landing/components/logo";
import { MapSvg, RouteLine } from "@/features/landing/components/map";
import { ThemeToggle } from "@/shared/theme/theme-toggle";

export default async function NotFound() {
  const value = await lang();
  const locale = isLocale(value) ? value : defaultLocale;
  const dict = getDictionary(locale);

  return (
    <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden px-6 py-24 text-center">
      <div aria-hidden="true" className="absolute inset-0 -z-10 opacity-60 [mask-image:radial-gradient(ellipse_at_center,#000_20%,transparent_70%)]">
        <MapSvg width={900} height={700} base={{ step: [96, 84], block: [80, 68], parks: ["4,3"] }}>
          <RouteLine d="M60 560H300Q330 560 330 530V380Q330 350 360 350H520" draw="now" />
          <path d="M520 350H640" fill="none" strokeWidth={4} strokeDasharray="2 12" strokeLinecap="round" className="stroke-muted" />
        </MapSvg>
      </div>

      <div className="absolute top-5 end-5">
        <ThemeToggle label={dict.a11y.theme} />
      </div>

      <div className="max-w-lg">
        <a href={`/${locale}`} className="inline-block">
          <Logo />
        </a>
        <p className="text-gradient mt-10 text-[7rem] leading-none font-semibold sm:text-[9rem]">{dict.notFound.code}</p>
        <h1 className="mt-6 text-3xl font-semibold text-balance text-heading sm:text-4xl">{dict.notFound.title}</h1>
        <p className="mt-4 text-lg leading-8 text-muted">{dict.notFound.body}</p>
        <a href={`/${locale}`} className={`${buttonClass("primary")} mt-9`}>
          {dict.notFound.cta}
        </a>
      </div>
    </main>
  );
}
