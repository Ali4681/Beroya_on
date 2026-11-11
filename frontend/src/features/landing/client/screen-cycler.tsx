"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cx } from "@/shared/lib/cx";

type ScreenCyclerProps = {
  screens: ReactNode[];
  durations?: number[];
  interval?: number;
  className?: string;
};

// Cross-fades between phone screens while visible. Inactive screens stay mounted
// so the swap is instant; their entrance animations replay via the `.replay` class.
export function ScreenCycler({ screens, durations, interval = 3600, className }: ScreenCyclerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.2,
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || screens.length < 2) {
      return;
    }

    const timer = window.setTimeout(
      () => setIndex((current) => (current + 1) % screens.length),
      durations?.[index] ?? interval,
    );

    return () => window.clearTimeout(timer);
  }, [visible, index, durations, interval, screens.length]);

  return (
    <div ref={ref} className={cx("absolute inset-0", className)}>
      {screens.map((screen, position) => (
        <div key={position} className="screen-layer" data-active={position === index ? "" : undefined}>
          {screen}
        </div>
      ))}
    </div>
  );
}
