"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cssVars } from "@/shared/lib/css-vars";
import { cx } from "@/shared/lib/cx";

import { Phone } from "../components/phone";

type Step = { title: string; body: string };

type HowStepperProps = {
  steps: Step[];
  stepLabel: string;
  numbers: string[];
  screens: ReactNode[];
  decoration?: ReactNode;
  interval?: number;
};

export function HowStepper({ steps, stepLabel, numbers, screens, decoration, interval = 4200 }: HowStepperProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.35,
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || paused) {
      return;
    }

    const timer = window.setTimeout(() => setActive((current) => (current + 1) % steps.length), interval);
    return () => window.clearTimeout(timer);
  }, [visible, paused, active, interval, steps.length]);

  return (
    <div ref={ref} className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-20">
      <ol
        className="grid gap-2.5"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        {steps.map((step, index) => {
          const isActive = index === active;
          return (
            <li key={step.title}>
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-current={isActive ? "step" : undefined}
                className={cx(
                  "relative flex w-full items-start gap-5 overflow-hidden rounded-3xl border p-5 text-start transition duration-500 ease-out-soft sm:p-6",
                  isActive ? "border-line bg-surface shadow-card" : "border-transparent hover:bg-surface/60",
                )}
              >
                <span
                  className={cx(
                    "grid size-12 shrink-0 place-items-center rounded-2xl text-lg font-semibold transition duration-500",
                    isActive ? "bg-brand text-ink shadow-glow" : "bg-surface text-muted ring-1 ring-line",
                  )}
                >
                  {numbers[index]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-muted">
                    {stepLabel} {numbers[index]}
                  </span>
                  <span className="mt-1 block text-lg font-semibold text-heading sm:text-xl">{step.title}</span>
                  <span
                    className={cx(
                      "grid transition-[grid-template-rows,opacity] duration-500 ease-out-soft",
                      isActive ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                    )}
                  >
                    <span className="overflow-hidden">
                      <span className="block pt-1.5 text-[15px] leading-7 text-muted">{step.body}</span>
                    </span>
                  </span>
                </span>
                {isActive && visible && !paused ? (
                  <span
                    key={active}
                    className="progress-fill absolute inset-x-0 bottom-0 h-0.5 bg-brand"
                    style={cssVars({ "--duration": `${interval}ms` })}
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="relative mx-auto [--phone-zoom:0.9] sm:[--phone-zoom:1]">
        {decoration}
        <Phone className="relative">
          {screens.map((screen, index) => (
            <div key={index} className="screen-layer" data-active={index === active ? "" : undefined}>
              {screen}
            </div>
          ))}
        </Phone>
      </div>
    </div>
  );
}
