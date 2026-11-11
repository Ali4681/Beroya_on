import { Activity, Clock, Hourglass, MapPinned, Navigation, Route, ShieldCheck, Star, Timer, type IconNode } from "lucide";

import { cssVars, delay } from "@/shared/lib/css-vars";
import { Icon } from "@/shared/ui/icon";

import { DestinationPin, MapCar, MapSvg, PickupPin, RouteLine, StopDot } from "../components/map";
import { Avatar } from "../components/phone";
import { Section } from "../components/section";
import { SectionHeading } from "../components/section-heading";
import type { SectionProps } from "../types";

// 1000×520 street grid. Road centre lines: x ∈ {49, 135, 221, …, 995}, y ∈ {33, 113, 193, 273, 353, 433, 513}.
const liveMap = {
  step: [86, 80],
  block: [72, 66],
  origin: [-30, -40],
  parks: ["6,1", "2,4", "9,4", "4,0"],
  river: "M-20 150C100 132 210 70 300 -20H362C262 84 150 176-20 206Z",
  avenues: ["M-10 520C200 470 420 500 640 430S900 330 1010 300"],
} as const;

const approach = "M49 433H221";
const trip = "M221 433V287Q221 273 235 273H551Q565 273 565 259V127Q565 113 579 113H737";
// Approach + trip as one path; the car reaches the pickup at 17.4% of its length.
const fullPath = "M49 433H221V287Q221 273 235 273H551Q565 273 565 259V127Q565 113 579 113H737";

const featureIcons: IconNode[] = [Navigation, Clock, Route, MapPinned, Activity];
const factorIcons: IconNode[] = [Route, Timer, Hourglass];

function LiveMap({ dict }: SectionProps) {
  const { live } = dict;
  const driver = dict.mock.driver;

  return (
    <div data-reveal data-live className="relative mt-14 overflow-hidden rounded-[32px] bg-surface ring-1 ring-line shadow-float">
      <div className="relative aspect-[16/10] sm:aspect-[16/9] lg:aspect-[2.25/1]">
        <MapSvg width={1000} height={520} base={liveMap} className="rtl:-scale-x-100">
          <RouteLine d={approach} tone="muted" dashed width={4} />
          <RouteLine d={trip} draw="reveal" delay={300} width={5} />
          <PickupPin x={221} y={433} />
          <StopDot x={393} y={273} />
          <DestinationPin x={737} y={113} />
          <MapCar path={fullPath} dur="12s" keyPoints="0;0.174;0.174;1;1" keyTimes="0;0.25;0.5;0.8;1" />
        </MapSvg>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_50%,transparent_55%,color-mix(in_oklab,var(--surface)_70%,transparent))]" />
      </div>

      <div className="grid gap-3 p-4 sm:contents">
        <ol
          aria-label={live.eyebrow}
          className="glass flex items-center gap-1 overflow-x-auto rounded-2xl p-1.5 no-scrollbar sm:absolute sm:top-5 sm:start-5"
        >
          {live.statuses.map((status, index) => (
            <li
              key={status}
              data-current={index === 2 ? "" : undefined}
              style={cssVars({ "--i": String(index) })}
              className="status-step shrink-0 rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap text-muted"
            >
              {status}
            </li>
          ))}
        </ol>

        <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3 sm:absolute sm:top-5 sm:end-5">
          <span className="grid size-10 place-items-center rounded-xl bg-brand/15 text-accent">
            <Icon node={Clock} size={19} />
          </span>
          <span className="flex flex-col">
            <span className="text-xs text-muted">{live.etaLabel}</span>
            <span className="text-lg leading-tight font-semibold text-heading">{live.etaValue}</span>
          </span>
        </div>

        <div className="glass flex items-center gap-3.5 rounded-2xl p-3.5 sm:absolute sm:end-5 sm:bottom-5 sm:w-[21rem]">
          <Avatar initials={driver.initials} className="size-12 text-base" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[15px] font-semibold text-heading">
              {driver.name}
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
                <Icon node={Star} size={12} className="fill-warning text-warning" />
                {driver.rating}
              </span>
            </p>
            <p className="truncate text-[13px] text-muted">{driver.car}</p>
          </div>
          <span dir="ltr" className="rounded-lg border border-line-strong bg-surface px-2 py-1 font-mono text-xs font-semibold tracking-wider text-heading">
            {driver.plate}
          </span>
        </div>
      </div>
    </div>
  );
}

function PriceChart({ dict }: SectionProps) {
  const chart = dict.pricing.chart;

  return (
    <div className="rounded-2xl bg-surface-2 p-4 ring-1 ring-line sm:p-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-muted">
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-5 rounded-full border-t-2 border-dashed border-warning" />
          {chart.demand}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-[3px] w-5 rounded-full bg-brand-strong" />
          {chart.price}
        </span>
      </div>
      <svg viewBox="0 0 400 130" className="mt-3 h-auto w-full rtl:-scale-x-100" aria-hidden="true" focusable="false">
        {[26, 65, 104].map((y) => (
          <line key={y} x1="0" x2="400" y1={y} y2={y} className="stroke-line" strokeWidth="1" />
        ))}
        <path
          d="M0 104C34 98 48 58 84 62S132 112 172 92S226 14 262 30S318 106 352 78S384 40 400 44"
          fill="none"
          pathLength={1}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="0.012 0.014"
          className="stroke-warning"
        />
        <path
          d="M0 82H400"
          fill="none"
          pathLength={1}
          strokeWidth="3.5"
          strokeLinecap="round"
          className="route-draw stroke-brand-strong"
          style={{ animationDelay: "400ms" }}
        />
        <circle cx="400" cy="82" r="5" className="fill-brand-strong" />
      </svg>
      <p className="mt-3 text-[13px] leading-6 text-muted">{chart.caption}</p>
    </div>
  );
}

function PricingBlock(props: SectionProps) {
  const { pricing } = props.dict;

  return (
    <div className="mt-28 grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
      <div>
        <SectionHeading eyebrow={pricing.eyebrow} title={pricing.title} description={pricing.description} />
        <div data-reveal className="mt-10">
          <p className="text-sm font-semibold text-heading">{pricing.factorsTitle}</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {pricing.factors.map((factor, index) => (
              <li
                key={factor}
                className="stagger-in flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-sm font-semibold text-heading sm:flex-col sm:items-start"
                style={delay(200 + index * 120)}
              >
                <span className="grid size-9 place-items-center rounded-xl bg-brand/12 text-accent">
                  <Icon node={factorIcons[index]} size={18} />
                </span>
                {factor}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div data-reveal style={delay(120)} className="card rounded-[30px] p-5 sm:p-7">
        <div className="flex flex-wrap-reverse items-start justify-between gap-x-4 gap-y-3">
          <div>
            <p className="text-sm text-muted">{pricing.estimateLabel}</p>
            <p className="mt-1 text-[1.9rem] leading-tight font-semibold whitespace-nowrap text-heading sm:text-[2.4rem]">
              {pricing.estimateValue}
            </p>
          </div>
          <span className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/12 px-3 py-1.5 text-xs font-semibold text-success">
            <span className="size-1.5 rounded-full bg-current" />
            {pricing.estimateHint}
          </span>
        </div>

        <div className="mt-6">
          <PriceChart {...props} />
        </div>

        <div className="mt-4 flex gap-3.5 rounded-2xl bg-[color-mix(in_oklab,var(--brand)_10%,var(--surface))] p-4 ring-1 ring-brand/25">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-ink">
            <Icon node={ShieldCheck} size={20} />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-heading">{pricing.promise.title}</p>
            <p className="mt-1 text-sm leading-6 text-muted">{pricing.promise.body}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LivePricing(props: SectionProps) {
  const { live } = props.dict;

  return (
    <Section id="live">
      <div className="shell">
        <SectionHeading eyebrow={live.eyebrow} title={live.title} description={live.description} align="center" />
        <LiveMap {...props} />
        <ul data-reveal className="mt-6 flex flex-wrap justify-center gap-2.5">
          {live.features.map((feature, index) => (
            <li
              key={feature}
              className="stagger-in inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-heading"
              style={delay(index * 90)}
            >
              <Icon node={featureIcons[index]} size={15} className="text-accent" />
              {feature}
            </li>
          ))}
        </ul>
        <PricingBlock {...props} />
      </div>
    </Section>
  );
}
