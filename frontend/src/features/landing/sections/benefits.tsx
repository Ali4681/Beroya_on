import { CalendarClock, CarFront, HeartHandshake, Zap, type IconNode } from "lucide";

import { delay } from "@/shared/lib/css-vars";
import { Icon } from "@/shared/ui/icon";

import type { SectionProps } from "../types";

const icons: IconNode[] = [Zap, CalendarClock, CarFront, HeartHandshake];
const tones = [
  "bg-brand/15 text-accent",
  "bg-warning/15 text-warning",
  "bg-teal/15 text-teal dark:text-brand",
  "bg-success/15 text-success",
];

export function Benefits({ dict }: SectionProps) {
  return (
    <section className="relative pb-6">
      <div className="shell">
        <ul className="grid gap-px overflow-hidden rounded-[28px] border border-line bg-line shadow-card sm:grid-cols-2 lg:grid-cols-4">
          {dict.benefits.map((benefit, index) => (
            <li key={benefit.title} data-reveal style={delay(index * 90)} className="flex items-start gap-4 bg-surface p-6 lg:p-7">
              <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${tones[index]}`}>
                <Icon node={icons[index]} size={22} />
              </span>
              <span>
                <span className="block text-[17px] font-semibold text-heading">{benefit.title}</span>
                <span className="mt-1 block text-[14.5px] leading-7 text-muted">{benefit.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
