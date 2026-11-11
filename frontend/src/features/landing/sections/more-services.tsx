import {
  ArrowUpRight,
  Briefcase,
  Building,
  Bus,
  CalendarDays,
  Camera,
  Castle,
  Clock,
  Info,
  Landmark,
  Mic,
  PartyPopper,
  Route,
  Stamp as StampIcon,
  UserCheck,
  Users,
  type IconNode,
} from "lucide";

import { cssVars, delay } from "@/shared/lib/css-vars";
import { cx } from "@/shared/lib/cx";
import { Icon } from "@/shared/ui/icon";

import { ButtonLink } from "../components/button-link";
import { NeonCar } from "../components/neon-car";
import { Section } from "../components/section";
import { Eyebrow } from "../components/section-heading";
import { CatalogStamp } from "../components/stamp-catalog";
import { contactHref } from "../links";
import type { SectionProps } from "../types";

const rentUseIcons: IconNode[] = [Clock, Route, Users, Briefcase, PartyPopper];
const tourismIcons: IconNode[] = [Castle, Camera, Landmark];
const businessIcons: IconNode[] = [Mic, Users, Building, PartyPopper, Bus];

function CardTitle({ children }: { children: string }) {
  return (
    <h2 className="mt-5 text-[1.9rem] leading-tight font-semibold text-balance text-heading sm:text-[2.3rem] rtl:leading-[1.35]">
      {children}
    </h2>
  );
}

function RentCard({ dict }: SectionProps) {
  const { rent } = dict;

  return (
    <article
      id="rent"
      data-anchor
      data-reveal
      className="group flex flex-col overflow-hidden rounded-[32px] border border-line bg-surface p-7 sm:p-10"
    >
      <Eyebrow className="self-start">{rent.eyebrow}</Eyebrow>
      <CardTitle>{rent.title}</CardTitle>
      <p className="mt-4 max-w-md text-base leading-8 text-muted">{rent.description}</p>

      <div className="relative mt-8 overflow-hidden rounded-[26px] border border-line bg-[linear-gradient(165deg,#0b1c1f_0%,#071014_48%,#05080c_100%)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 left-1/2 size-[28rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--teal)_35%,transparent),transparent_70%)] blur-2xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--brand)_12%,transparent),transparent)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[12%] bottom-[32%] h-24 rounded-[100%] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand)_20%,transparent),transparent)] blur-md"
        />

        <span className="absolute top-4 start-4 z-10 inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/15 px-3 py-1.5 text-xs font-semibold text-brand">
          <Icon node={UserCheck} size={14} />
          {rent.badge}
        </span>

        <div className="relative z-10 px-5 pb-5 pt-12">
          <div className="mx-auto w-[94%] max-w-md translate-y-1 rtl:-scale-x-100">
            <NeonCar />
          </div>

          <div className="mt-5">
            <p className="text-xs font-medium text-white/55">{rent.durationLabel}</p>
            <div className="mt-2 grid grid-cols-4 gap-1.5 rounded-2xl border border-white/10 bg-[#0d1418]/70 p-1.5 backdrop-blur-md">
              {rent.durations.map((duration, index) => (
                <span
                  key={duration}
                  className={cx(
                    "rounded-xl py-2 text-center text-[13px] font-semibold whitespace-nowrap",
                    index === 1 ? "bg-brand text-ink shadow-glow" : "text-white/75",
                  )}
                >
                  {duration}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ul className="mt-7 flex flex-wrap gap-2">
        {rent.uses.map((use, index) => (
          <li key={use} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[13px] font-medium text-heading">
            <Icon node={rentUseIcons[index]} size={14} className="text-accent" />
            {use}
          </li>
        ))}
      </ul>
      <p className="mt-auto flex items-center gap-2 pt-7 text-[13px] text-muted">
        <Icon node={Info} size={15} className="shrink-0" />
        {rent.note}
      </p>
    </article>
  );
}

const crenels = (from: number, to: number, y: number, step = 12) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, index) => (
    <rect key={index} x={from + index * step} y={y} width={7} height={7} />
  ));

function CitadelArt() {
  return (
    <svg viewBox="0 0 480 230" className="w-full rtl:-scale-x-100" aria-hidden="true" focusable="false">
      <circle cx="396" cy="58" r="34" className="fill-warning/20" />
      <circle cx="396" cy="58" r="20" className="fill-warning/45" />
      <path d="M24 214C86 204 110 150 140 134H346C376 150 400 204 458 214Z" className="[fill:color-mix(in_oklab,var(--warning)_20%,var(--surface))]" />
      <g opacity="0.4" className="[fill:color-mix(in_oklab,var(--warning)_35%,var(--heading))]">
        <path d="M146 134V104H340V134Z" />
        {crenels(146, 334, 97)}
      </g>
      <g opacity="0.55" className="[fill:color-mix(in_oklab,var(--warning)_35%,var(--heading))]">
        <rect x="160" y="78" width="30" height="56" />
        {crenels(160, 184, 71, 11.5)}
        <rect x="296" y="82" width="28" height="52" />
        {crenels(296, 318, 75, 11)}
        <rect x="224" y="64" width="38" height="70" />
        {crenels(224, 256, 57, 10.7)}
        <rect x="239" y="34" width="8" height="24" />
        <path d="M236 34a7 7 0 0 1 14 0Z" />
        <rect x="88" y="132" width="42" height="70" rx="2" />
        {crenels(88, 124, 125)}
        <path d="M20 160H88V172H82a9 9 0 0 0-18 0H54a9 9 0 0 0-18 0H26a6 6 0 0 0-6-6Z" />
      </g>
      <rect x="104" y="174" width="10" height="28" rx="5" className="fill-surface/70" />
      <rect y="210" width="480" height="20" className="fill-heading/8" />
      <path d="M0 220H480" className="stroke-heading/25" strokeWidth="2" strokeDasharray="10 12" />
      <path d="M0 196C30 196 50 190 70 182S90 174 104 176" fill="none" className="stroke-brand-strong" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 8" />
      <g transform="translate(109 168)">
        <circle r="11" className="animate-pulse-ring fill-brand/40 [transform-box:fill-box] origin-center" />
        <circle r="7" className="fill-brand-strong stroke-surface" strokeWidth="2.5" />
      </g>
    </svg>
  );
}

function TourismCard({ dict }: SectionProps) {
  const { tourism } = dict;

  return (
    <article
      id="tourism"
      data-anchor
      data-reveal
      style={delay(120)}
      className="relative flex flex-col overflow-hidden rounded-[32px] border border-line bg-[linear-gradient(170deg,color-mix(in_oklab,var(--warning)_14%,var(--surface)),var(--surface)_68%)] p-7 sm:p-10"
    >
      <Eyebrow className="self-start">{tourism.eyebrow}</Eyebrow>
      <CardTitle>{tourism.title}</CardTitle>
      <p className="mt-4 max-w-md text-base leading-8 text-muted">{tourism.description}</p>

      <div className="relative mt-8">
        <CitadelArt />
        <CatalogStamp
          id="aleppo"
          names={dict.stampNames}
          className="stamp-press absolute -top-8 start-0 w-28 sm:w-32"
          style={cssVars({ "--rot": "8deg", "--delay": "700ms" })}
        />
      </div>

      <ul className="mt-7 flex flex-wrap gap-2">
        {tourism.items.map((item, index) => (
          <li key={item} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/70 px-3 py-1.5 text-[13px] font-medium text-heading">
            <Icon node={tourismIcons[index]} size={14} className="text-accent" />
            {item}
          </li>
        ))}
      </ul>
      <p className="mt-auto flex items-center gap-2 pt-7 text-[13px] font-medium text-accent">
        <Icon node={StampIcon} size={15} className="shrink-0" />
        {tourism.passportLink}
      </p>
    </article>
  );
}

function BusinessBand({ dict, support }: SectionProps) {
  const { business } = dict;

  return (
    <div
      id="business"
      data-anchor
      data-reveal
      className="relative mt-6 overflow-hidden rounded-[32px] bg-surface px-7 py-10 text-body ring-1 ring-line sm:px-12 sm:py-14"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="grid-fade absolute inset-0 opacity-70" />
        <div className="absolute -end-32 -top-32 size-[30rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand)_18%,transparent),transparent)]" />
      </div>
      <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
        <div>
          <Eyebrow>{business.eyebrow}</Eyebrow>
          <h2 className="mt-5 text-[1.9rem] leading-tight font-semibold text-balance text-heading sm:text-[2.4rem] rtl:leading-[1.35]">
            {business.title}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-8 text-muted">{business.description}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <ButtonLink href={contactHref(support)}>
              {business.cta}
              <Icon node={ArrowUpRight} size={18} className="rtl:-scale-x-100" />
            </ButtonLink>
            <span className="text-[13px] text-muted">{business.note}</span>
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-3">
          {business.items.map((item, index) => (
            <li
              key={item}
              className={cx(
                "flex items-center gap-3 rounded-2xl border border-line bg-canvas p-4 text-sm font-semibold text-heading",
                index === business.items.length - 1 && "col-span-2",
              )}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/12 text-brand-strong">
                <Icon node={businessIcons[index] ?? CalendarDays} size={17} />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function MoreServices(props: SectionProps) {
  return (
    <Section id="more-services">
      <div className="shell">
        <div className="grid gap-6 lg:grid-cols-2">
          <RentCard {...props} />
          <TourismCard {...props} />
        </div>
        <BusinessBand {...props} />
      </div>
    </Section>
  );
}
