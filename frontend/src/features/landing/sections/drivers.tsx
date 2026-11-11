import { CalendarClock, MapPinned, Power, Receipt, Wallet, type IconNode } from "lucide";

import { delay } from "@/shared/lib/css-vars";
import { cx } from "@/shared/lib/cx";
import { Icon } from "@/shared/ui/icon";

import { LottieScreen } from "../components/lottie-screen";
import { Phone } from "../components/phone";
import { Section } from "../components/section";
import { SectionHeading } from "../components/section-heading";
import type { SectionProps } from "../types";

const DRIVER_HOME_LOTTIE = encodeURI("/driver/قبول الطلب السائق.json");

const valueIcons: IconNode[] = [Power, MapPinned, Receipt, CalendarClock, Wallet];

export function Drivers({ dict }: SectionProps) {
  const { drivers } = dict;
  const next = dict.mock.scheduled.items[0];

  return (
    <Section id="drivers" tone="surface" className="overflow-hidden">
      <div className="shell grid gap-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
        <div>
          <SectionHeading eyebrow={drivers.eyebrow} title={drivers.title} description={drivers.description} />
          <ul className="mt-10 grid gap-3.5 sm:grid-cols-2">
            {drivers.values.map((value, index) => (
              <li
                key={value.title}
                data-reveal
                style={delay(index * 90)}
                className={cx(
                  "flex gap-4 rounded-[22px] border border-line bg-canvas p-5",
                  index === drivers.values.length - 1 && "sm:col-span-2",
                )}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-heading text-canvas">
                  <Icon node={valueIcons[index]} size={19} />
                </span>
                <span>
                  <span className="block text-[15px] font-semibold text-heading">{value.title}</span>
                  <span className="mt-1 block text-sm leading-6 text-muted">{value.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div data-reveal data-live className="relative flex justify-center py-6">
          <div aria-hidden="true" className="absolute top-1/2 left-1/2 size-[30rem] -translate-1/2 rounded-full border border-dashed border-line-strong" />
          <div aria-hidden="true" className="absolute top-1/2 left-1/2 size-[22rem] -translate-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--success)_24%,transparent),transparent)]" />
          <div className="relative [--phone-zoom:0.88] sm:[--phone-zoom:1]">
            <Phone>
              <LottieScreen src={DRIVER_HOME_LOTTIE} />
            </Phone>
          </div>
          <div className="glass animate-float-slow absolute top-[12%] -start-1 hidden items-center gap-3 rounded-2xl px-4 py-3 shadow-float sm:flex lg:-start-6">
            <span className="grid size-9 place-items-center rounded-xl bg-warning/15 text-warning">
              <Icon node={CalendarClock} size={18} />
            </span>
            <span className="flex flex-col">
              <span className="text-xs text-muted">{dict.driverTools.scheduled.eyebrow}</span>
              <span className="text-sm font-semibold text-heading">
                {next.day} · {next.time}
              </span>
            </span>
          </div>
          <div className="glass animate-float absolute -end-1 bottom-[16%] hidden items-center gap-2.5 rounded-full py-2 ps-2 pe-4 shadow-float sm:flex lg:-end-4">
            <span className="grid size-8 place-items-center rounded-full bg-success text-white">
              <Icon node={Power} size={15} />
            </span>
            <span className="text-sm font-semibold text-heading">{dict.mock.driverApp.online}</span>
          </div>
        </div>
      </div>
    </Section>
  );
}
