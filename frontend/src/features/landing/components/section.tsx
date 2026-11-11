import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "@/shared/lib/cx";

type SectionProps = HTMLAttributes<HTMLElement> & {
  tone?: "canvas" | "surface" | "dark";
  /** Vertical padding classes; replaces the default rhythm instead of competing with it. */
  padding?: string;
  /** Clip horizontal paint bleed from decorations. Off when a section hosts a full-bleed h-scroll. */
  clipX?: boolean;
  children: ReactNode;
};

// tone="dark" pins the section to the dark palette regardless of the active theme.
export function Section({
  tone = "canvas",
  padding = "py-24 sm:py-28 lg:py-32",
  clipX = true,
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      data-theme={tone === "dark" ? "dark" : undefined}
      className={cx(
        "relative",
        clipX && "overflow-x-clip",
        padding,
        tone === "surface" && "bg-surface",
        tone === "dark" && "bg-canvas text-body",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}
