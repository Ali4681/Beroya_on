// In-page links (#faq and the like) are followed here rather than by the browser. The sections on
// the way only have estimated heights until they come close (see section-rendering), so the target
// moves while the page scrolls towards it: the browser aims once and lands off, this aims again
// every frame. Up and down share one curve (nav-travel).

import { NAV_TRAVEL, NAV_TRAVEL_END, travelDuration, travelPosition, type NavTravelDetail } from "./nav-travel";

const INTERRUPTIONS = ["wheel", "touchstart", "pointerdown", "keydown"] as const;

let cancel: (() => void) | null = null;

// Where an element sits in the page, leaving out transforms: a target that reveals slides in from
// below, and aiming at it mid-slide would land short.
function pageTop(element: HTMLElement) {
  let top = element.offsetTop;
  for (let parent = element.offsetParent; parent instanceof HTMLElement && parent !== document.body; parent = parent.offsetParent) {
    top += parent.offsetTop + parent.clientTop;
  }
  return top;
}

function destination(target: HTMLElement) {
  // Until the section around the target comes close enough to render, the section stands in for
  // it: measuring inside a skipped section would have the browser lay it out just for that.
  let measured = target;
  const section = target.closest<HTMLElement>("main > section");
  if (section && section !== target) {
    const { top, bottom } = section.getBoundingClientRect();
    if (top > window.innerHeight * 1.5 || bottom < -window.innerHeight * 0.5) {
      measured = section;
    }
  }
  const margin = parseFloat(getComputedStyle(measured).scrollMarginTop) || 0;
  return Math.max(0, Math.min(pageTop(measured) - margin, document.documentElement.scrollHeight - window.innerHeight));
}

function clampScroll(top: number) {
  const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  return Math.min(max, Math.max(0, top));
}

function scrollToTarget(target: HTMLElement, hash: string, onArrival: () => void) {
  cancel?.();
  const instant = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const origin = window.scrollY;
  const distance = Math.abs(destination(target) - origin);

  const announce = (duration: number) => {
    const detail: NavTravelDetail = { hash, duration };
    window.dispatchEvent(new CustomEvent(NAV_TRAVEL, { detail }));
  };

  if (instant || distance < 2) {
    announce(0);
    window.scrollTo({ top: destination(target), behavior: "instant" });
    onArrival();
    window.dispatchEvent(new CustomEvent(NAV_TRAVEL_END));
    return;
  }

  const duration = travelDuration(distance, window.innerHeight);
  const started = performance.now();
  let frame = 0;
  let id = 0;
  let mode: "travel" | "settle" = "travel";
  let settleFrom = origin;
  let settleStart = started;
  let stopped = false;

  const stop = (arrived: boolean) => {
    if (stopped) {
      return;
    }
    stopped = true;
    cancelAnimationFrame(id);
    INTERRUPTIONS.forEach((type) => window.removeEventListener(type, halt));
    if (cancel === halt) {
      cancel = null;
    }
    window.dispatchEvent(new CustomEvent(NAV_TRAVEL_END));
    if (arrived) {
      onArrival();
    }
  };
  const halt = () => stop(false);
  cancel = halt;
  // Scrolling by hand takes over, as it does from the browser's own smooth scrolling.
  INTERRUPTIONS.forEach((type) => window.addEventListener(type, halt, { passive: true }));
  announce(duration);

  const step = (now: number) => {
    const to = destination(target);
    const here = window.scrollY;

    if (now - started > duration + 1600 || frame > 500) {
      window.scrollTo({ top: to, behavior: "instant" });
      stop(true);
      return;
    }

    if (mode === "travel") {
      const t = Math.min(1, (now - started) / duration);
      const ideal = clampScroll(travelPosition(origin, to, t));
      // A section that renders at its real height can jump the target. Catch up, but don't
      // outrun the curve on a normal frame.
      const gap = ideal - here;
      const maxStep = Math.max(window.innerHeight * 0.55, 32);
      const next = Math.abs(gap) > maxStep ? here + Math.sign(gap) * maxStep : ideal;
      window.scrollTo({ top: next, behavior: "instant" });
      if (t >= 1) {
        const gapNow = Math.abs(destination(target) - window.scrollY);
        if (gapNow < 1.5) {
          window.scrollTo({ top: destination(target), behavior: "instant" });
          stop(true);
          return;
        }
        mode = "settle";
        settleFrom = window.scrollY;
        settleStart = now;
      }
    } else {
      const live = destination(target);
      const t = Math.min(1, (now - settleStart) / 480);
      const next = settleFrom + (live - settleFrom) * easeOutSettle(t);
      window.scrollTo({ top: clampScroll(next), behavior: "instant" });
      if (t >= 1) {
        const gap = Math.abs(destination(target) - window.scrollY);
        if (gap < 1.5) {
          window.scrollTo({ top: destination(target), behavior: "instant" });
          stop(true);
          return;
        }
        settleFrom = window.scrollY;
        settleStart = now;
      }
    }

    frame++;
    id = requestAnimationFrame(step);
  };
  id = requestAnimationFrame(step);
}

function easeOutSettle(t: number) {
  return 1 - (1 - t) ** 3;
}

/** Follows in-page links with the scrolling above. Returns a stop function. */
export function followInPageLinks() {
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
    const target = link?.hash ? document.getElementById(decodeURIComponent(link.hash.slice(1))) : null;
    if (!link || !target) {
      return;
    }

    event.preventDefault();
    if (window.location.hash !== link.hash) {
      window.history.pushState(null, "", link.hash);
    }
    const byKeyboard = event.detail === 0;
    scrollToTarget(target, link.hash, () => {
      // As when following the link natively, the next Tab goes on from the target.
      if (byKeyboard) {
        if (!target.hasAttribute("tabindex")) {
          target.setAttribute("tabindex", "-1");
        }
        target.focus({ preventScroll: true });
      }
    });
  };

  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}
