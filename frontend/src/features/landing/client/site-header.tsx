"use client";

import { Menu, X } from "lucide";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import type { Locale } from "@/core/i18n/config";
import { cx } from "@/shared/lib/cx";
import { ThemeToggle } from "@/shared/theme/theme-toggle";
import { Icon } from "@/shared/ui/icon";
import { Tooltip } from "@/shared/ui/tooltip";

import { buttonClass } from "../components/button-link";

import { LanguageSwitch } from "./language-switch";
import { FOLLOW_MS, moveNavPill, NAV_TRAVEL, NAV_TRAVEL_END, type NavTravelDetail } from "./nav-travel";

type NavItem = { href: string; label: string };

type SiteHeaderProps = {
  logo: ReactNode;
  homeLabel: string;
  nav: NavItem[];
  labels: {
    primaryNav: string;
    openMenu: string;
    closeMenu: string;
    theme: string;
    download: string;
    downloadShort: string;
  };
  language: { target: Locale; label: string; title: string };
  mobileExtra: ReactNode;
};

function subscribeToScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  window.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}

const isScrolled = () => window.scrollY > 12;
const isAtTop = () => false;

// The last section whose top has passed 45% of the viewport stays active until the next one does.
function activeSection(nav: NavItem[]) {
  const line = window.innerHeight * 0.45;
  let current = nav[0]?.href ?? "";
  let nearest = -Infinity;
  for (const item of nav) {
    const top = document.querySelector(item.href)?.getBoundingClientRect().top;
    if (top !== undefined && top <= line && top > nearest) {
      nearest = top;
      current = item.href;
    }
  }
  return current;
}

export function SiteHeader({ logo, homeLabel, nav, labels, language, mobileExtra }: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const intentRef = useRef<string | null>(null);
  const activeRef = useRef("");
  const pillDestination = useRef<string | null>(null);
  const pillReady = useRef(false);
  const mountedAt = useRef(0);
  // Read during render rather than in an effect, so a page swapped in mid-scroll (locale switch)
  // starts with the right header instead of fading it in afterwards.
  const scrolled = useSyncExternalStore(subscribeToScroll, isScrolled, isAtTop);
  const active = useSyncExternalStore(
    subscribeToScroll,
    () => activeSection(nav),
    () => nav[0]?.href ?? "",
  );

  activeRef.current = active;
  intentRef.current = intent;
  const highlighted = intent ?? active;

  useLayoutEffect(() => {
    const pill = pillRef.current;
    const list = listRef.current;
    if (!pill || !list || intentRef.current) {
      return;
    }

    if (!mountedAt.current) {
      mountedAt.current = performance.now();
    }

    // The first placement (and the correction once the real scroll position is known) is instant,
    // so a refresh mid-page doesn't slide the highlight across the bar.
    if (!pillReady.current) {
      pillReady.current = true;
      if (moveNavPill(pill, list, active, 0)) {
        pillDestination.current = active;
      }
      return;
    }

    const frame = requestAnimationFrame(() => {
      if (intentRef.current || !pillRef.current || !listRef.current) {
        return;
      }
      const running = pillRef.current.getAnimations().length > 0;
      if (running && pillDestination.current === active) {
        return;
      }
      const snap = performance.now() - mountedAt.current < 120;
      if (moveNavPill(pillRef.current, listRef.current, active, snap ? 0 : FOLLOW_MS)) {
        pillDestination.current = active;
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [active, intent]);

  useEffect(() => {
    const onTravel = (event: Event) => {
      const detail = (event as CustomEvent<NavTravelDetail>).detail;
      if (!nav.some((item) => item.href === detail.hash)) {
        return;
      }
      intentRef.current = detail.hash;
      setIntent(detail.hash);
      if (moveNavPill(pillRef.current, listRef.current, detail.hash, detail.duration)) {
        pillDestination.current = detail.hash;
      }
    };
    const onEnd = () => {
      intentRef.current = null;
      setIntent(null);
    };

    window.addEventListener(NAV_TRAVEL, onTravel);
    window.addEventListener(NAV_TRAVEL_END, onEnd);
    return () => {
      window.removeEventListener(NAV_TRAVEL, onTravel);
      window.removeEventListener(NAV_TRAVEL_END, onEnd);
    };
  }, [nav]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || !("ResizeObserver" in window)) {
      return;
    }

    let width = list.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const next = list.getBoundingClientRect().width;
      if (Math.abs(next - width) < 0.5) {
        return;
      }
      width = next;
      const href = intentRef.current ?? activeRef.current;
      if (moveNavPill(pillRef.current, list, href, 0)) {
        pillDestination.current = href;
      }
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";

    const restore = () => {
      root.style.overflow = previousOverflow || "";
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    const onResize = () => {
      if (window.innerWidth >= 1024) {
        setOpen(false);
        restore();
      }
    };
    const onPageHide = () => restore();

    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      restore();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [open]);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 pt-3 sm:pt-4">
      <div className="shell">
        <div
          className={cx(
            "pointer-events-auto relative flex h-15 items-center gap-2 rounded-full border ps-4 pe-2 transition duration-500 ease-out-soft",
            scrolled || open ? "glass shadow-float" : "border-transparent",
          )}
        >
          <a href="#top" aria-label={homeLabel} className="shrink-0 rounded-full" onClick={() => setOpen(false)}>
            {logo}
          </a>

          <nav aria-label={labels.primaryNav} className="mx-auto hidden lg:block">
            <ul ref={listRef} className="relative flex items-center gap-0.5">
              <span
                ref={pillRef}
                aria-hidden
                className="pointer-events-none absolute top-0 left-0 z-0 origin-center rounded-full bg-heading/[0.07] opacity-0"
              />
              {nav.map((item) => {
                const isLit = highlighted === item.href;
                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      aria-current={isLit ? "location" : undefined}
                      className={cx(
                        "relative z-[1] block rounded-full px-3 py-2 text-[14px] font-medium whitespace-nowrap transition-colors duration-700 ease-out-soft xl:px-3.5",
                        isLit ? "text-heading" : "text-muted hover:text-heading",
                      )}
                    >
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="ms-auto flex items-center gap-1.5 lg:ms-0">
            <LanguageSwitch {...language} className="hidden sm:grid" />
            <ThemeToggle label={labels.theme} className="hidden sm:grid" />
            <a href="#download" className={cx(buttonClass("primary", "md"), "h-10 px-4 shadow-none")}>
              <span className="sm:hidden">{labels.downloadShort}</span>
              <span className="hidden sm:inline">{labels.download}</span>
            </a>
            <Tooltip label={open ? labels.closeMenu : labels.openMenu} className="inline-flex lg:hidden">
              <button
                type="button"
                className="grid size-10 place-items-center rounded-full border border-line bg-surface/70 text-heading"
                aria-expanded={open}
                aria-controls="mobile-menu"
                aria-label={open ? labels.closeMenu : labels.openMenu}
                onClick={() => setOpen((value) => !value)}
              >
                <Icon node={open ? X : Menu} size={19} />
              </button>
            </Tooltip>
          </div>
        </div>

        <div
          id="mobile-menu"
          className={cx(
            "mt-2 max-h-[calc(100dvh-6rem)] origin-top overflow-y-auto rounded-[28px] border border-line bg-surface/[0.97] p-3 shadow-float backdrop-blur-xl transition duration-300 ease-out-soft lg:hidden",
            open ? "pointer-events-auto visible translate-y-0 opacity-100" : "pointer-events-none invisible -translate-y-2 opacity-0",
          )}
        >
          <nav aria-label={labels.primaryNav}>
            <ul className="grid">
              {nav.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cx(
                      "flex items-center justify-between rounded-2xl px-4 py-3.5 text-[16px] font-medium transition-colors duration-700 ease-out-soft",
                      highlighted === item.href ? "bg-heading/[0.06] text-heading" : "text-body hover:bg-heading/[0.04]",
                    )}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-2 flex items-center gap-2 border-t border-line px-1 pt-3 sm:hidden">
            <LanguageSwitch {...language} prefetch={open} />
            <ThemeToggle label={labels.theme} />
          </div>
          <div className="mt-3 border-t border-line px-1 pt-4 pb-1" onClick={() => setOpen(false)}>
            {mobileExtra}
          </div>
        </div>
      </div>
    </header>
  );
}
