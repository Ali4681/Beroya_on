"use client";

import { Plus } from "lucide";
import { useId, useState } from "react";

import { cx } from "@/shared/lib/cx";
import { Icon } from "@/shared/ui/icon";

type FaqAccordionProps = {
  items: { q: string; a: string }[];
};

export function FaqAccordion({ items }: FaqAccordionProps) {
  const id = useId();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <ul className="divide-y divide-line rounded-3xl border border-line bg-surface px-2 shadow-card sm:px-4">
      {items.map((item, index) => {
        const isOpen = open === index;
        const buttonId = `${id}-q-${index}`;
        const panelId = `${id}-a-${index}`;

        return (
          <li key={item.q}>
            <h3>
              <button
                type="button"
                id={buttonId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : index)}
                className="flex w-full items-center gap-4 px-3 py-5 text-start sm:px-4"
              >
                <span className="flex-1 text-[16px] leading-7 font-semibold text-heading sm:text-[17px]">{item.q}</span>
                <span
                  className={cx(
                    "grid size-8 shrink-0 place-items-center rounded-full border transition duration-300 ease-out-soft",
                    isOpen ? "rotate-45 border-brand bg-brand text-ink" : "border-line-strong text-heading",
                  )}
                >
                  <Icon node={Plus} size={16} />
                </span>
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={buttonId} className="faq-panel" data-open={isOpen ? "" : undefined}>
              <div className="overflow-hidden">
                <p className="px-3 pb-5 text-[15px] leading-8 text-muted sm:px-4 sm:pe-16">{item.a}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
