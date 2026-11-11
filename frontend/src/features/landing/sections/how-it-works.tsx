import { formatNumber } from "@/shared/lib/format";

import { HowStepper } from "../client/how-stepper";
import { Section } from "../components/section";
import { SectionHeading } from "../components/section-heading";
import {
  CategoryScreen,
  DriverAssignedScreen,
  LocationScreen,
  RideCompleteScreen,
} from "../screens/customer-screens";
import type { SectionProps } from "../types";

export function HowItWorks({ dict, locale }: SectionProps) {
  const how = dict.how;

  return (
    <Section id="how">
      <div className="shell">
        <SectionHeading eyebrow={how.eyebrow} title={how.title} description={how.description} align="center" />

        <div className="mt-16 lg:mt-20" data-reveal>
          <HowStepper
            steps={how.steps}
            stepLabel={how.stepLabel}
            numbers={how.steps.map((_, index) => formatNumber(index + 1, locale))}
            screens={[
              <LocationScreen key="location" dict={dict} />,
              <CategoryScreen key="category" dict={dict} />,
              <DriverAssignedScreen key="assigned" dict={dict} />,
              <RideCompleteScreen key="complete" dict={dict} />,
            ]}
            decoration={
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="size-[34rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand)_24%,transparent),transparent)]" />
                <div className="absolute size-[26rem] rounded-full border border-dashed border-line-strong" />
              </div>
            }
          />
        </div>
      </div>
    </Section>
  );
}
