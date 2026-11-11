import { BellRing, MapPin } from "lucide";
import { useId } from "react";

import { listServiceAreas } from "@/application/use-cases/list-service-areas";
import type { ServiceArea } from "@/domain/entities/service-area";
import { createLandingServices } from "@/infrastructure/composition/landing-services";
import { delay } from "@/shared/lib/css-vars";
import { cx } from "@/shared/lib/cx";
import { Icon } from "@/shared/ui/icon";

import { Section } from "../components/section";
import { SectionHeading } from "../components/section-heading";
import type { SectionProps } from "../types";

// Simplified national outline as [lng, lat]; precise enough for a decorative dot map.
const outline: [number, number][] = [
  [35.97, 34.64], [35.88, 34.9], [35.92, 35.2], [35.9, 35.4], [35.75, 35.55], [35.82, 35.85],
  [35.95, 35.93], [36.17, 35.82], [36.38, 36.02], [36.68, 36.23], [36.56, 36.5], [36.66, 36.83],
  [37.06, 36.66], [37.5, 36.66], [38.0, 36.84], [38.73, 36.7], [39.2, 36.67], [40.07, 36.85],
  [40.78, 37.06], [41.23, 37.07], [41.82, 37.12], [42.36, 37.11], [42.08, 36.9], [41.86, 36.65],
  [41.4, 36.52], [41.27, 36.36], [41.24, 35.6], [41.0, 34.42], [38.79, 33.37], [36.84, 32.31],
  [36.4, 32.37], [36.0, 32.52], [35.79, 32.68], [35.63, 32.69], [35.65, 33.0], [35.82, 33.3],
  [36.05, 33.6], [36.3, 33.85], [36.45, 34.05], [36.62, 34.25], [36.55, 34.5], [36.3, 34.65],
];

const project = (lng: number, lat: number) => ({ x: (lng - 35.4) * 82, y: (37.35 - lat) * 100 });

const outlinePath = `${outline
  .map(([lng, lat], index) => {
    const { x, y } = project(lng, lat);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  })
  .join("")}Z`;

function DotMap({ areas, locale }: { areas: ServiceArea[]; locale: SectionProps["locale"] }) {
  const id = useId();
  const dots = `${id}-dots`;

  return (
    <svg viewBox="0 0 600 530" className="h-auto w-full" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={dots} width="12" height="12" patternUnits="userSpaceOnUse">
          <circle cx="6" cy="6" r="3.1" className="fill-heading/22" />
        </pattern>
      </defs>
      <path d={outlinePath} className="fill-brand/5 stroke-line-strong" strokeWidth="1.5" strokeLinejoin="round" />
      <path d={outlinePath} fill={`url(#${dots})`} />
      {areas.map((area, index) => {
        const { x, y } = project(area.coordinates.lng, area.coordinates.lat);
        const active = area.status === "active";

        return (
          <g key={area.id} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
            <g className="stagger-in" style={delay(300 + index * 200)}>
            <circle r="34" className={active ? "fill-success/15" : "fill-brand/12"} />
            {active ? (
              <circle r="14" className="animate-pulse-ring fill-success/40 [transform-box:fill-box] origin-center" />
            ) : (
              <circle r="20" fill="none" strokeWidth="2" strokeDasharray="4 5" className="animate-spin-slow stroke-brand-strong [transform-box:fill-box] origin-center" />
            )}
            <circle r="9" className="fill-surface" />
            <circle r="5.5" className={active ? "fill-success" : "fill-brand-strong"} />
            <text
              y="-30"
              textAnchor="middle"
              strokeWidth="6"
              paintOrder="stroke"
              strokeLinejoin="round"
              className="fill-heading stroke-surface text-[19px] font-semibold"
            >
              {area.name[locale]}
            </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

export async function ServiceAreas({ dict, locale }: SectionProps) {
  const { areas: copy } = dict;
  const areas = await listServiceAreas(createLandingServices().serviceAreas);

  return (
    <Section id="areas" tone="surface">
      <div className="shell grid gap-14 lg:grid-cols-2 lg:items-center">
        <div>
          <SectionHeading eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
          <div data-reveal className="mt-10">
            {areas.length ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {areas.map((area) => (
                  <li key={area.id} className="flex items-center gap-3.5 rounded-2xl border border-line bg-canvas p-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-accent ring-1 ring-line">
                      <Icon node={MapPin} size={18} />
                    </span>
                    <span className="flex-1 text-[15px] font-semibold text-heading">{area.name[locale]}</span>
                    <span
                      className={cx(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
                        area.status === "active" ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
                      )}
                    >
                      <span className="size-1.5 rounded-full bg-current" />
                      {copy.status[area.status]}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-dashed border-line-strong p-5 text-[15px] text-muted">{copy.empty}</p>
            )}
            <p className="mt-6 flex items-start gap-2.5 text-sm leading-7 text-muted">
              <Icon node={BellRing} size={16} className="mt-1.5 shrink-0 text-accent" />
              {copy.note}
            </p>
          </div>
        </div>

        <div data-reveal data-live style={delay(120)} className="relative mx-auto w-full max-w-xl">
          <div aria-hidden="true" className="absolute inset-[10%] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand)_18%,transparent),transparent)]" />
          <div className="relative">
            <DotMap areas={areas} locale={locale} />
          </div>
        </div>
      </div>
    </Section>
  );
}
