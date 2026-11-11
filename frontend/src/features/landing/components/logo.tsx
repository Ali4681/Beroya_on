import { BrandLockup } from "@/shared/ui/brand-lockup";
import { cx } from "@/shared/lib/cx";

export function LogoMark({ className }: { className?: string }) {
  return <BrandLockup decorative className={cx("h-4 text-heading", className)} />;
}

export function Logo({ className, tone = "default" }: { className?: string; tone?: "default" | "light" }) {
  return (
    <span dir="ltr" className={cx("inline-flex translate-y-[6px] items-center", className)}>
      <BrandLockup
        className={cx("h-6 sm:h-7", tone === "light" ? "text-white" : "text-heading")}
      />
    </span>
  );
}
