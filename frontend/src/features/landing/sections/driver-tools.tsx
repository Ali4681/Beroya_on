import { BellRing, Building, CalendarCheck, Check, Wallet } from "lucide";

import { Icon } from "@/shared/ui/icon";

import { LottieScreen } from "../components/lottie-screen";
import { PeekCard } from "../components/peek-card";
import { Phone } from "../components/phone";
import { Section } from "../components/section";
import type { SectionProps } from "../types";

import { DriverCtaBand } from "./driver-cta";

const DRIVER_WALLET_LOTTIE = encodeURI("/للسائقين/المحفظة السائق الدارك.json");
const DRIVER_TRIPS_LOTTIE = encodeURI("/للسائقين/سجل الرحلات السائق دارك.json");

export function DriverTools({ dict, locale, support }: SectionProps) {
  const { wallet, scheduled } = dict.driverTools;

  return (
    <Section id="driver-tools">
      <div className="shell grid gap-6 lg:grid-cols-2">
        <PeekCard
          tag={wallet.eyebrow}
          icon={Wallet}
          title={wallet.title}
          body={wallet.body}
          className="h-[46rem] bg-[linear-gradient(165deg,color-mix(in_oklab,var(--success)_14%,var(--surface)),var(--surface)_60%)]"
          tagClass="bg-heading text-canvas"
          phone={
            <Phone>
              <LottieScreen src={DRIVER_WALLET_LOTTIE} />
            </Phone>
          }
        >
          <ul className="mt-5 flex flex-wrap gap-2">
            {wallet.items.map((item) => (
              <li key={item} className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[13px] font-medium text-heading ring-1 ring-line">
                <Icon node={Check} size={14} strokeWidth={2.4} className="text-success" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-center gap-2 text-[13px] font-medium text-accent">
            <Icon node={Building} size={15} className="shrink-0" />
            {wallet.topup}
          </p>
        </PeekCard>

        <PeekCard
          tag={scheduled.eyebrow}
          icon={CalendarCheck}
          title={scheduled.title}
          body={scheduled.body}
          className="h-[46rem] bg-[linear-gradient(165deg,color-mix(in_oklab,var(--warning)_14%,var(--surface)),var(--surface)_60%)]"
          tagClass="bg-heading text-canvas"
          revealDelay={120}
          phone={
            <Phone>
              <LottieScreen src={DRIVER_TRIPS_LOTTIE} />
            </Phone>
          }
        >
          <ul className="mt-5 flex flex-wrap gap-2">
            <li className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[13px] font-medium text-heading ring-1 ring-line">
              <Icon node={CalendarCheck} size={14} className="text-success" />
              {dict.mock.scheduled.accepted}
            </li>
            <li className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[13px] font-medium text-heading ring-1 ring-line">
              <Icon node={BellRing} size={14} className="text-warning" />
              {dict.mock.scheduled.reminder}
            </li>
          </ul>
        </PeekCard>
      </div>
      <div className="shell mt-6">
        <DriverCtaBand dict={dict} locale={locale} support={support} />
      </div>
    </Section>
  );
}
