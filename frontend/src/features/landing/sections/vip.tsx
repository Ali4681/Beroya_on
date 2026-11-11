import { ArrowUpRight, Crown, Mic, PartyPopper, Sparkles, Users, type IconNode } from "lucide";

import { cssVars, delay } from "@/shared/lib/css-vars";
import { Icon } from "@/shared/ui/icon";

import { ButtonLink } from "../components/button-link";
import { NeonCar } from "../components/neon-car";
import { Section } from "../components/section";
import { Eyebrow } from "../components/section-heading";
import { contactHref } from "../links";
import type { SectionProps } from "../types";

const itemIcons: IconNode[] = [Crown, PartyPopper, Sparkles, Users, Mic];

const convoy = [
  "/occasion/مرسيدس سوداء فاخرة بإضاءة نيون.png",
  "/occasion/Donkere Premium SUV in Zijaanzicht.png",
  "/occasion/سيارة سيدان فاخرة بيضاء معزولة.png",
  "/occasion/سيارة_دفع_رباعي_فاخرة_سوداء_لامعة.png",
] as const;

function Stage() {
  return (
    <div className="group relative overflow-hidden rounded-[32px] border border-line bg-[#050608]">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(90%_70%_at_50%_0%,color-mix(in_oklab,var(--brand)_18%,transparent),transparent_72%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-[12%] top-0 h-[78%] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand)_24%,transparent),transparent_78%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-[18%] top-0 h-[88%] bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--heading)_14%,transparent),transparent_85%)] [clip-path:polygon(38%_0,62%_0,100%_100%,0_100%)]"
      />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[34%] bg-[linear-gradient(to_bottom,transparent,rgb(0_0_0/0.55))]" />
      <div aria-hidden="true" className="absolute inset-x-[12%] bottom-[18%] h-px bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--brand)_55%,transparent),transparent)]" />

      <div className="relative z-10 mx-auto w-full max-w-[1000px] px-[6%] pb-12 pt-14 sm:px-[8%] sm:pb-14 sm:pt-16">
        <div className="translate-y-3 rtl:-scale-x-100 sm:translate-y-4">
          <NeonCar />
        </div>
      </div>

      <span className="sheen-overlay" />
    </div>
  );
}

export function Vip({ dict, support }: SectionProps) {
  const { vip } = dict;

  return (
    <Section id="vip" className="overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -end-40 size-[42rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand)_16%,transparent),transparent)]" />
        <div className="absolute -start-40 -bottom-56 size-[40rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--teal)_22%,transparent),transparent)]" />
      </div>

      <div className="shell relative grid gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-16">
        <div data-reveal>
          <Eyebrow>{vip.eyebrow}</Eyebrow>
          <h2 dir="ltr" className="text-gradient mt-6 w-fit text-[3.4rem] leading-none font-semibold tracking-tight sm:text-[4.6rem]">
            {vip.title}
          </h2>
          <p className="mt-5 text-xl font-medium text-heading sm:text-2xl">{vip.tagline}</p>
          <p className="mt-5 max-w-lg text-base leading-8 text-muted sm:text-lg">{vip.description}</p>
          <ul className="mt-8 flex flex-wrap gap-2.5">
            {vip.items.map((item, index) => (
              <li
                key={item}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-4 py-2 text-sm font-medium text-heading"
              >
                <Icon node={itemIcons[index]} size={15} className="text-brand-strong" />
                {item}
              </li>
            ))}
          </ul>
          <ButtonLink href={contactHref(support)} className="mt-10">
            {vip.cta}
            <Icon node={ArrowUpRight} size={18} className="rtl:-scale-x-100" />
          </ButtonLink>
        </div>

        <div data-reveal style={delay(120)} className="relative">
          <Stage />
          <div data-reveal className="glass relative mx-3 -mt-6 rounded-[26px] p-5 sm:mx-8 sm:-mt-12 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-heading">{vip.multi.title}</h3>
              <span className="inline-flex items-center gap-2 rounded-full bg-brand/15 px-3 py-1 text-xs font-semibold text-brand-strong">
                {vip.multi.fleetLabel} · {vip.multi.fleetValue}
              </span>
            </div>
            <p className="mt-2 text-sm leading-7 text-muted">{vip.multi.body}</p>
            <div aria-hidden="true" className="mt-5 flex items-end gap-2 border-b border-dashed border-line-strong pb-2">
              {convoy.map((src, index) => (
                <div
                  key={src}
                  className="convoy-car w-1/4"
                  style={cssVars({ "--delay": `${300 + (convoy.length - index) * 160}ms` })}
                >
                  <img
                    src={encodeURI(src)}
                    alt=""
                    className="h-auto w-full object-contain object-bottom rtl:-scale-x-100"
                  />
                </div>
              ))}
            </div>
            <ul className="mt-4 flex flex-wrap gap-2">
              {vip.multi.uses.map((use) => (
                <li key={use} className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-heading ring-1 ring-line">
                  {use}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Section>
  );
}
