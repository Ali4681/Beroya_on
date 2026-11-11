import type { AnchorHTMLAttributes } from "react";

import { cx } from "@/shared/lib/cx";

const variants = {
  primary:
    "bg-brand text-ink shadow-glow hover:-translate-y-0.5 hover:bg-[color-mix(in_oklab,var(--brand),#fff_16%)]",
  secondary:
    "border border-line-strong bg-surface/70 text-heading hover:-translate-y-0.5 hover:border-heading/25 hover:bg-surface",
  inverse: "bg-heading text-canvas hover:-translate-y-0.5 hover:opacity-90",
  light: "bg-white text-ink hover:-translate-y-0.5 hover:bg-white/90",
} as const;

const sizes = {
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-6 text-[15px]",
} as const;

export type ButtonVariant = keyof typeof variants;

export function buttonClass(variant: ButtonVariant = "primary", size: keyof typeof sizes = "lg") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition duration-300 ease-out-soft",
    variants[variant],
    sizes[size],
  );
}

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonVariant;
  size?: keyof typeof sizes;
};

export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <a className={cx(buttonClass(variant, size), className)} {...props} />;
}
