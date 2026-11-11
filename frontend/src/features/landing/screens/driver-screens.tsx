import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Building,
  CalendarCheck,
  Check,
  CornerUpRight,
  MessageSquare,
  Phone as PhoneIcon,
  Star,
  TriangleAlert,
  Wallet,
} from "lucide";

import type { Dictionary } from "@/core/i18n/dictionaries";
import { cx } from "@/shared/lib/cx";
import { Icon } from "@/shared/ui/icon";

import { DestinationPin, MapCar, ParkedCar, PickupPin, RouteLine } from "../components/map";
import { Avatar, Screen, Sheet } from "../components/phone";

import { PhoneMapView } from "./customer-screens";

type ScreenProps = { dict: Dictionary };

const routes = {
  offer: "M33 255V213Q33 199 47 199H143Q157 199 157 185V101Q157 87 171 87H219",
  pickup: "M219 560V381Q219 367 205 367H47Q33 367 33 353V255",
};

function OnlineToggle({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2 rounded-full bg-success py-1 ps-3 pe-1 text-[11.5px] font-semibold text-white shadow-[0_10px_24px_-10px_var(--success)]">
      {label}
      <span className="grid h-5 w-9 items-center rounded-full bg-white/30 px-0.5">
        <span className="size-4 justify-self-end rounded-full bg-white shadow-sm" />
      </span>
    </span>
  );
}

export function DriverOnlineScreen({ dict }: ScreenProps) {
  const m = dict.mock;
  const d = m.driverApp;

  return (
    <Screen time={m.time}>
      <PhoneMapView>
        <ParkedCar x={219} y={170} rotate={90} muted />
        <ParkedCar x={33} y={423} rotate={90} muted />
        <ParkedCar x={250} y={255} rotate={180} muted />
        <g transform="translate(157 311)">
          <circle r={60} className="animate-pulse-ring fill-brand/25 [transform-box:fill-box] origin-center [animation-duration:3.2s]" />
          <circle r={22} className="fill-brand/20" />
        </g>
        <ParkedCar x={157} y={311} rotate={-90} />
      </PhoneMapView>

      <div className="absolute inset-x-3 top-12 z-10 flex justify-center">
        <OnlineToggle label={d.online} />
      </div>

      <div className="absolute inset-x-3 top-[5.6rem] z-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-line shadow-card">
        <div className="bg-surface px-3 py-2.5">
          <p className="text-[10px] text-muted">
            {d.today} · {d.trips}
          </p>
          <p className="text-[16px] font-semibold text-heading">{d.tripsValue}</p>
        </div>
        <div className="bg-surface px-3 py-2.5">
          <p className="text-[10px] text-muted">{d.hours}</p>
          <p className="text-[16px] font-semibold text-heading">{d.hoursValue}</p>
        </div>
      </div>

      <Sheet>
        <div className="flex items-center gap-3">
          <span className="relative grid size-10 place-items-center">
            <span className="absolute inset-0 animate-pulse-ring rounded-full bg-brand/40" />
            <span className="relative size-3 rounded-full bg-brand-strong" />
          </span>
          <span className="text-[12.5px] font-semibold text-heading">{d.waiting}</span>
        </div>
      </Sheet>
    </Screen>
  );
}

export function RideOfferScreen({
  dict,
  animated = true,
  phase = "accepting",
}: ScreenProps & { animated?: boolean; phase?: "idle" | "accepting" | "taken" }) {
  const m = dict.mock;
  const o = m.driverApp.offer;
  const busy = phase === "accepting";
  const taken = phase === "taken";

  return (
    <Screen time={m.time}>
      <PhoneMapView>
        <RouteLine d={routes.offer} />
        <PickupPin x={33} y={255} />
        <DestinationPin x={219} y={87} />
        <ParkedCar x={33} y={311} rotate={-90} />
      </PhoneMapView>

      <div className="absolute inset-x-3 top-12 z-10 flex justify-center">
        <OnlineToggle label={m.driverApp.online} />
      </div>

      <div className={cx("absolute inset-x-2.5 bottom-6 z-20", animated && "offer-card")}>
        <div className="rounded-[22px] bg-surface p-3.5 shadow-float ring-1 ring-line">
          <div className="flex items-center justify-between">
            <span className="text-[13.5px] font-semibold text-heading">{o.title}</span>
            <span className="relative grid size-9 place-items-center">
              <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" className="stroke-line" />
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  strokeWidth="3"
                  strokeLinecap="round"
                  pathLength={1}
                  className={cx("stroke-brand-strong", animated && !busy && !taken && "offer-ring")}
                />
              </svg>
              <span className="text-[11px] font-semibold text-heading">{o.seconds}</span>
            </span>
          </div>

          <div className="mt-2.5 flex items-center gap-2.5">
            <Avatar initials={o.initials} className="size-8 text-[12px]" />
            <span className="flex-1 text-[12px] font-semibold text-heading">{o.customer}</span>
            <span className="inline-flex items-center gap-0.5 text-[10.5px] text-muted">
              <Icon node={Star} size={10} className="fill-warning text-warning" />
              {o.rating}
            </span>
          </div>

          <div className="mt-2.5 rounded-xl bg-canvas p-2.5">
            <p className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full border-[2.5px] border-brand-strong" />
              <span className="text-[10px] text-muted">{o.pickupLabel}</span>
              <span className="ms-auto text-[11.5px] font-semibold text-heading">{o.pickup}</span>
            </p>
            <span className="ms-[4px] block h-2.5 border-s border-dashed border-line-strong" />
            <p className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-[3px] bg-heading" />
              <span className="text-[10px] text-muted">{o.destinationLabel}</span>
              <span className="ms-auto text-[11.5px] font-semibold text-heading">{o.destination}</span>
            </p>
          </div>

          <div className="mt-2.5 flex items-end justify-between">
            <div>
              <p className="text-[10px] text-muted">{o.fareLabel}</p>
              <p className="text-[17px] font-semibold text-heading">{o.fare}</p>
            </div>
            <div className="flex gap-1.5 text-[10.5px] font-medium text-heading">
              <span className="rounded-full bg-canvas px-2 py-1">{o.distance}</span>
              <span className="rounded-full bg-canvas px-2 py-1">{o.duration}</span>
            </div>
          </div>

          {taken ? (
            <div className="mt-3 flex items-center gap-2 rounded-2xl bg-warning/12 px-3 py-2.5 ring-1 ring-warning/30">
              <Icon node={TriangleAlert} size={14} className="shrink-0 text-warning" />
              <span className="text-[12px] font-semibold text-heading">{o.taken}</span>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
              <span
                className={cx(
                  "rounded-full border border-line-strong px-4 py-2.5 text-[12px] font-semibold text-heading",
                  busy && "opacity-40",
                )}
              >
                {o.decline}
              </span>
              <span
                className={cx(
                  "flex items-center justify-center gap-1.5 rounded-full py-2.5 text-[12.5px] font-semibold",
                  busy ? "bg-brand/55 text-ink" : "bg-brand text-ink",
                )}
              >
                {busy ? (
                  <>
                    <span className="size-3.5 animate-spin rounded-full border-2 border-ink/25 border-t-ink" />
                    {o.accepting}
                  </>
                ) : (
                  <>
                    <Icon node={Check} size={14} strokeWidth={2.4} />
                    {o.accept}
                  </>
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    </Screen>
  );
}

export function DriverPickupScreen({
  dict,
  offline = false,
  phase = "waiting",
}: ScreenProps & { offline?: boolean; phase?: "enroute" | "waiting" }) {
  const m = dict.mock;
  const p = m.driverApp.pickup;
  const waiting = phase === "waiting";

  return (
    <Screen time={m.time}>
      <PhoneMapView>
        <RouteLine d={routes.pickup} />
        <PickupPin x={33} y={255} />
        <MapCar path={routes.pickup} dur="9s" keyPoints="0;0.94;0.94" keyTimes="0;0.85;1" />
      </PhoneMapView>

      <div className="absolute inset-x-3 top-12 z-10 flex flex-col gap-2">
        {offline ? (
          <div className="rounded-2xl bg-[#3d1f12] p-3 text-white shadow-float ring-1 ring-warning/35">
            <p className="flex items-start gap-2 text-[12px] font-semibold leading-snug">
              <Icon node={TriangleAlert} size={14} className="mt-0.5 shrink-0 text-warning" />
              <span>{p.offlineTitle}</span>
            </p>
            <p className="mt-1.5 ps-[22px] text-[10.5px] text-white/75">{p.offlineLocation}</p>
            <p className="mt-0.5 ps-[22px] text-[10.5px] font-medium text-warning/95">{p.offlineRetry}</p>
          </div>
        ) : null}

        {!waiting ? (
          <div className="flex items-center gap-3 rounded-2xl bg-[#14454a] p-3 text-white shadow-float">
            <span className="grid size-9 place-items-center rounded-xl bg-white/12">
              <Icon node={CornerUpRight} size={20} className="rtl:-scale-x-100" />
            </span>
            <span>
              <span className="block text-[13px] font-semibold">{p.instruction}</span>
              <span className="block text-[10.5px] text-white/70">{p.street}</span>
            </span>
          </div>
        ) : null}
      </div>

      <Sheet>
        {waiting ? (
          <>
            <div className="flex items-center gap-2.5">
              <Avatar initials={m.driverApp.offer.initials} className="size-10 text-[14px]" />
              <span className="flex-1">
                <span className="block text-[12.5px] font-semibold text-heading">{p.waitingTitle}</span>
                <span className="block text-[10.5px] text-muted">{p.waitingNote}</span>
              </span>
              <span className="rounded-full bg-brand/15 px-2.5 py-1 text-[11px] font-semibold text-accent tabular-nums">
                {p.waitingElapsed}
                <span className="text-muted"> / {p.waitingTotal}</span>
              </span>
            </div>
            <p className="mt-2.5 text-[10.5px] leading-snug text-muted">{p.waitingHint}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <span className="flex items-center justify-center gap-1.5 rounded-full border border-line-strong py-2.5 text-[12px] font-semibold text-heading">
                <Icon node={PhoneIcon} size={14} />
                {p.call}
              </span>
              <span className="flex items-center justify-center gap-1.5 rounded-full border border-line-strong py-2.5 text-[12px] font-semibold text-heading">
                <Icon node={MessageSquare} size={14} />
                {p.message}
              </span>
            </div>
            <span className="mt-2 flex items-center justify-center rounded-full bg-heading/30 py-2.5 text-[12.5px] font-semibold text-canvas/65">
              {p.noShow}
            </span>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <Avatar initials={m.driverApp.offer.initials} className="size-10 text-[14px]" />
              <span className="flex-1">
                <span className="block text-[12.5px] font-semibold text-heading">{m.driverApp.offer.customer}</span>
                <span className="block text-[10.5px] text-muted">{p.note}</span>
              </span>
              <span className="rounded-full bg-brand/15 px-2.5 py-1 text-[11px] font-semibold text-accent">{p.eta}</span>
            </div>
            <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
              <span className="grid size-10 place-items-center rounded-full border border-line-strong text-heading">
                <Icon node={PhoneIcon} size={15} />
              </span>
              <span
                className={cx(
                  "flex flex-col items-center justify-center rounded-full py-2 text-center",
                  offline ? "bg-heading/35 text-canvas/70" : "bg-heading text-canvas",
                )}
              >
                <span className="text-[12.5px] font-semibold">{p.arrived}</span>
                {offline ? <span className="mt-0.5 text-[9.5px] font-medium opacity-80">{p.offlineActionHint}</span> : null}
              </span>
            </div>
          </>
        )}
      </Sheet>
    </Screen>
  );
}

export function DriverWalletScreen({ dict }: ScreenProps) {
  const m = dict.mock;
  const w = m.driverApp.wallet;

  return (
    <Screen time={m.time}>
      <div className="flex h-full flex-col px-4 pt-13 pb-7">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-heading">
          <Icon node={Wallet} size={17} />
          {w.title}
        </p>

        <div className="relative mt-3 overflow-hidden rounded-[20px] bg-[linear-gradient(140deg,#0d1017,#1f5f66)] p-4 text-white shadow-float">
          <div className="absolute -top-10 -end-10 size-32 rounded-full bg-brand/25 blur-2xl" />
          <p className="relative text-[10.5px] text-white/70">{w.balanceLabel}</p>
          <p className="relative mt-1 text-[24px] font-semibold">{w.balance}</p>
          <div className="relative mt-3 flex items-center justify-between rounded-xl bg-white/10 px-3 py-2">
            <span className="text-[10.5px] text-white/75">{w.lastLabel}</span>
            <span className="text-[12px] font-semibold">{w.last}</span>
          </div>
        </div>

        <div className="mt-3 flex gap-2.5 rounded-2xl border border-warning/40 bg-warning/12 p-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-warning text-white">
            <Icon node={TriangleAlert} size={13} />
          </span>
          <span>
            <span className="block text-[11.5px] font-semibold text-heading">{w.low}</span>
            <span className="block text-[10px] text-muted">{w.lowBody}</span>
          </span>
        </div>

        <p className="mt-4 text-[11px] font-semibold text-heading">{w.history}</p>
        <ul className="mt-1.5 divide-y divide-line rounded-2xl bg-surface px-3 shadow-sm">
          {w.rows.map((row, index) => (
            <li key={index} className="flex items-center gap-2.5 py-2.5">
              <span
                className={cx(
                  "grid size-7 place-items-center rounded-full",
                  row.tone === "in" ? "bg-success/15 text-success" : "bg-canvas text-muted",
                )}
              >
                <Icon node={row.tone === "in" ? ArrowDownLeft : ArrowUpRight} size={13} />
              </span>
              <span className="flex-1 text-[11px] font-medium text-heading">{row.label}</span>
              <span dir="ltr" className={cx("text-[11.5px] font-semibold", row.tone === "in" ? "text-success" : "text-heading")}>
                {row.value}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-auto flex items-center justify-center gap-1.5 text-[10.5px] text-muted">
          <Icon node={Building} size={12} />
          {w.topup}
        </p>
      </div>
    </Screen>
  );
}

export function DriverScheduledScreen({ dict }: ScreenProps) {
  const m = dict.mock;
  const s = m.scheduled;

  return (
    <Screen time={m.time}>
      <div className="flex h-full flex-col px-4 pt-13 pb-7">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-heading">
          <Icon node={CalendarCheck} size={17} />
          {s.title}
        </p>

        <ul className="mt-3 space-y-2">
          {s.items.map((item, index) => (
            <li key={index} className="rounded-2xl bg-surface p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-heading">
                  {item.day} · {item.time}
                </span>
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-[9.5px] font-semibold text-success">
                  {s.accepted}
                </span>
              </div>
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
                <span className="size-2 rounded-full border-2 border-brand-strong" />
                {item.from}
                <span className="h-px flex-1 border-t border-dashed border-line-strong" />
                <span className="size-2 rounded-[2px] bg-heading" />
                {item.to}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-auto flex items-center gap-2.5 rounded-2xl bg-heading p-3 text-canvas">
          <span className="grid size-8 place-items-center rounded-full bg-brand text-ink">
            <Icon node={Bell} size={14} className="origin-top animate-[ring_2.4s_ease-in-out_infinite]" />
          </span>
          <span className="text-[11.5px] font-semibold">{s.reminder}</span>
        </div>
      </div>
    </Screen>
  );
}
