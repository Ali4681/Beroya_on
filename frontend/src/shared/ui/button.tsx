import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonProps) {
  const variantClass =
    variant === "primary"
      ? "bg-brand text-ink hover:bg-[color-mix(in_oklab,var(--brand),#fff_16%)]"
      : "border border-line bg-surface text-heading hover:bg-canvas";

  return (
    <button
      type={type}
      className={`inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variantClass} ${className}`}
      {...props}
    />
  );
}
