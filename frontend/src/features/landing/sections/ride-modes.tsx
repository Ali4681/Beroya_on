import { BellRing, CalendarCheck, CalendarClock, CalendarDays, Clock, UserCheck, Zap, type IconNode } from "lucide";

import { delay } from "@/shared/lib/css-vars";
import { formatNumber } from "@/shared/lib/format";
import { Icon } from "@/shared/ui/icon";

import { PeekCard } from "../components/peek-card";
import { Phone } from "../components/phone";
import { Section } from "../components/section";
import { SectionHeading } from "../components/section-heading";
import { DriverAssignedScreen, ScheduleScreen } from "../screens/customer-screens";
import type { SectionProps } from "../types";

const timelineIcons: IconNode[] = [CalendarDays, Clock, CalendarCheck, UserCheck, BellRing];

export function RideModes({ dict, locale }: SectionProps) {
  const modes = dict.modes;

  return (
    <Section id="modes">
      <div className="shell">
        <SectionHeading eyebrow={modes.eyebrow} title={modes.title} align="center" />

        <div className="mt-16 grid gap-6 lg:grid-cols-2">
          <PeekCard
            tag={modes.now.tag}
            icon={Zap}
            title={modes.now.title}
            body={modes.now.body}
            className="h-[40rem] bg-[linear-gradient(165deg,color-mix(in_oklab,var(--brand)_20%,var(--surface)),var(--surface)_62%)]"
            tagClass="bg-brand text-ink"
            phone={
              <Phone>
                <DriverAssignedScreen dict={dict} />
              </Phone>
            }
          />
          <PeekCard
            tag={modes.later.tag}
            icon={CalendarClock}
            title={modes.later.title}
            body={modes.later.body}
            className="h-[40rem] bg-[linear-gradient(165deg,color-mix(in_oklab,var(--warning)_16%,var(--surface)),var(--surface)_62%)]"
            tagClass="bg-heading text-canvas"
            revealDelay={120}
            phone={
              <Phone>
                <ScheduleScreen dict={dict} />
              </Phone>
            }
          />
        </div>

        <div data-reveal className="mt-20">
          <h3 className="text-center text-xl font-semibold text-heading sm:text-2xl">{modes.scheduleTitle}</h3>
          <ol className="relative mt-12 grid gap-8 md:grid-cols-5 md:gap-4">
            <span aria-hidden="true" className="absolute inset-x-[10%] top-7 hidden h-px bg-line-strong md:block" />
            <span aria-hidden="true" className="line-grow absolute inset-x-[10%] top-7 hidden h-px bg-brand md:block" />
            {modes.scheduleSteps.map((step, index) => (
              <li
                key={step}
                className="stagger-in relative flex items-center gap-4 md:flex-col md:text-center"
                style={delay(250 + index * 200)}
              >
                <span className="relative grid size-14 shrink-0 place-items-center rounded-2xl bg-surface text-heading shadow-card ring-1 ring-line">
                  <Icon node={timelineIcons[index]} size={22} />
                  <span className="absolute -top-2 -end-2 grid size-6 place-items-center rounded-full bg-brand text-[11px] font-bold text-ink">
                    {formatNumber(index + 1, locale)}
                  </span>
                </span>
                <span className="text-[15px] leading-7 font-medium text-heading md:mt-2 md:max-w-[11rem]">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Section>
  );
}
