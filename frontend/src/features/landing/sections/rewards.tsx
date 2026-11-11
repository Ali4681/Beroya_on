import { BadgePercent, CalendarClock, CarFront, Copy, Gift, Percent, Repeat, Sparkles, TicketPercent, type IconNode } from "lucide";

import { delay } from "@/shared/lib/css-vars";
import { cx } from "@/shared/lib/cx";
import { Icon } from "@/shared/ui/icon";

import { Section } from "../components/section";
import { SectionHeading } from "../components/section-heading";
import type { SectionProps } from "../types";

const perkIcons: IconNode[] = [BadgePercent, Gift, Sparkles];
const fieldIcons: IconNode[] = [Percent, CalendarClock, Repeat, CarFront];

function DiscountTicket({ dict }: SectionProps) {
  const { ticket, codes } = dict.rewards;

  return (
    <div data-reveal="scale" style={delay(150)} className="relative mx-auto w-full max-w-md">
      <div aria-hidden="true" className="absolute -inset-10 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand)_26%,transparent),transparent)]" />
      <div className="ticket-notch relative grid grid-rows-[1fr_1fr] overflow-hidden rounded-[30px] bg-[linear-gradient(140deg,#2b7e84,#1fb5c2_60%,#22e0ee)] text-white shadow-float">
        <span className="sheen-overlay" />
        <div className="relative p-7 pb-6">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-white/85">
              <Icon node={TicketPercent} size={17} />
              {codes.title}
            </span>
            <span dir="ltr" className="text-[10px] font-semibold tracking-[0.3em] text-white/70">
              BEROYA
            </span>
          </div>
          <p className="mt-4 flex items-baseline gap-3">
            <span className="text-6xl leading-none font-bold tracking-tight">{ticket.percent}</span>
            <span className="text-xl font-semibold text-white/85">{ticket.off}</span>
          </p>
          <span dir="ltr" className="mt-5 inline-flex items-center gap-2.5 rounded-xl bg-ink/25 px-3.5 py-2 font-mono text-sm font-semibold tracking-wider">
            {ticket.code}
            <Icon node={Copy} size={14} className="opacity-70" />
          </span>
        </div>

        <div className="relative flex flex-col gap-4 bg-ink/10 p-7 pt-6">
          <span aria-hidden="true" className="absolute inset-x-6 top-0 border-t-2 border-dashed border-white/35" />
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[11px] text-white/70">{ticket.validLabel}</p>
              <p className="mt-0.5 font-semibold">{ticket.valid}</p>
            </div>
            <div>
              <p className="text-[11px] text-white/70">{ticket.usesLabel}</p>
              <p className="mt-0.5 flex items-center gap-2 font-semibold">
                {ticket.uses}
                <span className="flex gap-1">
                  {Array.from({ length: ticket.usesTotal }, (_, index) => (
                    <span key={index} className={cx("size-2 rounded-full", index < ticket.usesLeft ? "bg-white" : "bg-white/30")} />
                  ))}
                </span>
              </p>
            </div>
          </div>
          <div>
            <p className="text-[11px] text-white/70">{ticket.eligibleLabel}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {ticket.eligible.map((category) => (
                <span key={category} className="rounded-full bg-white/18 px-2.5 py-1 text-xs font-semibold">
                  {category}
                </span>
              ))}
            </div>
          </div>
          <span className="mt-auto flex h-11 items-center justify-center rounded-full bg-white text-sm font-semibold text-ink">
            {ticket.cta}
          </span>
        </div>
      </div>
    </div>
  );
}

export function Rewards(props: SectionProps) {
  const { rewards } = props.dict;

  return (
    <Section id="rewards" tone="surface">
      <div className="shell grid gap-16 lg:grid-cols-2 lg:items-center">
        <div>
          <SectionHeading eyebrow={rewards.eyebrow} title={rewards.title} description={rewards.description} />
          <ul data-reveal className="mt-6 flex flex-wrap gap-2.5">
            {rewards.perks.map((perk, index) => (
              <li
                key={perk}
                className="stagger-in inline-flex items-center gap-2 rounded-full bg-brand/12 px-4 py-2 text-sm font-semibold text-accent"
                style={delay(index * 100)}
              >
                <Icon node={perkIcons[index]} size={15} />
                {perk}
              </li>
            ))}
          </ul>

          <div data-reveal className="mt-10 rounded-[26px] border border-line bg-canvas p-6 sm:p-7">
            <h3 className="text-lg font-semibold text-heading">{rewards.codes.title}</h3>
            <p className="mt-2 text-[15px] leading-7 text-muted">{rewards.codes.body}</p>
            <ul className="mt-5 grid grid-cols-2 gap-3">
              {rewards.codes.fields.map((field, index) => (
                <li key={field} className="flex items-center gap-2.5 text-sm font-medium text-heading">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-accent ring-1 ring-line">
                    <Icon node={fieldIcons[index]} size={15} />
                  </span>
                  {field}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DiscountTicket {...props} />
      </div>
    </Section>
  );
}
