import { ArrowUpRight, Download } from "lucide";

import { delay } from "@/shared/lib/css-vars";
import { cx } from "@/shared/lib/cx";
import { formatNumber } from "@/shared/lib/format";
import { Icon } from "@/shared/ui/icon";

import { ButtonLink } from "../components/button-link";
import { CarSide } from "../components/car";
import { driverSignupHref } from "../links";
import type { SectionProps } from "../types";

export function DriverCtaBand({ dict, locale, className }: SectionProps & { className?: string }) {
  const cta = dict.driverCta;

  return (
    <div
      data-reveal
      data-live
      className={cx(
        "relative overflow-hidden rounded-[36px] bg-surface px-7 pt-12 pb-32 text-body ring-1 ring-line sm:px-12 sm:pt-16 sm:pb-36",
        className,
      )}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 start-1/4 size-[36rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand)_20%,transparent),transparent)]" />
        <div className="grid-fade absolute inset-0 opacity-60" />
      </div>

      <div className="relative grid gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
        <div>
          <h2 className="text-[2.1rem] leading-tight font-semibold text-balance text-heading sm:text-[2.8rem] rtl:leading-[1.3]">
            {cta.title}
          </h2>
          <p className="mt-4 max-w-lg text-base leading-8 text-muted sm:text-lg">{cta.description}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <ButtonLink href={driverSignupHref()}>
              {cta.primary}
              <Icon node={ArrowUpRight} size={18} className="rtl:-scale-x-100" />
            </ButtonLink>
            <ButtonLink href="#download" variant="secondary">
              <Icon node={Download} size={18} />
              {cta.secondary}
            </ButtonLink>
          </div>
        </div>

        <ol className="relative grid gap-3">
          {cta.steps.map((step, index) => (
            <li
              key={step}
              className="stagger-in flex items-center gap-4 rounded-2xl border border-line bg-canvas p-4"
              style={delay(200 + index * 160)}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-sm font-bold text-ink">
                {formatNumber(index + 1, locale)}
              </span>
              <span className="text-[15px] font-semibold text-heading">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div aria-hidden="true" className="@container absolute inset-x-0 bottom-0 h-24">
        <div className="absolute inset-x-0 bottom-0 h-12 bg-[color-mix(in_oklab,var(--surface),var(--text)_6%)]" />
        <div className="absolute inset-x-0 bottom-[23px] border-t-2 border-dashed border-heading/20" />
        <div className="drive-across absolute start-0 bottom-7 w-40 sm:w-48">
          <CarSide kind="sedan" paint="#22e0ee" className="w-full rtl:-scale-x-100" />
        </div>
      </div>
    </div>
  );
}
