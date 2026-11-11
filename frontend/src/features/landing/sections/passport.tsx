import { Flame, Gift, Layers, Stamp as StampIcon, TicketPercent, Trophy, type IconNode } from "lucide";

import { delay } from "@/shared/lib/css-vars";
import { Icon } from "@/shared/ui/icon";

import { CountUp } from "../client/count-up";
import { PassportBookClient } from "../client/passport-book-client";
import { LogoMark } from "../components/logo";
import { Section } from "../components/section";
import { SectionHeading } from "../components/section-heading";
import type { SectionProps } from "../types";

const collectIcons: IconNode[] = [Layers, Flame, StampIcon, Trophy, Gift, TicketPercent];

function HolderPage({ dict, locale }: SectionProps) {
  const { booklet, streak } = dict.passport;

  return (
    <div className="paper relative flex h-full min-h-0 min-w-0 flex-col p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <span dir="ltr" className="text-[11px] font-semibold tracking-[0.32em] text-accent">
          BEROYA · PASSPORT
        </span>
        <LogoMark className="h-4 shrink-0" />
      </div>

      <div className="mt-7 flex gap-5 sm:gap-6">
        <div className="relative size-28 shrink-0 overflow-hidden rounded-2xl bg-[linear-gradient(140deg,var(--teal),var(--brand))] shadow-card sm:size-32">
          <img
            src="/passport/reem.jpg"
            alt={booklet.holder}
            className="size-full object-cover"
            draggable={false}
          />
          <span className="sheen-overlay" />
        </div>
        <dl className="grid flex-1 content-start gap-4">
          <div>
            <dt className="text-[11px] font-medium text-muted">{booklet.holderLabel}</dt>
            <dd className="mt-0.5 text-xl font-semibold text-heading">{booklet.holder}</dd>
          </div>
          <div className="flex gap-8">
            <div>
              <dt className="text-[11px] font-medium text-muted">{booklet.levelLabel}</dt>
              <dd className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-2.5 py-0.5 text-sm font-semibold text-accent">
                <Icon node={Layers} size={13} />
                {booklet.level}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium text-muted">{booklet.memberLabel}</dt>
              <dd className="mt-1 text-sm font-semibold text-heading">{booklet.member}</dd>
            </div>
          </div>
        </dl>
      </div>

      <div className="mt-7 flex items-center gap-4 rounded-2xl bg-surface/85 p-4 ring-1 ring-line">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-warning/15 text-warning">
          <Icon node={Flame} size={24} className="animate-flame" />
        </span>
        <div>
          <p className="text-[11px] font-medium text-muted">{booklet.streakLabel}</p>
          <p className="text-2xl leading-tight font-semibold text-heading">
            <CountUp to={streak.count} locale={locale} />{" "}
            <span className="text-sm font-medium text-muted">{streak.label}</span>
          </p>
        </div>
        <div aria-hidden="true" className="ms-auto hidden items-end gap-1 sm:flex">
          {[10, 16, 12, 20, 14, 24, 28].map((height, index) => (
            <span
              key={index}
              className="stagger-in w-1.5 rounded-full bg-warning"
              style={{ height, ...delay(500 + index * 80), opacity: 0.35 + index * 0.1 }}
            />
          ))}
        </div>
      </div>

      <div dir="ltr" aria-hidden="true" className="mt-7 overflow-hidden font-mono text-[10.5px] leading-5 tracking-[0.2em] whitespace-nowrap text-muted/80">
        <p>P&lt;SYRBEROYA&lt;&lt;REEM&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</p>
        <p>BRY2026&lt;&lt;LV3&lt;&lt;ST18&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</p>
      </div>
    </div>
  );
}

export function Passport(props: SectionProps) {
  const { passport } = props.dict;
  const blurbs = [
    { icon: Layers, ...passport.levels },
    { icon: Flame, title: passport.streak.title, body: passport.streak.body },
    { icon: StampIcon, ...passport.stampsBlurb },
  ];

  return (
    <Section id="passport" tone="surface" className="overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute top-40 left-1/2 h-[40rem] w-[70rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand)_14%,transparent),transparent)]" />
      </div>

      <div className="shell relative">
        <SectionHeading
          eyebrow={passport.eyebrow}
          title={passport.title}
          description={passport.description}
          align="center"
        />

        <div data-reveal className="mt-16">
          <PassportBookClient
            holder={<HolderPage {...props} />}
            names={props.dict.stampNames}
            earn={props.dict.stampEarn}
            labels={{
              pageTitle: passport.booklet.pageTitle,
              flipHint: passport.booklet.flipHint,
              stampTapHint: passport.booklet.stampTapHint,
              previousPage: passport.booklet.previousPage,
              nextPage: passport.booklet.nextPage,
              pageOf: passport.booklet.pageOf,
            }}
          />
        </div>

        <ul data-reveal className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-2.5">
          {passport.collects.map((item, index) => (
            <li
              key={item}
              className="stagger-in inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-4 py-2 text-sm font-medium text-heading"
              style={delay(index * 80)}
            >
              <Icon node={collectIcons[index]} size={15} className="text-accent" />
              {item}
            </li>
          ))}
        </ul>

        <div className="mt-16 grid gap-5 md:grid-cols-3">
          {blurbs.map((blurb, index) => (
            <article key={blurb.title} data-reveal style={delay(index * 110)} className="rounded-[26px] border border-line bg-canvas p-6 sm:p-7">
              <span className="grid size-12 place-items-center rounded-2xl bg-heading text-canvas">
                <Icon node={blurb.icon} size={21} />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-heading">{blurb.title}</h3>
              <p className="mt-2 text-[15px] leading-7 text-muted">{blurb.body}</p>
            </article>
          ))}
        </div>
      </div>
    </Section>
  );
}
