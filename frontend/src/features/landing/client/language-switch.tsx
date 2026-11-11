"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition, type MouseEvent } from "react";

import { localeCookie, type Locale } from "@/core/i18n/config";
import { cx } from "@/shared/lib/cx";
import { whenIdle } from "@/shared/lib/when-idle";
import { Tooltip } from "@/shared/ui/tooltip";

import { keepReadingPosition } from "./locale-handoff";

type LanguageSwitchProps = {
  target: Locale;
  label: string;
  title: string;
  /** Prefetch now instead of waiting to be seen, e.g. when the menu holding the switch opens. */
  prefetch?: boolean;
  /** Keep the reader on the same document when switching locale (e.g. `/privacy`). */
  path?: string;
  className?: string;
};

// The switch is a client-side navigation to the other locale's prerendered page: it is prefetched
// while the switch is on screen, the page cross-fades in place (see the root layout) and the reader
// keeps their place. The real href keeps it working as a plain link without JavaScript.
export function LanguageSwitch({ target, label, title, prefetch = false, path = "", className }: LanguageSwitchProps) {
  const router = useRouter();
  const ref = useRef<HTMLAnchorElement>(null);
  const [pending, startTransition] = useTransition();
  const suffix = path && !path.startsWith("/") ? `/${path}` : path;
  const href = `/${target}${suffix}`;

  useEffect(() => {
    const link = ref.current;
    if (!link) {
      return;
    }

    let cancel = () => {};
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || link.checkVisibility?.({ visibilityProperty: true }) === false) {
        return;
      }
      observer.disconnect();
      cancel = whenIdle(() => router.prefetch(href));
    });

    observer.observe(link);
    return () => {
      observer.disconnect();
      cancel();
    };
  }, [router, href]);

  useEffect(() => {
    if (prefetch) {
      router.prefetch(href);
    }
  }, [prefetch, router, href]);

  function switchLocale(event: MouseEvent<HTMLAnchorElement>) {
    document.cookie = `${localeCookie}=${target}; path=/; max-age=31536000; samesite=lax`;
    const hash = window.location.hash;

    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      event.currentTarget.hash = hash;
      return;
    }

    event.preventDefault();
    keepReadingPosition(target);
    startTransition(() => {
      router.push(href + hash, { scroll: false });
    });
  }

  return (
    <Tooltip label={title} className={className}>
      <a
        ref={ref}
        href={href}
        hrefLang={target}
        lang={target}
        aria-label={title}
        aria-busy={pending || undefined}
        onClick={switchLocale}
        onPointerEnter={() => router.prefetch(href)}
        onFocus={() => router.prefetch(href)}
        className="relative grid h-10 min-w-10 place-items-center rounded-full border border-line bg-surface/70 px-3 text-[13px] font-semibold text-heading transition hover:border-line-strong hover:bg-surface"
      >
        <span className={cx(pending && "locale-busy-label")}>{label}</span>
        {pending ? <span aria-hidden="true" className="locale-busy-spinner" /> : null}
      </a>
    </Tooltip>
  );
}
