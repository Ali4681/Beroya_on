import { CarFront, CircleCheck, Headset, MessageSquareWarning, RefreshCw, ShieldAlert, TriangleAlert, Wrench, CircleAlert, type IconNode } from "lucide";

import { delay } from "@/shared/lib/css-vars";
import { Icon } from "@/shared/ui/icon";

import { Avatar } from "../components/phone";
import { Section } from "../components/section";
import { SectionHeading } from "../components/section-heading";
import type { SectionProps } from "../types";

const topicIcons: IconNode[] = [CircleAlert, MessageSquareWarning, ShieldAlert, Wrench, RefreshCw];

function SupportChat({ dict }: SectionProps) {
  const chat = dict.support.chat;

  return (
    <div data-reveal style={delay(120)} className="relative">
      <div aria-hidden="true" className="absolute -inset-8 rounded-[48px] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand)_16%,transparent),transparent)]" />
      <div className="card relative overflow-hidden rounded-[32px]">
        <div className="flex items-center gap-3.5 border-b border-line px-5 py-4 sm:px-6">
          <span className="relative">
            <Avatar initials={chat.agentInitial} className="size-11 text-base" />
            <span className="absolute -end-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-surface bg-success" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-heading">{chat.agent}</p>
            <p className="text-xs text-success">● {dict.mock.driverApp.online}</p>
          </div>
          <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-heading">
            <Icon node={Headset} size={18} />
          </span>
        </div>

        <div className="flex min-h-[23rem] flex-col gap-4 bg-[linear-gradient(to_bottom,var(--surface),var(--surface-2))] px-5 py-6 sm:px-6">
          <p className="stagger-in mx-auto inline-flex items-center gap-2 rounded-full bg-warning/14 px-3.5 py-2 text-[13px] font-medium text-heading" style={delay(250)}>
            <Icon node={TriangleAlert} size={15} className="text-warning" />
            {chat.alert}
          </p>

          <div className="stagger-in flex max-w-[85%] items-end gap-2.5" style={delay(800)}>
            <Avatar initials={chat.agentInitial} className="size-7 text-[11px]" />
            <p className="rounded-[20px] rounded-es-md bg-surface px-4 py-3 text-[15px] leading-7 text-heading shadow-card ring-1 ring-line">
              {chat.message}
            </p>
          </div>

          <div
            className="stagger-in ms-auto w-full max-w-[88%] overflow-hidden rounded-[22px] bg-success/12 p-4 ring-1 ring-success/25"
            style={delay(1500)}
          >
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success text-white dark:text-ink">
                <Icon node={CarFront} size={20} />
              </span>
              <p className="flex-1 text-[14px] leading-6 font-semibold text-heading">{chat.resolved}</p>
              <Icon node={CircleCheck} size={20} className="shrink-0 text-success" />
            </div>
            <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-success/15">
              <div className="indeterminate h-full w-2/5 rounded-full bg-success" />
            </div>
          </div>

          <div className="stagger-in mt-auto flex items-center gap-2.5 text-xs text-muted" style={delay(2100)}>
            <span className="flex items-center gap-1 rounded-full bg-surface px-3 py-2.5 text-muted shadow-card ring-1 ring-line">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </span>
            {chat.typing}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Support(props: SectionProps) {
  const { support } = props.dict;

  return (
    <Section id="support">
      <div className="shell grid gap-14 lg:grid-cols-2 lg:items-center lg:gap-20">
        <div>
          <SectionHeading eyebrow={support.eyebrow} title={support.title} description={support.description} />
          <ul data-reveal className="mt-7 flex flex-wrap gap-2.5">
            {support.topics.map((topic, index) => (
              <li
                key={topic}
                className="stagger-in inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-heading"
                style={delay(index * 90)}
              >
                <Icon node={topicIcons[index]} size={15} className="text-accent" />
                {topic}
              </li>
            ))}
          </ul>
          <div data-reveal className="mt-10 flex gap-4 rounded-[26px] border border-line bg-surface p-6">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-heading text-canvas">
              <Icon node={RefreshCw} size={21} />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-heading">{support.replacement.title}</h3>
              <p className="mt-2 text-[15px] leading-7 text-muted">{support.replacement.body}</p>
            </div>
          </div>
        </div>
        <SupportChat {...props} />
      </div>
    </Section>
  );
}
