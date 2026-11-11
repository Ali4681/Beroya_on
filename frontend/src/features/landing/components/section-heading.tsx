import type { ReactNode } from "react";

import { cx } from "@/shared/lib/cx";

export function Eyebrow({ children, className, tone = "default" }: { children: ReactNode; className?: string; tone?: "default" | "light" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium",
        tone === "light" ? "border-white/15 bg-white/5 text-white/85" : "border-line bg-surface/70 text-heading",
        className,
      )}
    >
      <span className="eyebrow-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

type SectionHeadingProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  align?: "start" | "center";
  className?: string;
  titleClassName?: string;
  as?: "h2" | "h3";
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "start",
  className,
  titleClassName,
  as: Heading = "h2",
}: SectionHeadingProps) {
  return (
    <div data-reveal className={cx("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Heading
        className={cx(
          "mt-5 text-[2rem] leading-[1.2] font-semibold text-balance text-heading sm:text-[2.6rem] lg:text-[2.9rem] ltr:tracking-tight rtl:leading-[1.32]",
          titleClassName,
        )}
      >
        {title}
      </Heading>
      {description ? (
        <p className="mt-5 text-base leading-8 text-pretty text-muted sm:text-lg sm:leading-8">{description}</p>
      ) : null}
    </div>
  );
}
