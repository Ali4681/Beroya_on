import { Info } from "lucide";

import { delay } from "@/shared/lib/css-vars";
import { Icon } from "@/shared/ui/icon";

import { ExtrasPicker } from "../client/extras-picker";
import { HScroll } from "../client/h-scroll";
import { categoryStyle } from "../components/category-style";
import { Section } from "../components/section";
import { SectionHeading } from "../components/section-heading";
import type { SectionProps } from "../types";

export function Categories({ dict }: SectionProps) {
  const { categories, extras } = dict;

  return (
    <Section id="services" tone="surface" clipX={false}>
      <div className="shell">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading eyebrow={categories.eyebrow} title={categories.title} description={categories.description} />
          <p data-reveal className="flex max-w-sm items-start gap-2.5 text-sm leading-7 text-muted lg:pb-2">
            <Icon node={Info} size={17} className="mt-1 shrink-0 text-accent" />
            {categories.note}
          </p>
        </div>
      </div>

      <HScroll
        as="ul"
        className="mt-14 flex snap-x snap-proximity gap-4 px-5 pb-4 select-none sm:px-8 lg:mx-auto lg:grid lg:max-w-[78rem] lg:grid-cols-3 lg:cursor-auto lg:overflow-x-visible lg:px-8 xl:grid-cols-6"
      >
        {categories.items.map((item, index) => {
          const style = categoryStyle(item.id);

          return (
            <li
              key={item.id}
              data-reveal="fade"
              style={delay(index * 90)}
              className="group w-[min(78%,20.5rem)] shrink-0 snap-start sm:w-[46%] md:w-[34%] lg:w-auto"
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

      <div className="shell">
        <div id="extras" data-anchor className="mt-24 grid gap-12 border-t border-line pt-20 lg:mt-28 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)] lg:gap-16 lg:pt-24">
          <SectionHeading eyebrow={extras.eyebrow} title={extras.title} description={extras.description} as="h3" />
          <div data-reveal>
            <ExtrasPicker
              options={extras.options}
              hint={extras.hint}
              summaryTitle={extras.summaryTitle}
              summaryCategory={extras.summaryCategory}
              summaryEmpty={extras.summaryEmpty}
              matchNote={extras.matchNote}
            />
          </div>
        </div>
      </div>
    </Section>
  );
}
