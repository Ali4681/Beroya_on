import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { isLocale } from "@/core/i18n/config";
import { getDictionary } from "@/core/i18n/dictionaries";
import { HScroll } from "@/features/landing/client/h-scroll";
import { MotionRuntime } from "@/features/landing/client/motion-runtime";
import { ShowcaseCarousel } from "@/features/landing/client/showcase-carousel";
import { categoryStyle } from "@/features/landing/components/category-style";
import { LottieScreen } from "@/features/landing/components/lottie-screen";
import { Phone } from "@/features/landing/components/phone";
import { delay } from "@/shared/lib/css-vars";
import { formatNumber } from "@/shared/lib/format";

import { HsMeasure } from "./hs-measure";

export const dynamic = "force-dynamic";

const BOXES = [1, 2, 3, 4, 5, 6] as const;

const CUSTOMER_LOTTIES = [
  "/customer/location-map.json",
  "/customer/select-vehicle.json",
  "/customer/select-vehicle-2.json",
  "/customer/confirm-driver.json",
  "/customer/confirm-driver-2.json",
] as const;

const DRIVER_LOTTIES = [
  "/driver/الرئيسية السائق.json",
  "/driver/الرئيسية السائق اشعار رحلة.json",
  "/driver/قبول الطلب السائق.json",
  "/driver/قبول_الطلب_السائق_انتظار_العميل.json",
  "/driver/سجل الرحلات السائق.json",
].map((src) => encodeURI(src));

function Gap({ children }: { children: ReactNode }) {
  return <div className="mb-[200px]">{children}</div>;
}

function Heading({ id, label }: { id: string; label: string }) {
  return (
    <h2 id={id} className="shell mb-4 text-2xl font-bold text-heading">
      {label}
    </h2>
  );
}

function Box({ n }: { n: number }) {
  return <div style={{ flex: "none", width: 280, height: 120, background: "#8cf" }}>{n}</div>;
}

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

export default async function HsTestPage(props: PageProps<"/[lang]/hs-test">) {
  const { lang } = await props.params;
  if (!isLocale(lang)) {
    notFound();
  }

  const dict = getDictionary(lang);
  const { categories, showcase, a11y } = dict;

  const customer = CUSTOMER_LOTTIES.map((src, index) => (
    <Slide key={src} caption={showcase.customer[index] ?? ""} index={formatNumber(index + 1, lang)}>
      <LottieScreen src={src} />
    </Slide>
  ));

  const driver = DRIVER_LOTTIES.map((src, index) => (
    <Slide key={src} caption={showcase.driver[index] ?? ""} index={formatNumber(index + 1, lang)}>
      <LottieScreen src={src} />
    </Slide>
  ));

  return (
    <main className="bg-canvas py-10 text-body">
      <p className="shell mb-10 text-sm text-muted">hs-test · swipe strips a–e</p>

      <Gap>
        <Heading id="a" label="a" />
        <div id="hs-a" style={{ overflowX: "auto", display: "flex", gap: 12, padding: 12 }}>
          {BOXES.map((n) => (
            <Box key={n} n={n} />
          ))}
        </div>
      </Gap>

      <Gap>
        <Heading id="b" label="b" />
        <div id="hs-b" className="h-scroll" style={{ display: "flex", gap: 12, padding: 12 }}>
          {BOXES.map((n) => (
            <Box key={n} n={n} />
          ))}
        </div>
      </Gap>

      <Gap>
        <Heading id="c" label="c" />
        <div className="h-scroll flex snap-x snap-proximity gap-4" style={{ padding: 12 }}>
          {BOXES.map((n) => (
            <Box key={n} n={n} />
          ))}
        </div>
      </Gap>

      <Gap>
        <Heading id="d" label="d" />
        <HScroll as="ul" className="flex snap-x snap-proximity gap-4 px-5 pb-4 select-none">
          {categories.items.map((item, index) => {
            const style = categoryStyle(item.id);
            return (
              <li
                key={item.id}
                data-reveal="fade"
                style={delay(index * 90)}
                className="group w-[min(78%,20.5rem)] shrink-0 snap-start sm:w-[46%] md:w-[34%]"
              >
                <article className="relative flex h-full flex-col overflow-hidden rounded-[28px] border border-line bg-canvas p-5 transition duration-500 ease-out-soft hover:-translate-y-1.5 hover:shadow-card">
                  <div className="relative -mx-5 -mt-5 mb-5 grid h-40 place-items-center overflow-hidden bg-white">
                    <div
                      className="absolute inset-x-8 bottom-4 h-12 rounded-full opacity-35 blur-2xl transition duration-500 group-hover:opacity-65"
                      style={{ background: style.glow }}
                    />
                    <img
                      src={encodeURI(style.image)}
                      alt={item.name}
                      draggable={false}
                      className="pointer-events-none relative z-10 h-[7.75rem] w-auto max-w-[92%] object-contain transition duration-500 ease-out-soft group-hover:scale-[1.04] [-webkit-user-drag:none]"
                    />
                  </div>
                  <span className="self-start rounded-full bg-surface px-2.5 py-1 text-[12px] font-semibold text-heading ring-1 ring-line">
                    {item.tag}
                  </span>
                  <h3 className="mt-3 text-xl font-semibold text-heading">{item.name}</h3>
                  <p className="mt-1.5 text-[14.5px] leading-7 text-muted">{item.body}</p>
                </article>
              </li>
            );
          })}
        </HScroll>
      </Gap>

      <Gap>
        <Heading id="e" label="e" />
        <div className="shell">
          <ShowcaseCarousel
            tabs={[
              { id: "customer", label: showcase.tabs.customer, items: customer },
              { id: "driver", label: showcase.tabs.driver, items: driver },
            ]}
            labels={{ previous: a11y.previous, next: a11y.next }}
          />
        </div>
      </Gap>

      <HsMeasure />
      <MotionRuntime />
    </main>
  );
}
