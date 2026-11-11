"use client";

import { useEffect, useInsertionEffect, useLayoutEffect } from "react";

import { followInPageLinks } from "./in-page-links";
import { keepReadingPositionAcrossHistory, restoreReadingPosition } from "./locale-handoff";
import { keepPlaceAsSectionsRender } from "./section-rendering";

// One-shot entrances, CountUp included. Screens inside cyclers are left alone: they replay every
// time they come up.
const ENTRANCES = ":is(.animate-rise, .route-draw, .pop-in, .stamp-press, [data-count]):not(.screen-layer *)";

let mounted = false;
let swapping = false;
let hold: CSSStyleSheet | null = null;

function setSmil(root: ParentNode, running: boolean) {
  root.querySelectorAll<SVGSVGElement>("svg").forEach((svg) => {
    if (running) {
      svg.unpauseAnimations?.();
    } else {
      svg.pauseAnimations?.();
    }
  });
}

function holdTransitions() {
  if (hold || !("adoptedStyleSheets" in document)) {
    return;
  }
  hold = new CSSStyleSheet();
  hold.replaceSync("*, *::before, *::after { transition: none !important; }");
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, hold];
}

function releaseTransitions() {
  if (!hold) {
    return;
  }
  // Styles have to be computed while transitions are still off, or they animate from the bare state.
  document.documentElement.getBoundingClientRect();
  const sheet = hold;
  hold = null;
  document.adoptedStyleSheets = document.adoptedStyleSheets.filter((item) => item !== sheet);
}

// Whatever is on screen (or already scrolled past) shows in its final state; the rest still reveals.
function settleOnScreen() {
  const bottom = window.innerHeight;

  const placement = new Map<Element, "passed" | "ahead">();
  document.querySelectorAll("main > section").forEach((section) => {
    const rect = section.getBoundingClientRect();
    if (rect.bottom <= 0) {
      placement.set(section, "passed");
    } else if (rect.top >= bottom) {
      placement.set(section, "ahead");
    }
  });
  const placed = (element: Element) => {
    const section = element.closest("main > section");
    return section ? placement.get(section) : undefined;
  };

  document.querySelectorAll("[data-reveal]:not([data-shown])").forEach((element) => {
    const where = placed(element);
    if (where === "passed" || (!where && element.getBoundingClientRect().top < bottom)) {
      element.setAttribute("data-shown", "");
    }
  });
  document.querySelectorAll(ENTRANCES).forEach((element) => {
    const where = placed(element);
    if (where === "passed" || (!where && element.getBoundingClientRect().top < bottom)) {
      element.setAttribute("data-settled", "");
    }
  });
  document.querySelectorAll("[data-live]").forEach((element) => {
    if (placed(element)) {
      return;
    }
    const rect = element.getBoundingClientRect();
    if (rect.top < bottom && rect.bottom > 0) {
      element.setAttribute("data-inview", "");
    }
  });
}

// Reveals [data-reveal] blocks as they scroll in, and pauses CSS/SMIL loops
// inside [data-live] blocks while they are off screen.
export function MotionRuntime() {
  // Mounting again means the whole document was swapped in place (locale switch, back/forward).
  // React lays the new tree out before ThemeSync puts the theme back on <html>, so transitions
  // are held off until then; otherwise colors and reveals would animate in from that bare state.
  useInsertionEffect(() => {
    if (mounted) {
      swapping = true;
      holdTransitions();
    }
  }, []);

  useLayoutEffect(() => {
    mounted = true;
    if (!swapping) {
      return;
    }
    swapping = false;
    restoreReadingPosition();
    settleOnScreen();
    releaseTransitions();
  }, []);

  useEffect(() => keepReadingPositionAcrossHistory(), []);

  // Clear any stuck View Transition left from a previous theme/locale swap (blocks mobile touch).
  useEffect(() => {
    const active = (document as Document & { activeViewTransition?: { skipTransition: () => void } })
      .activeViewTransition;
    if (active) {
      try {
        active.skipTransition();
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    const stopFollowing = followInPageLinks();
    const stopKeeping = keepPlaceAsSectionsRender();
    return () => {
      stopFollowing();
      stopKeeping();
    };
  }, []);

  useEffect(() => {
    const reveals = document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-shown])");
    const lives = document.querySelectorAll<HTMLElement>("[data-live]");
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion || !("IntersectionObserver" in window)) {
      reveals.forEach((element) => element.setAttribute("data-shown", ""));
      lives.forEach((element) => element.setAttribute("data-inview", ""));
      if (reduceMotion) {
        setSmil(document, false);
      }
      return;
    }

    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-shown", "");
            revealObserver.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    const liveObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          entry.target.toggleAttribute("data-inview", entry.isIntersecting);
          setSmil(entry.target, entry.isIntersecting);
        }
      },
      { rootMargin: "120px 0px" },
    );

    reveals.forEach((element) => revealObserver.observe(element));
    lives.forEach((element) => liveObserver.observe(element));

    return () => {
      revealObserver.disconnect();
      liveObserver.disconnect();
    };
  }, []);

  return null;
}
