import { Castle, Crown, Landmark, Lock, Mountain, Sparkles, type IconNode } from "lucide";

import { cssVars, delay } from "@/shared/lib/css-vars";
import { Icon } from "@/shared/ui/icon";

import { Section } from "../components/section";
import { SectionHeading } from "../components/section-heading";
import { CatalogStamp, isStampId } from "../components/stamp-catalog";
import type { SectionProps } from "../types";

const cityIcons: IconNode[] = [Castle, Landmark, Mountain, Crown, Sparkles];
const tilts = ["-7deg", "6deg", "-4deg", "8deg"];

export function Seasonal({ dict }: SectionProps) {
  const { seasonal } = dict;

  return (
    <Section id="seasonal">
      <div className="shell">
        <SectionHeading eyebrow={seasonal.eyebrow} title={seasonal.title} description={seasonal.description} align="center" />

        <div className="mt-14 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
          {seasonal.items.map((item, index) => (
            <article
              key={item.id}
              data-reveal
              style={delay(index * 110)}
              className="group grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-4 overflow-hidden rounded-[24px] border border-line bg-surface p-4 shadow-card sm:grid-cols-1 sm:gap-0 sm:rounded-[28px] sm:p-0"
            >
              <div className="paper relative grid aspect-square place-items-center overflow-hidden rounded-2xl border border-line sm:aspect-auto sm:h-40 sm:rounded-none sm:border-0 sm:border-b">
                {isStampId(item.id) ? (
                  <CatalogStamp
                    id={item.id}
                    names={dict.stampNames}
                    className="stamp-press w-[4.75rem] transition-[scale] duration-500 group-hover:scale-105 sm:w-28"
                    style={cssVars({ "--rot": tilts[index], "--delay": `${250 + index * 180}ms` })}
                  />
                ) : null}
              </div>
              <div className="min-w-0 sm:p-6">
                <h3 className="text-[16px] font-semibold text-heading sm:text-lg">{item.title}</h3>
                <p className="mt-1 text-[13px] leading-6 text-muted sm:mt-2 sm:text-[15px] sm:leading-7">{item.body}</p>
              </div>
            </article>
          ))}
        </div>

        <div
          data-reveal
          className="mt-8 grid gap-8 rounded-[32px] border-2 border-dashed border-line-strong p-7 sm:p-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center"
        >
          <div>
            <h3 className="text-2xl font-semibold text-heading">{seasonal.cities.title}</h3>
            <p className="mt-3 text-[15px] leading-7 text-muted">{seasonal.cities.body}</p>
          </div>
          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-6 lg:justify-end">
            {seasonal.cities.items.map((city, index) => (
              <li key={city} className="stagger-in flex w-[5.75rem] flex-col items-center text-center" style={delay(200 + index * 110)}>
                <span className="relative grid size-20 place-items-center rounded-full border-2 border-dashed border-line-strong text-muted">
                  <Icon node={cityIcons[index]} size={26} />
                  <span className="absolute -end-1 -bottom-1 grid size-7 place-items-center rounded-full bg-heading text-canvas ring-4 ring-canvas">
                    <Icon node={Lock} size={12} />
                  </span>
                </span>
                <span className="mt-3 text-[13px] leading-5 font-semibold text-heading">{city}</span>
                <span className="text-[11px] text-muted">{seasonal.cities.soon}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
