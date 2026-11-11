import { ArrowUpRight, CarFront } from "lucide";

import { cssVars } from "@/shared/lib/css-vars";
import { Icon } from "@/shared/ui/icon";

import { ButtonLink } from "../components/button-link";
import { Phone } from "../components/phone";
import { Section } from "../components/section";
import { Eyebrow } from "../components/section-heading";
import { CatalogStamp } from "../components/stamp-catalog";
import { StoreButtons } from "../components/store-buttons";
import { driverSignupHref } from "../links";
import { HomeScreen } from "../screens/customer-screens";
import type { SectionProps } from "../types";

export function FinalCta({ dict }: SectionProps) {
  const { customer, driver } = dict.finalCta;

  return (
    <Section id="download" padding="pt-24 pb-20 sm:pt-28 sm:pb-24 lg:pt-32">
      <div className="shell">
        <div
          data-reveal
          className="relative overflow-hidden rounded-[40px] bg-surface px-7 pt-14 text-body ring-1 ring-line sm:px-14 sm:pt-20 lg:pb-0"
        >
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute -top-48 -start-24 size-[44rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand)_24%,transparent),transparent)]" />
            <div className="absolute -end-32 -bottom-40 size-[36rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--teal)_30%,transparent),transparent)]" />
            <div className="grid-fade absolute inset-0 opacity-50" />
          </div>

          <div className="relative grid gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-end">
            <div className="lg:pb-20">
              <Eyebrow>{customer.eyebrow}</Eyebrow>
              <h2 className="mt-6 text-[2.5rem] leading-[1.1] font-semibold text-balance text-heading sm:text-[3.6rem] ltr:tracking-tight rtl:leading-[1.25]">
                {customer.title}
              </h2>
              <p className="mt-5 max-w-lg text-lg leading-8 text-muted">{customer.body}</p>
              <StoreButtons common={dict.common} className="mt-9" />
            </div>

            <div className="relative flex justify-center">
              <div className="relative h-[27rem] overflow-hidden sm:h-[30rem] [--phone-zoom:0.9] sm:[--phone-zoom:1]">
                <Phone>
                  <HomeScreen dict={dict} />
                </Phone>
              </div>
              <CatalogStamp
                id="firstRide"
                names={dict.stampNames}
                className="stamp-press absolute top-10 -start-2 w-32 drop-shadow-xl sm:start-0 sm:w-36"
                style={cssVars({ "--rot": "-12deg", "--delay": "500ms" })}
              />
            </div>
          </div>
        </div>

        <div
          data-reveal
          className="mt-6 flex flex-col gap-6 rounded-[32px] border border-line bg-surface p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9"
        >
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-heading text-canvas">
              <Icon node={CarFront} size={22} />
            </span>
            <div>
              <h3 className="text-xl font-semibold text-heading">{driver.title}</h3>
              <p className="mt-1.5 text-[15px] leading-7 text-muted">{driver.body}</p>
            </div>
          </div>
          <ButtonLink href={driverSignupHref()} variant="inverse" className="self-start sm:self-auto">
            {driver.cta}
            <Icon node={ArrowUpRight} size={18} className="rtl:-scale-x-100" />
          </ButtonLink>
        </div>
      </div>
    </Section>
  );
}
