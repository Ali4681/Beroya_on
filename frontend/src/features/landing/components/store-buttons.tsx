import type { ReactNode } from "react";

import { site } from "@/core/config/site";
import type { Dictionary } from "@/core/i18n/dictionaries";
import { cx } from "@/shared/lib/cx";
import { Tooltip } from "@/shared/ui/tooltip";

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
      />
    </svg>
  );
}

function GooglePlayLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path fill="#FBBC04" d="M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594z" />
      <path fill="#4285F4" d="M1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924z" />
      <path fill="#34A853" d="M13.544 10.989l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973z" />
      <path fill="#EA4335" d="M13.544 13.056l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z" />
    </svg>
  );
}

type StoreButtonProps = {
  href: string | null;
  icon: ReactNode;
  caption: string;
  name: string;
  soon: string;
  tone: "default" | "light";
};

function StoreButton({ href, icon, caption, name, soon, tone }: StoreButtonProps) {
  const className = cx(
    "group relative inline-flex h-14 min-w-[10.5rem] items-center gap-3 rounded-2xl ps-4 pe-5 transition duration-300 ease-out-soft",
    tone === "light" ? "bg-white text-ink" : "bg-heading text-canvas",
    href ? "hover:-translate-y-0.5 hover:shadow-float" : "cursor-default",
  );

  const content = (
    <>
      {icon}
      <span className="flex flex-col items-start leading-none">
        <span className="text-[10.5px] font-medium opacity-75">{caption}</span>
        <span className="mt-1 text-[17px] font-semibold tracking-tight">{name}</span>
      </span>
      {href ? null : (
        <span className="absolute -top-2.5 end-3 rounded-full bg-brand px-2 py-0.5 text-[10.5px] font-semibold text-ink shadow-sm">
          {soon}
        </span>
      )}
    </>
  );

  if (!href) {
    return (
      <Tooltip label={`${name} · ${soon}`}>
        <span className={className}>{content}</span>
      </Tooltip>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {content}
    </a>
  );
}

type StoreButtonsProps = {
  common: Dictionary["common"];
  className?: string;
  tone?: "default" | "light";
};

export function StoreButtons({ common, className, tone = "default" }: StoreButtonsProps) {
  return (
    <div className={cx("flex flex-wrap items-center gap-3", className)}>
      <StoreButton
        href={site.links.appStore}
        icon={<AppleLogo className="size-[26px] shrink-0" />}
        caption={common.store.apple.caption}
        name={common.store.apple.name}
        soon={common.soon}
        tone={tone}
      />
      <StoreButton
        href={site.links.googlePlay}
        icon={<GooglePlayLogo className="size-6 shrink-0" />}
        caption={common.store.google.caption}
        name={common.store.google.name}
        soon={common.soon}
        tone={tone}
      />
    </div>
  );
}
