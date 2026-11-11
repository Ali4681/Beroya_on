import { Activity, BadgeCheck, Headset, Radar, Siren, type IconNode } from "lucide";

import type { Dictionary } from "@/core/i18n/dictionaries";
import { delay } from "@/shared/lib/css-vars";
import { cx } from "@/shared/lib/cx";
import { Icon } from "@/shared/ui/icon";

import { Section } from "../components/section";
import { SectionHeading } from "../components/section-heading";
import type { SectionProps } from "../types";

type FeatureId = Dictionary["safety"]["features"][number]["id"];

const featureIcons: Record<FeatureId, IconNode> = {
  tracking: Radar,
  emergency: Siren,
  support: Headset,
  monitoring: Activity,
  verification: BadgeCheck,
};

function FeatureCard({
  feature,
  revealDelay,
  className,
}: {
  feature: Dictionary["safety"]["features"][number];
  revealDelay: number;
  className?: string;
}) {
  return (
    <article
      data-reveal
      style={delay(revealDelay)}
      className={cx(
        "group rounded-[26px] border border-line bg-surface/70 p-6 backdrop-blur transition duration-500 hover:-translate-y-1 hover:border-brand/30",
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-brand/12 text-brand-strong ring-1 ring-brand/20 transition duration-500 group-hover:bg-brand group-hover:text-ink">
        <Icon node={featureIcons[feature.id]} size={22} />
      </span>
      <h3 className="mt-5 text-lg font-semibold text-heading">{feature.title}</h3>
      <p className="mt-2 text-[15px] leading-7 text-muted">{feature.body}</p>
    </article>
  );
}

export function Safety({ dict }: SectionProps) {
  const { safety } = dict;
  const byId = Object.fromEntries(safety.features.map((feature) => [feature.id, feature])) as Record<
    FeatureId,
    Dictionary["safety"]["features"][number]
  >;

  const cards = [byId.tracking, byId.monitoring, byId.support, byId.verification] as const;

  return (
    <Section id="safety" className="overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/2 size-[56rem] -translate-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand)_18%,transparent),transparent)]" />
        <div className="grid-fade absolute inset-0 opacity-60" />
      </div>

      <div className="shell relative">
        <SectionHeading eyebrow={safety.eyebrow} title={safety.title} description={safety.description} align="center" />

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((feature, index) => (
            <FeatureCard key={feature.id} feature={feature} revealDelay={index * 70} />
          ))}
        </div>

        <div data-reveal style={delay(280)} className="relative mx-auto mt-12 max-w-2xl text-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-1/2 size-[22rem] -translate-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--danger)_16%,transparent),transparent)]"
          />
          <p className="relative inline-flex items-center gap-2 rounded-full bg-danger/15 px-3 py-1.5 text-[13px] font-semibold text-danger">
            <Icon node={Siren} size={15} />
            {byId.emergency.title}
          </p>
          <h3 className="relative mt-4 text-xl leading-snug font-semibold text-balance text-heading sm:text-2xl">
            {safety.emergency.title}
          </h3>
          <p className="relative mt-3 text-[15px] leading-7 text-muted sm:text-base">{safety.emergency.body}</p>
        </div>
      </div>
    </Section>
  );
}
