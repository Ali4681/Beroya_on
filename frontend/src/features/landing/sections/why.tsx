import { Check, Minus, X, type IconNode } from "lucide";

import { delay } from "@/shared/lib/css-vars";
import { cx } from "@/shared/lib/cx";
import { Icon } from "@/shared/ui/icon";

import { LogoMark } from "../components/logo";
import { Section } from "../components/section";
import { SectionHeading } from "../components/section-heading";
import type { SectionProps } from "../types";

type Mark = "yes" | "partial" | "no";

const marks: Record<Mark, { icon: IconNode; className: string }> = {
  yes: { icon: Check, className: "bg-brand text-ink" },
  partial: { icon: Minus, className: "bg-warning/15 text-warning" },
  no: { icon: X, className: "bg-line text-muted" },
};

function MarkBadge({ mark, label }: { mark: Mark; label: string }) {
  return (
    <span className={cx("inline-grid size-7 place-items-center rounded-full", marks[mark].className)}>
      <Icon node={marks[mark].icon} size={15} strokeWidth={2.6} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Why({ dict }: SectionProps) {
  const { why } = dict;
  const usualMark = (value: string): Mark => (value === "no" ? "no" : "partial");

  return (
    <Section id="why">
      <div className="shell grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start lg:gap-16">
        <SectionHeading eyebrow={why.eyebrow} title={why.title} description={why.description} className="lg:sticky lg:top-32" />

        <div data-reveal style={delay(100)} className="card overflow-hidden rounded-[30px]">
          <table className="w-full border-collapse text-start">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="px-4 py-5 text-start text-[13px] font-medium text-muted sm:px-7">
                  {why.columns.feature}
                </th>
                <th scope="col" className="w-[5.5rem] bg-brand/8 px-2 py-5 text-center sm:w-36 sm:px-3">
                  <span className="inline-flex flex-col items-center gap-1.5">
                    <LogoMark className="h-3.5" />
                    <span className="text-[13px] font-semibold whitespace-nowrap text-heading">{why.columns.us}</span>
                  </span>
                </th>
                <th scope="col" className="w-[5.5rem] px-2 py-5 text-center text-[12px] leading-5 font-medium text-muted sm:w-36 sm:px-3 sm:text-[13px]">
                  {why.columns.usual}
                </th>
              </tr>
            </thead>
            <tbody>
              {why.rows.map((row, index) => (
                <tr key={row.label} className="stagger-in border-b border-line last:border-0" style={delay(150 + index * 70)}>
                  <th scope="row" className="px-4 py-4 text-start text-[14px] font-medium text-heading sm:px-7 sm:text-[15px]">
                    {row.label}
                  </th>
                  <td className="bg-brand/8 px-3 py-4 text-center">
                    <MarkBadge mark="yes" label={why.legend.yes} />
                  </td>
                  <td className="px-3 py-4 text-center">
                    <MarkBadge mark={usualMark(row.usual)} label={why.legend[usualMark(row.usual)]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div aria-hidden="true" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-line bg-surface-2 px-5 py-4 text-xs text-muted">
            {(["yes", "partial", "no"] as const).map((mark) => (
              <span key={mark} className="inline-flex items-center gap-2">
                <span className={cx("inline-grid size-5 place-items-center rounded-full", marks[mark].className)}>
                  <Icon node={marks[mark].icon} size={11} strokeWidth={2.8} />
                </span>
                {why.legend[mark]}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
