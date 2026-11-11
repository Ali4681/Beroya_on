import {
  CarFront,
  Check,
  Coffee,
  Eye,
  Flag,
  HeartHandshake,
  House,
  Phone as PhoneIcon,
  Plane,
  Plus,
  Users,
  type IconNode,
} from "lucide";

import { delay } from "@/shared/lib/css-vars";
import { cx } from "@/shared/lib/cx";
import { formatNumber } from "@/shared/lib/format";
import { Icon } from "@/shared/ui/icon";

import { DestinationPin, MapCar, MapSvg, PickupPin, RouteLine, StopDot } from "../components/map";
import { Avatar } from "../components/phone";
import { Section } from "../components/section";
import { Eyebrow } from "../components/section-heading";
import type { SectionProps } from "../types";

// 640×400 street grid. Road centre lines: x ∈ {44, 114, 184, …, 604}, y ∈ {34, 98, 162, 226, 290, 354}.
const stopsMap = {
  step: [70, 64],
  block: [58, 52],
  origin: [-20, -24],
  parks: ["5,2", "1,0", "7,4"],
  avenues: ["M-10 392C140 360 300 380 420 352S600 300 650 304"],
} as const;

const stopsRoute =
  "M114 290V240Q114 226 128 226H310Q324 226 324 212V112Q324 98 338 98H450Q464 98 464 112V212Q464 226 478 226H534";

const stopPoints = [
  { x: 114, y: 290, labelY: 322 },
  { x: 254, y: 226, labelY: 204 },
  { x: 394, y: 98, labelY: 76 },
  { x: 534, y: 226, labelY: 186 },
] as const;

const stopIcons: IconNode[] = [House, Coffee, Users, Flag];
const audienceIcons: IconNode[] = [House, Users, HeartHandshake, Plane];

function StopsCard({ dict, locale }: SectionProps) {
  const stops = dict.stops;

  return (
    <article data-reveal className="flex flex-col overflow-hidden rounded-[32px] bg-canvas ring-1 ring-line">
      <div className="px-7 pt-8 sm:px-10 sm:pt-10">
        <Eyebrow>{stops.eyebrow}</Eyebrow>
        <h2 className="mt-5 text-[1.9rem] leading-tight font-semibold text-balance text-heading sm:text-[2.3rem] rtl:leading-[1.35]">
          {stops.title}
        </h2>
        <p className="mt-4 max-w-lg text-base leading-8 text-muted">{stops.description}</p>
      </div>

      <div data-live className="relative mx-4 mt-8 aspect-[16/10] overflow-hidden rounded-[24px] border border-line sm:mx-6">
        <MapSvg width={640} height={400} base={stopsMap}>
          <RouteLine d={stopsRoute} draw="reveal" delay={200} />
          {stopPoints.map((point, index) => (
            <text
              key={point.x}
              x={point.x}
              y={point.labelY}
              textAnchor="middle"
              strokeWidth={5}
              paintOrder="stroke"
              strokeLinejoin="round"
              className="fill-heading stroke-(--map-road) text-[15px] font-semibold"
            >
              {stops.route[index].label}
            </text>
          ))}
          <PickupPin x={stopPoints[0].x} y={stopPoints[0].y} />
          <StopDot x={stopPoints[1].x} y={stopPoints[1].y} label={formatNumber(1, locale)} />
          <StopDot x={stopPoints[2].x} y={stopPoints[2].y} label={formatNumber(2, locale)} />
          <DestinationPin x={stopPoints[3].x} y={stopPoints[3].y} />
          <MapCar
            path={stopsRoute}
            dur="12s"
            keyPoints="0;0.279;0.279;0.639;0.639;1;1"
            keyTimes="0;0.24;0.34;0.6;0.7;0.94;1"
          />
        </MapSvg>
      </div>

      <div className="grid gap-8 px-7 pt-8 pb-9 sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)] sm:px-10 sm:pb-10">
        <ol className="relative">
          <span aria-hidden="true" className="absolute inset-y-5 start-[17px] border-s-2 border-dashed border-line-strong" />
          {stops.route.map((stop, index) => (
            <li
              key={stop.label}
              className="stagger-in relative flex items-center gap-3.5 py-2"
              style={delay(300 + index * 140)}
            >
              <span
                className={cx(
                  "relative grid size-9 shrink-0 place-items-center rounded-full ring-4 ring-canvas",
                  index === 0
                    ? "bg-brand text-ink"
                    : index === stops.route.length - 1
                      ? "bg-heading text-canvas"
                      : "bg-surface text-heading shadow-card",
                )}
              >
                <Icon node={stopIcons[index]} size={16} />
              </span>
              <span className="flex-1 text-[15px] font-semibold text-heading">{stop.label}</span>
              <span className="text-sm text-muted tabular-nums">{stop.time}</span>
            </li>
          ))}
          <li className="stagger-in relative mt-2 ps-12" style={delay(300 + stops.route.length * 140)}>
            <span className="flex h-11 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong text-sm font-semibold text-muted">
              <Icon node={Plus} size={16} />
              {stops.addStop}
            </span>
          </li>
        </ol>

        <ul className="flex flex-col justify-center gap-3.5">
          {stops.points.map((point) => (
            <li key={point} className="flex items-start gap-3 text-[15px] leading-7 text-body">
              <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-brand/15 text-accent">
                <Icon node={Check} size={13} strokeWidth={2.6} />
              </span>
              {point}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function OthersCard({ dict }: SectionProps) {
  const others = dict.others;
  const card = others.card;

  return (
    <article
      data-reveal
      style={delay(140)}
      className="flex flex-col overflow-hidden rounded-[32px] bg-[linear-gradient(160deg,color-mix(in_oklab,var(--teal)_16%,var(--bg)),var(--bg)_58%)] px-7 pt-8 pb-9 ring-1 ring-line sm:px-10 sm:pt-10"
    >
      <Eyebrow className="self-start">{others.eyebrow}</Eyebrow>
      <h2 className="mt-5 text-[1.9rem] leading-tight font-semibold text-balance text-heading sm:text-[2.3rem] rtl:leading-[1.35]">
        {others.title}
      </h2>
      <p className="mt-4 max-w-md text-base leading-8 text-muted">{others.description}</p>

      <div className="mt-10 rounded-[26px] bg-surface p-5 shadow-float ring-1 ring-line sm:p-6">
        <p className="text-sm font-semibold text-heading">{card.riderLabel}</p>
        <div className="relative mt-3 grid grid-cols-2 rounded-full bg-canvas p-1 text-center text-sm font-semibold text-heading">
          <span aria-hidden="true" className="seg-slide absolute inset-y-1 start-1 w-[calc(50%-4px)] rounded-full bg-surface shadow-card ring-1 ring-line" />
          <span className="relative py-2.5 opacity-60">{card.me}</span>
          <span className="relative py-2.5">{card.someone}</span>
        </div>

        <div className="stagger-in mt-5 flex items-center gap-3.5 rounded-2xl border border-line p-3.5" style={delay(900)}>
          <Avatar initials={card.initials} className="size-11 text-base" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-heading">{card.name}</p>
            <p dir="ltr" className="text-xs text-muted rtl:text-end">+963 9•• ••• •12</p>
          </div>
          <span className="grid size-9 place-items-center rounded-full bg-success/15 text-success">
            <Icon node={PhoneIcon} size={16} />
          </span>
        </div>

        <p className="stagger-in mt-4 flex items-center gap-2.5 text-[13px] text-muted" style={delay(1100)}>
          <Icon node={Eye} size={16} className="shrink-0 text-accent" />
          {card.note}
        </p>
      </div>

      <div
        className="stagger-in mx-3 -mt-px rounded-b-[22px] border border-t-0 border-line bg-surface/70 px-5 pt-4 pb-5 sm:mx-5"
        style={delay(1300)}
      >
        <div className="flex items-center gap-3 text-[13px]">
          <span className="grid size-8 place-items-center rounded-full bg-brand/15 text-accent">
            <Icon node={CarFront} size={15} />
          </span>
          <span className="font-semibold text-heading">
            {card.name} · {dict.live.statuses[2]}
          </span>
          <span className="ms-auto text-muted">{dict.mock.active.arrival}</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full w-3/5 rounded-full bg-[linear-gradient(90deg,var(--teal),var(--brand))] rtl:bg-[linear-gradient(270deg,var(--teal),var(--brand))]" />
        </div>
      </div>

      <div className="mt-auto pt-10">
        <p className="text-sm font-semibold text-heading">{others.usefulFor}</p>
        <ul className="mt-3.5 flex flex-wrap gap-2.5">
          {others.audiences.map((audience, index) => (
            <li
              key={audience}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3.5 py-2 text-sm font-medium text-heading"
            >
              <Icon node={audienceIcons[index]} size={15} className="text-accent" />
              {audience}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

export function StopsAndOthers(props: SectionProps) {
  return (
    <Section id="stops" tone="surface">
      <div className="shell grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <StopsCard {...props} />
        <OthersCard {...props} />
      </div>
    </Section>
  );
}
