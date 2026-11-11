import {
  Bell,
  Briefcase,
  CalendarClock,
  Car,
  Check,
  ChevronLeft,
  Clock,
  Coffee,
  Crown,
  Flame,
  Headset,
  House,
  MapPin,
  MessageCircle,
  Phone as PhoneIcon,
  Search,
  Share2,
  ShieldCheck,
  Siren,
  Star,
  Ticket,
  Timer,
} from "lucide";
import type { ReactNode } from "react";

import type { Dictionary } from "@/core/i18n/dictionaries";
import { cssVars } from "@/shared/lib/css-vars";
import { cx } from "@/shared/lib/cx";
import { Icon } from "@/shared/ui/icon";

import { categoryStyle } from "../components/category-style";
import { DestinationPin, MapCar, MapSvg, ParkedCar, phoneMap, PickupPin, RouteLine } from "../components/map";
import { Avatar, Screen, Sheet } from "../components/phone";
import { CatalogStamp } from "../components/stamp-catalog";

type ScreenProps = { dict: Dictionary };

const routes = {
  ride: "M33 255V213Q33 199 47 199H143Q157 199 157 185V101Q157 87 171 87H219",
  approach: "M281 87H109Q95 87 95 101V199",
  active: "M33 330V213Q33 199 47 199H143Q157 199 157 185V157Q157 143 171 143H267",
};

export function PhoneMapView({ children }: { children?: ReactNode }) {
  return (
    <MapSvg width={phoneMap.width} height={phoneMap.height} base={phoneMap.base}>
      {children}
    </MapSvg>
  );
}

export function HomeScreen({ dict }: ScreenProps) {
  const m = dict.mock;
  const serviceIcons = [Car, CalendarClock, Crown, Timer];

  return (
    <Screen time={m.time}>
      <PhoneMapView>
        <ParkedCar x={219} y={232} rotate={90} />
        <ParkedCar x={64} y={311} />
        <ParkedCar x={250} y={367} rotate={180} />
        <ParkedCar x={95} y={60} rotate={90} muted />
        <PickupPin x={157} y={255} />
      </PhoneMapView>

      <div className="absolute inset-x-3 top-12 z-10 flex items-center gap-2.5 rounded-full bg-surface/95 p-1.5 pe-3 shadow-card">
        <Avatar initials={dict.passport.booklet.initials} className="size-8 text-[12px]" />
        <span className="flex-1 truncate text-[12px] font-medium text-heading">{m.home.greeting}</span>
        <span className="relative text-heading">
          <Icon node={Bell} size={15} />
          <span className="absolute -top-0.5 -end-0.5 size-1.5 rounded-full bg-danger" />
        </span>
      </div>

      <Sheet>
        <div className="flex items-center gap-2 rounded-2xl bg-canvas px-3 py-2.5">
          <Icon node={Search} size={15} className="text-muted" />
          <span className="flex-1 text-[13px] font-semibold text-heading">{m.home.whereTo}</span>
          <span className="flex items-center gap-1 rounded-full bg-surface px-2 py-1 text-[10.5px] font-medium text-heading shadow-sm">
            <Icon node={Clock} size={11} />
            {m.home.now}
          </span>
        </div>
        <ul className="mt-1.5">
          {m.home.saved.map((place, index) => (
            <li key={place.label} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
              <span className="grid size-7 place-items-center rounded-full bg-canvas text-heading">
                <Icon node={index === 0 ? House : Briefcase} size={13} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-heading">{place.label}</span>
                <span className="block text-[10.5px] text-muted">{place.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {m.home.services.map((service, index) => (
            <div
              key={service}
              className={cx(
                "flex flex-col items-center gap-1 rounded-xl py-2 text-[10.5px] font-medium text-heading",
                index === 0 ? "bg-brand/15" : "bg-canvas",
              )}
            >
              <Icon node={serviceIcons[index]} size={16} />
              {service}
            </div>
          ))}
        </div>
      </Sheet>
    </Screen>
  );
}

export function LocationScreen({ dict }: ScreenProps) {
  const m = dict.mock;

  return (
    <Screen time={m.time}>
      <PhoneMapView>
        <RouteLine d={routes.ride} tone="muted" dashed />
        <PickupPin x={33} y={255} />
        <DestinationPin x={219} y={87} />
      </PhoneMapView>

      <div className="absolute inset-x-3 top-12 z-10 rounded-2xl bg-surface p-3 shadow-float">
        <p className="flex items-center gap-2.5 text-[12px] text-heading">
          <span className="size-2.5 shrink-0 rounded-full border-[2.5px] border-brand-strong" />
          <span className="w-7 shrink-0 text-[10px] text-muted">{m.route.from}</span>
          {m.route.pickup}
        </p>
        <div className="my-2 ms-6 h-px bg-line" />
        <p className="flex items-center gap-2.5 text-[12px] font-semibold text-heading">
          <span className="size-2.5 shrink-0 rounded-[3px] bg-heading" />
          <span className="w-7 shrink-0 text-[10px] font-normal text-muted">{m.route.to}</span>
          {m.route.destination}
          <span className="h-4 w-0.5 animate-blink rounded-full bg-brand-strong" />
        </p>
      </div>

      <Sheet>
        <p className="text-[10.5px] font-medium text-muted">{m.route.suggestions}</p>
        <ul className="mt-1">
          {m.home.saved.map((place, index) => (
            <li key={place.label} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
              <span className="grid size-7 place-items-center rounded-full bg-canvas text-heading">
                <Icon node={index === 0 ? House : Briefcase} size={13} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-heading">{place.label}</span>
                <span className="block text-[10.5px] text-muted">{place.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-2.5 rounded-full bg-heading py-2.5 text-center text-[12.5px] font-semibold text-canvas">
          {m.route.confirm}
        </div>
      </Sheet>
    </Screen>
  );
}

export function CategoryScreen({ dict }: ScreenProps) {
  const m = dict.mock;

  return (
    <Screen time={m.time}>
      <PhoneMapView>
        <RouteLine d={routes.ride} draw="now" />
        <PickupPin x={33} y={255} />
        <DestinationPin x={219} y={87} />
      </PhoneMapView>

      <Sheet>
        <div className="flex items-baseline justify-between">
          <span className="text-[14px] font-semibold text-heading">{m.category.title}</span>
          <span className="text-[10px] text-muted">{m.category.estimate}</span>
        </div>
        <ul className="mt-2 space-y-1">
          {dict.categories.items.map((item, index) => {
            const style = categoryStyle(item.id);
            return (
              <li
                key={item.id}
                className={cx(
                  "flex items-center gap-2.5 rounded-xl border px-2 py-1",
                  index === 0 ? "border-brand bg-brand/10" : "border-transparent",
                )}
              >
                <img
                  src={encodeURI(style.image)}
                  alt=""
                  className="h-7 w-12 shrink-0 object-contain"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-semibold text-heading">{item.name}</span>
                  <span className="block text-[10px] text-muted">
                    {m.category.etas[index]} {m.minutes}
                  </span>
                </span>
                <span className="text-[12px] font-semibold text-heading">
                  {m.category.fares[index]} <span className="text-[9.5px] font-medium text-muted">{m.currency}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-2.5 rounded-full bg-brand py-2.5 text-center text-[12.5px] font-semibold text-ink">
          {m.category.confirm}
        </div>
      </Sheet>
    </Screen>
  );
}

export function SearchingScreen({ dict }: ScreenProps) {
  const m = dict.mock;

  return (
    <Screen time={m.time}>
      <PhoneMapView>
        <ParkedCar x={219} y={250} rotate={90} muted />
        <ParkedCar x={64} y={87} muted />
        <ParkedCar x={250} y={143} rotate={180} muted />
        <g transform="translate(157 199)">
          <circle r={104} className="fill-brand/5 stroke-brand/25" strokeWidth={1} />
          <circle r={70} className="fill-none stroke-brand/30" strokeWidth={1} />
          <circle r={36} className="fill-none stroke-brand/40" strokeWidth={1} />
          <g className="animate-spin-slow origin-center [animation-duration:2.6s] [transform-box:fill-box]">
            <circle r={104} fill="none" />
            <path d="M0 0L0 -104A104 104 0 0 1 90 -52Z" className="fill-brand/25" />
          </g>
        </g>
        <PickupPin x={157} y={199} />
      </PhoneMapView>

      <Sheet>
        <p className="text-[14px] font-semibold text-heading">{m.searching.title}</p>
        <p className="mt-0.5 text-[11px] text-muted">{m.searching.body}</p>
        <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-canvas">
          <span className="indeterminate absolute inset-y-0 start-0 w-2/5 rounded-full bg-brand" />
        </div>
        <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-canvas p-2">
          <img
            src={encodeURI(categoryStyle(dict.categories.items[0].id).image)}
            alt=""
            className="h-7 w-12 shrink-0 object-contain"
          />
          <span className="flex-1 text-[12px] font-semibold text-heading">{dict.categories.items[0].name}</span>
          <span className="text-[11px] text-muted">
            {m.category.fares[0]} {m.currency}
          </span>
        </div>
        <div className="mt-2.5 rounded-full border border-line-strong py-2.5 text-center text-[12px] font-semibold text-heading">
          {m.searching.cancel}
        </div>
      </Sheet>
    </Screen>
  );
}

export function DriverAssignedScreen({ dict }: ScreenProps) {
  const m = dict.mock;

  return (
    <Screen time={m.time}>
      <PhoneMapView>
        <RouteLine d={routes.approach} />
        <PickupPin x={95} y={199} />
        <MapCar path={routes.approach} dur="7s" keyPoints="0;0.92;0.92" keyTimes="0;0.8;1" />
        <g transform="translate(95 236)">
          <rect x={-22} y={-13} width={44} height={22} rx={11} className="fill-heading" />
          <text y={2.5} textAnchor="middle" className="fill-canvas text-[10px] font-semibold">
            {m.driver.etaShort}
          </text>
        </g>
      </PhoneMapView>

      <Sheet>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[14px] font-semibold text-heading">{m.driver.status}</p>
            <p className="text-[11px] font-medium text-accent">{m.driver.eta}</p>
          </div>
          <span className="grid size-8 place-items-center rounded-full bg-success/15 text-success">
            <Icon node={ShieldCheck} size={15} />
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2.5">
          <Avatar initials={m.driver.initials} className="size-10 text-[14px]" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-heading">
              {m.driver.name}
              <span className="inline-flex items-center gap-0.5 text-[10.5px] font-medium text-muted">
                <Icon node={Star} size={10} className="fill-warning text-warning" />
                {m.driver.rating}
              </span>
            </p>
            <p className="truncate text-[10.5px] text-muted">{m.driver.car}</p>
          </div>
          <span dir="ltr" className="rounded-md border border-line-strong px-1.5 py-0.5 text-[11px] font-semibold tracking-wider text-heading">
            {m.driver.plate}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {m.driver.actions.map((action, index) => (
            <div key={action} className="flex flex-col items-center gap-1 rounded-xl bg-canvas py-2 text-[10.5px] font-medium text-heading">
              <Icon node={[PhoneIcon, MessageCircle, Share2][index]} size={15} />
              {action}
            </div>
          ))}
        </div>
      </Sheet>
    </Screen>
  );
}

export function ActiveRideScreen({ dict }: ScreenProps) {
  const m = dict.mock;

  return (
    <Screen time={m.time}>
      <PhoneMapView>
        <RouteLine d={routes.active} />
        <g transform="translate(95 199)">
          <circle r={8} className="fill-surface stroke-heading" strokeWidth={2.4} />
          <circle r={3} className="fill-heading" />
        </g>
        <DestinationPin x={267} y={143} />
        <MapCar path={routes.active} dur="12s" />
      </PhoneMapView>

      <div className="absolute inset-x-3 top-12 z-10 flex items-center justify-between rounded-2xl bg-heading px-3.5 py-2.5 text-canvas shadow-float">
        <span className="text-[12px] font-semibold">{m.active.arrival}</span>
        <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-ink">{m.active.remaining}</span>
      </div>

      <Sheet>
        <p className="flex items-center gap-2 text-[13.5px] font-semibold text-heading">
          <span className="relative flex size-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-success/70" />
            <span className="relative size-2 rounded-full bg-success" />
          </span>
          {m.active.status}
        </p>
        <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-canvas p-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-surface text-heading">
            <Icon node={Coffee} size={14} />
          </span>
          <span className="flex-1">
            <span className="block text-[10px] text-muted">{m.active.nextStop}</span>
            <span className="block text-[12px] font-semibold text-heading">{m.active.stop}</span>
          </span>
          <Icon node={MapPin} size={14} className="text-accent" />
        </div>
        <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-2">
          <span className="flex items-center justify-center gap-1.5 rounded-full border border-line-strong py-2.5 text-[12px] font-semibold text-heading">
            <Icon node={Share2} size={13} />
            {m.active.share}
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-danger/12 px-4 text-[12px] font-semibold text-danger">
            <Icon node={Siren} size={13} />
            {m.active.sos}
          </span>
        </div>
      </Sheet>
    </Screen>
  );
}

export function RideCompleteScreen({ dict }: ScreenProps) {
  const m = dict.mock;

  return (
    <Screen time={m.time}>
      <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(115%_85%_at_50%_0%,color-mix(in_oklab,var(--success)_28%,transparent),transparent_72%)]" />
      <div className="absolute inset-x-0 bottom-[18%] h-56 bg-[radial-gradient(70%_70%_at_50%_55%,color-mix(in_oklab,var(--warning)_22%,transparent),transparent_70%)]" />

      <div className="relative flex h-full flex-col items-center px-5 pt-14 pb-8 text-center">
        <span className="replay pop-in grid size-12 place-items-center rounded-full bg-success text-white shadow-[0_14px_32px_-12px_var(--success)]">
          <Icon node={Check} size={24} strokeWidth={2.8} />
        </span>
        <p className="mt-2.5 text-[17px] font-semibold tracking-tight text-heading">{m.complete.title}</p>
        <p className="mt-0.5 text-[11px] text-muted">{m.complete.subtitle}</p>

        <div className="mt-3.5 flex w-full items-baseline justify-between gap-3 border-y border-line py-2.5">
          <span className="text-[10.5px] text-muted">{m.complete.fareLabel}</span>
          <span className="text-[16px] font-semibold tabular-nums text-heading">{m.complete.fare}</span>
          <span className="text-[10.5px] font-medium text-muted">{m.complete.payment}</span>
        </div>

        <p className="mt-3.5 text-[11.5px] font-medium text-heading">{m.complete.rate}</p>
        <div className="mt-1 flex gap-1" dir="ltr">
          {[0, 1, 2, 3, 4].map((star) => (
            <span key={star} className="replay pop-in" style={{ animationDelay: `${280 + star * 70}ms` }}>
              <Icon node={Star} size={18} className="fill-warning text-warning" />
            </span>
          ))}
        </div>

        <div className="relative mt-auto mb-1 flex w-full flex-col items-center">
          <div
            aria-hidden
            className="pointer-events-none absolute top-[42%] left-1/2 size-[11.5rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--warning)_42%,transparent)_0%,color-mix(in_oklab,var(--warning)_12%,transparent)_42%,transparent_72%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute top-[18%] left-1/2 h-[4.75rem] w-[7.5rem] -translate-x-1/2 rounded-[40%] bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--heading)_8%,transparent),transparent_70%)] blur-[1px]"
          />
          <CatalogStamp
            id="tenRides"
            names={dict.stampNames}
            className="replay stamp-press relative z-[1] w-40 drop-shadow-[0_20px_34px_color-mix(in_oklab,var(--warning)_40%,transparent)]"
            style={cssVars({ "--rot": "-8deg", "--delay": "620ms" })}
          />
          <span className="relative z-[1] mt-3">
            <span className="block text-[10px] font-medium tracking-[0.04em] text-warning">{m.complete.stamp}</span>
            <span className="mt-0.5 block text-[14px] font-semibold text-heading">{dict.stampNames.tenRides}</span>
          </span>
        </div>

        <div className="mt-3 w-full rounded-full bg-heading py-2.5 text-[12.5px] font-semibold text-canvas shadow-[0_10px_24px_-14px_color-mix(in_oklab,var(--heading)_55%,transparent)]">
          {m.complete.done}
        </div>
      </div>
    </Screen>
  );
}

export function ScheduleScreen({ dict }: ScreenProps) {
  const m = dict.mock;
  const s = m.schedule;

  return (
    <Screen time={m.time}>
      <div className="flex h-full flex-col px-4 pt-13 pb-7">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-surface text-heading shadow-sm">
            <Icon node={ChevronLeft} size={14} className="rtl:rotate-180" />
          </span>
          <span className="text-[14px] font-semibold text-heading">{s.title}</span>
        </div>

        <p className="mt-4 text-[10.5px] font-medium text-muted">{s.dateLabel}</p>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {s.days.map((day, index) => (
            <span
              key={day}
              className={cx(
                "rounded-xl py-2 text-center text-[11.5px] font-semibold",
                index === 1 ? "bg-heading text-canvas" : "bg-surface text-heading shadow-sm",
              )}
            >
              {day}
            </span>
          ))}
        </div>

        <p className="mt-4 text-[10.5px] font-medium text-muted">{s.timeLabel}</p>
        <div className="relative mt-1.5 overflow-hidden rounded-2xl bg-surface py-1.5 shadow-sm">
          <div className="absolute inset-x-2 top-1/2 h-9 -translate-y-1/2 rounded-xl bg-brand/15" />
          {s.times.map((time, index) => (
            <p
              key={time}
              className={cx(
                "relative text-center leading-9",
                index === 1 ? "text-[17px] font-semibold text-heading" : "text-[12px] text-muted/70",
              )}
            >
              {time} <span className="text-[11px]">{s.period}</span>
            </p>
          ))}
        </div>

        <div className="mt-4 rounded-2xl bg-surface p-3 shadow-sm">
          <p className="flex items-center gap-2 text-[12px] font-semibold text-heading">
            <span className="size-2.5 rounded-full border-[2.5px] border-brand-strong" />
            {s.from}
          </p>
          <span className="ms-[4px] block h-3 border-s border-dashed border-line-strong" />
          <p className="flex items-center gap-2 text-[12px] font-semibold text-heading">
            <span className="size-2.5 rounded-[3px] bg-heading" />
            {s.to}
          </p>
        </div>

        <div className="mt-auto">
          <div className="replay pop-in mb-3 flex items-center gap-2.5 rounded-2xl bg-success/12 p-2.5" style={{ animationDelay: "1300ms" }}>
            <span className="grid size-7 place-items-center rounded-full bg-success text-white">
              <Icon node={Check} size={14} strokeWidth={2.6} />
            </span>
            <span>
              <span className="block text-[11.5px] font-semibold text-heading">{s.accepted}</span>
              <span className="block text-[10px] text-muted">{s.reminder}</span>
            </span>
          </div>
          <div className="rounded-full bg-brand py-2.5 text-center text-[12.5px] font-semibold text-ink">{s.confirm}</div>
        </div>
      </div>
    </Screen>
  );
}

export function EmergencyScreen({ dict }: ScreenProps) {
  const m = dict.mock;
  const e = m.emergency;

  return (
    <Screen time={m.time} className="bg-[linear-gradient(180deg,color-mix(in_oklab,var(--danger)_16%,var(--bg)),var(--bg)_70%)]">
      <div className="flex h-full flex-col items-center px-5 pt-14 pb-8 text-center">
        <p className="text-[15px] font-semibold text-heading">{e.title}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">{e.body}</p>

        <div className="relative my-7 grid size-36 place-items-center">
          <span className="absolute inset-0 animate-pulse-ring rounded-full bg-danger/30" />
          <span className="absolute inset-0 animate-pulse-ring rounded-full bg-danger/25 [animation-delay:1.3s]" />
          <span className="absolute inset-3 rounded-full bg-danger/15" />
          <span className="relative grid size-24 place-items-center rounded-full bg-danger text-[22px] font-bold tracking-wider text-white shadow-[0_18px_40px_-12px_var(--danger)]">
            {e.sos}
          </span>
        </div>

        <div className="w-full space-y-2 text-start">
          <p className="flex items-center gap-2.5 rounded-2xl bg-surface p-2.5 text-[11.5px] font-medium text-heading shadow-sm">
            <span className="grid size-7 place-items-center rounded-full bg-success/15 text-success">
              <Icon node={MapPin} size={13} />
            </span>
            {e.location}
          </p>
          <p className="flex items-center gap-2.5 rounded-2xl bg-surface p-2.5 text-[11.5px] font-medium text-heading shadow-sm">
            <span className="grid size-7 place-items-center rounded-full bg-brand/15 text-accent">
              <Icon node={Headset} size={13} />
            </span>
            {e.team}
          </p>
        </div>

        <div className="mt-auto flex w-full items-center justify-center gap-2 rounded-full bg-heading py-2.5 text-[12px] font-semibold text-canvas">
          <Icon node={PhoneIcon} size={13} />
          {e.call}
        </div>
      </div>
    </Screen>
  );
}

export function PassportScreen({ dict }: ScreenProps) {
  const m = dict.mock;
  const p = m.passport;
  const stamps = ["firstRide", "tenRides", "aleppo"] as const;

  return (
    <Screen time={m.time}>
      <div className="flex h-full flex-col px-4 pt-13 pb-7">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-semibold text-heading">{p.title}</span>
          <span className="rounded-full bg-brand/15 px-2.5 py-1 text-[10.5px] font-semibold text-accent">{p.level}</span>
        </div>

        <div className="relative mt-3 overflow-hidden rounded-[20px] bg-[linear-gradient(145deg,#1f5f66,#0d1017_75%)] p-4 text-white shadow-float">
          <div className="absolute inset-0 opacity-30 [background:repeating-radial-gradient(circle_at_85%_10%,transparent_0_9px,rgb(34_224_238/0.35)_9px_10px)]" />
          <div className="relative">
            <p className="text-[9px] font-semibold tracking-[0.3em] text-brand">BEROYA PASSPORT</p>
            <p className="mt-2 text-[15px] font-semibold">{dict.passport.booklet.holder}</p>
            <div className="mt-2 flex gap-1" dir="ltr">
              {[0, 1, 2, 3, 4].map((pip) => (
                <span key={pip} className={cx("h-1.5 w-6 rounded-full", pip < 3 ? "bg-brand" : "bg-white/20")} />
              ))}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[12px] font-medium">
              <Icon node={Flame} size={15} className="animate-flame fill-warning text-warning" />
              <span className="font-semibold">{p.streak}</span>
              <span className="text-white/70">{p.streakLabel}</span>
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[12.5px] font-semibold text-heading">{p.stamps}</span>
          <span className="text-[10.5px] font-medium text-accent">{p.seeAll}</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 rounded-2xl bg-(--paper) p-2.5 shadow-sm">
          {stamps.map((id, index) => (
            <CatalogStamp
              key={id}
              id={id}
              names={dict.stampNames}
              texture={false}
              className="replay stamp-press aspect-square w-full"
              style={cssVars({ "--rot": `${[-8, 6, -4][index]}deg`, "--delay": `${200 + index * 220}ms` })}
            />
          ))}
        </div>

        <div className="ticket-notch mt-auto flex items-center gap-3 rounded-2xl bg-[linear-gradient(120deg,var(--brand),var(--teal))] p-3 text-ink">
          <span className="grid size-9 place-items-center rounded-xl bg-white/30">
            <Icon node={Ticket} size={17} />
          </span>
          <span>
            <span className="block text-[13px] font-semibold">{p.code}</span>
            <span className="block text-[10px] opacity-75">{p.codeDetail}</span>
          </span>
        </div>
      </div>
    </Screen>
  );
}
