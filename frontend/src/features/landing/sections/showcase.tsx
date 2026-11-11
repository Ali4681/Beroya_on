import type { ReactNode } from "react";

import { formatNumber } from "@/shared/lib/format";

import { ShowcaseCarousel } from "../client/showcase-carousel";
import { LottieScreen } from "../components/lottie-screen";
import { Phone } from "../components/phone";
import { Section } from "../components/section";
import { SectionHeading } from "../components/section-heading";
import type { SectionProps } from "../types";

/** Customer app recordings from `public/customer` (Figma → Lottie). */
const CUSTOMER_LOTTIES = [
  "/customer/location-map.json",
  "/customer/select-vehicle.json",
  "/customer/select-vehicle-2.json",
  "/customer/confirm-driver.json",
  "/customer/confirm-driver-2.json",
] as const;

/** Driver app recordings from `public/driver` (Figma → Lottie). */
const DRIVER_LOTTIES = [
  "/driver/الرئيسية السائق.json",
  "/driver/الرئيسية السائق اشعار رحلة.json",
  "/driver/قبول الطلب السائق.json",
  "/driver/قبول_الطلب_السائق_انتظار_العميل.json",
  "/driver/سجل الرحلات السائق.json",
].map((src) => encodeURI(src));

function Slide({ caption, index, children }: { caption: string; index: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col items-center [--phone-zoom:0.8] sm:[--phone-zoom:0.86]">
      <Phone className="pointer-events-none select-none">{children}</Phone>
      <figcaption className="mt-6 flex items-center gap-2.5 text-[15px] font-semibold text-heading">
        <span className="grid size-6 place-items-center rounded-full bg-brand/15 text-[11px] font-bold text-accent">{index}</span>
        {caption}
      </figcaption>
    </figure>
  );
}

export function Showcase({ dict, locale }: SectionProps) {
  const { showcase } = dict;

  const customer = CUSTOMER_LOTTIES.map((src, index) => (
    <Slide key={src} caption={showcase.customer[index] ?? ""} index={formatNumber(index + 1, locale)}>
      <LottieScreen src={src} />
    </Slide>
  ));

  const driver = DRIVER_LOTTIES.map((src, index) => (
    <Slide key={src} caption={showcase.driver[index] ?? ""} index={formatNumber(index + 1, locale)}>
      <LottieScreen src={src} />
    </Slide>
  ));

  return (
    <Section id="showcase" tone="surface" clipX={false}>
      <div className="shell">
        <SectionHeading eyebrow={showcase.eyebrow} title={showcase.title} description={showcase.description} />
        <div data-reveal="fade" className="mt-12">
          <ShowcaseCarousel
            tabs={[
              { id: "customer", label: showcase.tabs.customer, items: customer },
              { id: "driver", label: showcase.tabs.driver, items: driver },
            ]}
            labels={{ previous: dict.a11y.previous, next: dict.a11y.next }}
          />
        </div>
      </div>
    </Section>
  );
}
