import type { CSSProperties, ReactNode } from "react";

import { cx } from "@/shared/lib/cx";

type PhoneProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function Phone({ children, className, style }: PhoneProps) {
  return (
    <div className={cx("phone", className)} style={style} aria-hidden="true">
      <div className="phone-screen">
        <div className="phone-island" />
        {children}
      </div>
    </div>
  );
}

export function StatusBar({ time, tone = "default" }: { time: string; tone?: "default" | "light" }) {
  return (
    <div
      className={cx(
        "absolute inset-x-0 top-0 z-30 flex h-11 items-center justify-between ps-8 pe-7 pt-1.5 text-[12px] font-semibold",
        tone === "light" ? "text-white" : "text-heading",
      )}
    >
      <span>{time}</span>
      <span dir="ltr" className="flex items-center gap-1.5">
        <svg viewBox="0 0 18 12" className="h-[10px] w-[15px]" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="10" y="3" width="3" height="9" rx="1" />
          <rect x="15" y="0" width="3" height="12" rx="1" opacity="0.35" />
        </svg>
        <svg viewBox="0 0 16 12" className="h-[10px] w-[14px]" fill="currentColor">
          <path d="M8 2.2c2.4 0 4.6.9 6.3 2.4l1.2-1.3A11 11 0 0 0 8 .4 11 11 0 0 0 .5 3.3l1.2 1.3A9.2 9.2 0 0 1 8 2.2Z" />
          <path d="M8 5.6c1.5 0 2.9.55 4 1.5l1.2-1.3A7.6 7.6 0 0 0 8 3.8c-2 0-3.8.75-5.2 2l1.2 1.3c1.1-.95 2.5-1.5 4-1.5Z" />
          <path d="M8 9.1c.6 0 1.2.2 1.7.6L8 11.6 6.3 9.7c.5-.4 1.1-.6 1.7-.6Z" />
        </svg>
        <svg viewBox="0 0 27 13" className="h-[11px] w-[24px]" fill="none">
          <rect x="0.5" y="0.5" width="22" height="12" rx="3.6" stroke="currentColor" opacity="0.4" />
          <rect x="2.2" y="2.2" width="15.5" height="8.6" rx="2.2" fill="currentColor" />
          <path d="M24.4 4.4v4.2c.9-.3 1.5-1.1 1.5-2.1s-.6-1.8-1.5-2.1Z" fill="currentColor" opacity="0.45" />
        </svg>
      </span>
    </div>
  );
}

export function HomeIndicator({ tone = "default" }: { tone?: "default" | "light" }) {
  return (
    <div
      className={cx(
        "absolute bottom-2 left-1/2 z-30 h-[4px] w-[104px] -translate-x-1/2 rounded-full",
        tone === "light" ? "bg-white/70" : "bg-heading/80",
      )}
    />
  );
}

type ScreenProps = {
  time: string;
  children: ReactNode;
  className?: string;
  tone?: "default" | "light";
};

export function Screen({ time, children, className, tone }: ScreenProps) {
  return (
    <div className={cx("absolute inset-0 overflow-hidden bg-canvas", className)}>
      <StatusBar time={time} tone={tone} />
      {children}
      <HomeIndicator tone={tone} />
    </div>
  );
}

export function Sheet({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "absolute inset-x-0 bottom-0 z-20 rounded-t-[26px] bg-surface px-4 pt-2.5 pb-7 shadow-[0_-18px_40px_-18px_rgb(13_16_23/0.35)]",
        className,
      )}
    >
      <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line-strong" />
      {children}
    </div>
  );
}

export function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <span
      className={cx(
        "grid shrink-0 place-items-center rounded-full bg-[linear-gradient(140deg,var(--teal),var(--brand))] font-semibold text-white",
        className ?? "size-10 text-[14px]",
      )}
    >
      {initials}
    </span>
  );
}
