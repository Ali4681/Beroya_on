"use client";

import { Moon, Sun } from "lucide";
import type { MouseEvent } from "react";

import { Icon } from "@/shared/ui/icon";
import { Tooltip } from "@/shared/ui/tooltip";

import { THEME_STORAGE_KEY, type Theme } from "./theme";

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

function prefersInstantTheme() {
  return (
    matchMedia("(prefers-reduced-motion: reduce)").matches ||
    // View transitions can leave mobile Safari/Chrome unable to receive touch until skipped.
    matchMedia("(hover: none), (pointer: coarse)").matches
  );
}

const BUTTON_CLASS =
  "grid size-10 place-items-center rounded-full border border-line bg-surface/70 text-heading transition hover:border-line-strong hover:bg-surface";

export function ThemeToggle({
  label,
  className,
  buttonClassName = BUTTON_CLASS,
}: {
  label: string;
  className?: string;
  buttonClassName?: string;
}) {
  function toggle(event: MouseEvent<HTMLButtonElement>) {
    const next: Theme =
      document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";

    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {}

    if (!document.startViewTransition || document.hidden || prefersInstantTheme()) {
      applyTheme(next);
      return;
    }

    const x = event.clientX || window.innerWidth / 2;
    const y = event.clientY || 0;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const update = () => applyTheme(next);
    let transition: ViewTransition;
    try {
      // Typed so the page cross-fade in globals.css leaves this one to the circular reveal.
      transition = document.startViewTransition({ update, types: ["theme"] });
    } catch {
      try {
        transition = document.startViewTransition(update);
      } catch {
        applyTheme(next);
        return;
      }
    }

    const ignoreAbort = () => {};
    // Failsafe: a stuck VT blocks input; force-complete if it hangs.
    const watchdog = window.setTimeout(() => {
      try {
        transition.skipTransition();
      } catch {
        /* ignore */
      }
    }, 1500);
    transition.finished.finally(() => window.clearTimeout(watchdog)).catch(ignoreAbort);
    transition.updateCallbackDone.catch(ignoreAbort);
    transition.ready
      .then(() => {
        const root = document.documentElement;
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          {
            duration: 780,
            easing: "cubic-bezier(0.76, 0, 0.24, 1)",
            pseudoElement: "::view-transition-new(root)",
          },
        );
        root.animate(
          {
            transform: ["scale(1)", "scale(1.03)"],
            filter: ["brightness(1)", "brightness(0.78)"],
          },
          {
            duration: 780,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            pseudoElement: "::view-transition-old(root)",
          },
        );
      })
      .catch(ignoreAbort);
  }

  return (
    <Tooltip label={label} className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className={buttonClassName}
      >
        <span className="relative grid size-[18px] place-items-center">
          <Icon node={Sun} size={18} className="col-start-1 row-start-1 origin-center transition duration-500 ease-out dark:scale-0 dark:-rotate-90 dark:opacity-0" />
          <Icon node={Moon} size={18} className="col-start-1 row-start-1 origin-center scale-0 rotate-90 opacity-0 transition duration-500 ease-out dark:scale-100 dark:rotate-0 dark:opacity-100" />
        </span>
      </button>
    </Tooltip>
  );
}
