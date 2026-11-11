import { ArrowLeft, CalendarClock, Check, ShieldCheck, Stamp as StampIcon, Timer, type IconNode } from "lucide";
import type { ReactNode } from "react";

import { cx } from "@/shared/lib/cx";
import { Icon } from "@/shared/ui/icon";

import { ScreenCycler } from "../client/screen-cycler";
import { ButtonLink } from "../components/button-link";
import { Phone } from "../components/phone";
import { Eyebrow } from "../components/section-heading";
import { StoreButtons } from "../components/store-buttons";
import {
  ActiveRideScreen,
  CategoryScreen,
  DriverAssignedScreen,
  HomeScreen,
  RideCompleteScreen,
  SearchingScreen,
} from "../screens/customer-screens";
import type { SectionProps } from "../types";

function FloatingCard({
  icon,
  title,
  value,
  tone,
  className,
  delay,
  float = "animate-float",
}: {
  icon: IconNode;
  title: string;
  value: string;
  tone: string;
  className?: string;
  delay: number;
  float?: string;
}) {
  return (
    <div className={cx("absolute z-10 animate-rise", className)} style={{ animationDelay: `${delay}ms` }}>
      <div className={cx("glass flex items-center gap-3 rounded-2xl py-2.5 ps-2.5 pe-4 shadow-float", float)}>
        <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", tone)}>
          <Icon node={icon} size={19} />
        </span>
        <span className="whitespace-nowrap">
          <span className="block text-[11.5px] text-muted">{title}</span>
          <span className="block text-[14px] font-semibold text-heading">{value}</span>
        </span>
      </div>
    </div>
  );
}

function HeroBackdrop() {
  const roads = [
    "M-80 760C180 640 300 470 560 450S980 560 1240 380 1600 180 1700 160",
    "M-60 220C200 260 420 160 640 230S1040 420 1300 300 1580 120 1720 90",
  ];

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-56 left-1/2 size-[64rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand)_22%,transparent),transparent)]" />
      <div className="absolute top-40 -end-40 size-[36rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--teal)_20%,transparent),transparent)]" />
      <div className="grid-fade absolute inset-0 opacity-60" />
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full opacity-70 dark:opacity-50">
        {roads.map((d) => (
          <g key={d} fill="none" strokeLinecap="round">
            <path d={d} strokeWidth={34} className="stroke-line" />
            <path d={d} strokeWidth={2} strokeDasharray="14 14" className="animate-dash stroke-surface [animation-duration:2.4s]" />
          </g>
        ))}
        <path
          d={roads[0]}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          pathLength={1}
          className="route-draw route-draw-now stroke-brand-strong/70 [--delay:600ms]"
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-b from-transparent to-canvas" />
    </div>
  );
}

export function Hero({ dict }: SectionProps) {
  const hero = dict.hero;
  const screens: ReactNode[] = [
    <HomeScreen key="home" dict={dict} />,
    <CategoryScreen key="category" dict={dict} />,
    <SearchingScreen key="searching" dict={dict} />,
    <DriverAssignedScreen key="assigned" dict={dict} />,
    <ActiveRideScreen key="active" dict={dict} />,
    <RideCompleteScreen key="complete" dict={dict} />,
  ];

  return (
    <section id="top" className="relative isolate overflow-hidden pt-32 pb-16 sm:pt-40 lg:pt-44 lg:pb-24">
      <HeroBackdrop />

      <div className="shell grid items-center gap-14 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-10">
        <div className="text-center lg:text-start">
          <Eyebrow className="animate-rise">{hero.eyebrow}</Eyebrow>

          <h1 className="mt-7 text-[2.9rem] leading-[1.08] font-semibold text-balance text-heading sm:text-[4rem] lg:text-[4.6rem] ltr:tracking-[-0.035em] rtl:leading-[1.25]">
            <span className="block animate-rise [animation-delay:90ms]">{hero.titleLead}</span>
            <span className="text-gradient block animate-rise pb-2 [animation-delay:190ms]">{hero.titleAccent}</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl animate-rise text-[17px] leading-8 text-pretty text-muted [animation-delay:290ms] sm:text-lg sm:leading-9 lg:mx-0">
            {hero.description}
          </p>

          <div className="mt-10 flex animate-rise flex-col items-center gap-4 [animation-delay:390ms] sm:flex-row sm:flex-wrap sm:justify-center lg:justify-start">
            <StoreButtons common={dict.common} />
            <ButtonLink href="#drivers" variant="secondary" className="group">
              {dict.common.joinDriver}
              <Icon
                node={ArrowLeft}
                size={17}
                className="transition duration-300 ltr:rotate-180 ltr:group-hover:translate-x-1 rtl:group-hover:-translate-x-1"
              />
            </ButtonLink>
          </div>

          <ul className="mt-10 flex animate-rise flex-wrap justify-center gap-x-6 gap-y-3 text-[14px] text-muted [animation-delay:490ms] lg:justify-start">
            {hero.trust.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="grid size-5 place-items-center rounded-full bg-success/15 text-success">
                  <Icon node={Check} size={12} strokeWidth={2.6} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-[36rem] [--phone-zoom:0.84] sm:[--phone-zoom:1]">
          <div className="relative grid place-items-center py-4">
            <div aria-hidden="true" className="absolute inset-0 grid place-items-center">
              <div className="absolute size-[25rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand)_30%,transparent),transparent)] sm:size-[30rem]" />
              <svg viewBox="0 0 520 520" className="absolute size-[27rem] sm:size-[33rem]">
                <circle cx="260" cy="260" r="236" fill="none" strokeWidth="1.2" strokeDasharray="3 9" className="stroke-line-strong" />
                <circle cx="260" cy="260" r="182" fill="none" strokeWidth="1" className="stroke-line" />
                <g>
                  <animateMotion
                    dur="22s"
                    repeatCount="indefinite"
                    rotate="auto"
                    path="M260 24A236 236 0 1 1 259.9 24Z"
                  />
                  <circle r="14" className="fill-brand/25" />
                  <rect x="-10" y="-5.6" width="20" height="11.2" rx="3.6" className="fill-heading" />
                  <rect x="1.6" y="-4.2" width="4.8" height="8.4" rx="1.6" className="fill-brand" />
                </g>
              </svg>
            </div>

            <div className="relative animate-rise [animation-delay:150ms]">
              <Phone>
                <ScreenCycler screens={screens} durations={[3200, 3600, 2800, 3800, 4800, 4200]} />
              </Phone>
            </div>

            <FloatingCard
              icon={Timer}
              title={hero.floating.eta.title}
              value={hero.floating.eta.value}
              tone="bg-brand/15 text-accent"
              className="top-[4%] -start-2 sm:-start-16"
              delay={650}
            />
            <FloatingCard
              icon={CalendarClock}
              title={hero.floating.scheduled.title}
              value={hero.floating.scheduled.value}
              tone="bg-warning/15 text-warning"
              className="top-[30%] -end-3 hidden sm:block sm:-end-20"
              delay={800}
              float="animate-float-slow"
            />
            <FloatingCard
              icon={StampIcon}
              title={hero.floating.stamp.title}
              value={hero.floating.stamp.value}
              tone="bg-teal/15 text-teal dark:text-brand"
              className="bottom-[27%] -start-3 hidden sm:block sm:-start-24"
              delay={950}
              float="animate-float-slow"
            />
            <FloatingCard
              icon={ShieldCheck}
              title={hero.floating.safety.title}
              value={hero.floating.safety.value}
              tone="bg-success/15 text-success"
              className="bottom-[6%] -end-2 sm:-end-16"
              delay={1100}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
