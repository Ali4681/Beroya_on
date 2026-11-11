"use client";

import { useEffect, useRef, useState } from "react";

import { intlLocale, type Locale } from "@/core/i18n/config";

type CountUpProps = {
  to: number;
  locale: Locale;
  duration?: number;
  className?: string;
};

export function CountUp({ to, locale, duration = 1600, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(to);
  const format = new Intl.NumberFormat(intlLocale[locale]);

  useEffect(() => {
    const node = ref.current;
    // data-settled: already on screen when the page was swapped in (see MotionRuntime).
    if (!node || node.hasAttribute("data-settled") || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          return;
        }
        observer.disconnect();

        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setValue(Math.round(eased * to));
          if (progress < 1) {
            frame = requestAnimationFrame(tick);
          }
        };
        setValue(0);
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [to, duration]);

  return (
    <span ref={ref} data-count="" className={className}>
      {format.format(value)}
    </span>
  );
}
