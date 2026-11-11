"use client";

import { ArrowLeft, ArrowRight } from "lucide";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { cx } from "@/shared/lib/cx";
import { Icon } from "@/shared/ui/icon";
import { Tooltip } from "@/shared/ui/tooltip";

import { useHScroll } from "./h-scroll";

type Tab = { id: string; label: string; items: ReactNode[] };

type ShowcaseCarouselProps = {
  tabs: Tab[];
  labels: { previous: string; next: string };
};

export function ShowcaseCarousel({ tabs, labels }: ShowcaseCarouselProps) {
  const [current, setCurrent] = useState(tabs[0]?.id ?? "");
  const [edges, setEdges] = useState({ start: true, end: false });
  const track = useRef<HTMLDivElement>(null);
  useHScroll(track);
  const tab = tabs.find((item) => item.id === current) ?? tabs[0];

  const measure = useCallback(() => {
    const node = track.current;
    if (!node) {
      return;
    }
    const offset = Math.abs(node.scrollLeft);
    const max = node.scrollWidth - node.clientWidth;
    setEdges({ start: offset < 8, end: offset > max - 8 });
  }, []);

  useEffect(() => {
    const node = track.current;
    if (!node) {
      return;
    }
    node.scrollTo({ left: 0 });
    measure();
    node.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      node.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [current, measure]);

  function scroll(step: 1 | -1) {
    const node = track.current;
    if (!node) {
      return;
    }
    const item = node.querySelector<HTMLElement>("[data-slide]");
    const distance = (item?.offsetWidth ?? 320) + 24;
    const direction = getComputedStyle(node).direction === "rtl" ? -1 : 1;
    node.scrollBy({ left: distance * step * direction, behavior: "smooth" });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div role="tablist" className="inline-flex rounded-full border border-line bg-surface p-1 shadow-card">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`showcase-tab-${item.id}`}
              aria-selected={item.id === current}
              aria-controls={`showcase-panel-${item.id}`}
              onClick={() => setCurrent(item.id)}
              className={cx(
                "rounded-full px-5 py-2.5 text-sm font-semibold transition duration-300",
                item.id === current ? "bg-heading text-canvas" : "text-muted hover:text-heading",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Tooltip label={labels.previous}>
            <button
              type="button"
              onClick={() => scroll(-1)}
              disabled={edges.start}
              aria-label={labels.previous}
              className="grid size-11 place-items-center rounded-full border border-line bg-surface text-heading transition hover:border-line-strong disabled:pointer-events-none disabled:opacity-35"
            >
              <Icon node={ArrowLeft} size={18} className="rtl:rotate-180" />
            </button>
          </Tooltip>
          <Tooltip label={labels.next}>
            <button
              type="button"
              onClick={() => scroll(1)}
              disabled={edges.end}
              aria-label={labels.next}
              className="grid size-11 place-items-center rounded-full border border-line bg-surface text-heading transition hover:border-line-strong disabled:pointer-events-none disabled:opacity-35"
            >
              <Icon node={ArrowRight} size={18} className="rtl:rotate-180" />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="-mx-5 mt-10 [mask-image:linear-gradient(to_right,transparent,#000_2.5rem,#000_calc(100%-2.5rem),transparent)] md:-mx-8">
        <div
          ref={track}
          role="tabpanel"
          id={`showcase-panel-${tab.id}`}
          aria-labelledby={`showcase-tab-${tab.id}`}
          className="h-scroll flex snap-x snap-proximity gap-6 scroll-smooth px-5 pt-4 pb-10 select-none md:px-8"
        >
          {tab.items.map((item, index) => (
            <div key={`${tab.id}-${index}`} data-slide className="shrink-0 snap-center sm:snap-start">
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
