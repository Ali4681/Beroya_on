"use client";

import { BookOpen, Stamp as StampIcon } from "lucide";
import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import type { Dictionary } from "@/core/i18n/dictionaries";
import { cssVars } from "@/shared/lib/css-vars";
import { cx } from "@/shared/lib/cx";
import { Icon } from "@/shared/ui/icon";

import { CatalogStamp, stampCatalog, type StampId } from "../components/stamp-catalog";

export const CLOSE_STAMP_TIPS = "passport:close-stamp-tips";

type FlipPoint = { x: number; y: number };

type FlipBounds = { left: number; top: number; width: number; height: number; pageWidth: number };

type FlipController = {
  showCorner: (pos: FlipPoint) => void;
  stopMove: () => void;
  getState: () => string;
  getBoundsRect: () => FlipBounds;
  getDirectionByPoint: (point: FlipPoint) => number;
  __portraitPatch?: boolean;
};

export type FlipBookApi = {
  getCurrentPageIndex: () => number;
  getPageCount: () => number;
  getState: () => string;
  flipNext: (corner?: string) => void;
  flipPrev: (corner?: string) => void;
  turnToNextPage: () => void;
  turnToPrevPage: () => void;
  getBoundsRect: () => { left: number; top: number; width: number; height: number };
  getPageCollection: () => {
    getCurrentSpreadIndex: () => number;
    getSpread: () => number[][];
  };
  getRender: () => {
    finishAnimation: () => void;
    clearShadow: () => void;
    setFlippingPage: (page: null) => void;
    setBottomPage: (page: null) => void;
    getOrientation: () => string;
  };
  getFlipController: () => FlipController;
};

export function clearFold(api: FlipBookApi) {
  try {
    const flip = api.getFlipController();
    const render = api.getRender();
    render.finishAnimation();
    flip.stopMove();
    render.setFlippingPage(null);
    render.setBottomPage(null);
    render.clearShadow();
  } catch {
    // ignore — peek/fold may already be idle
  }
}

export function spreadEdges(api: FlipBookApi) {
  const collection = api.getPageCollection();
  const spreads = collection.getSpread();
  const index = collection.getCurrentSpreadIndex();
  return {
    atStart: index <= 0,
    atEnd: index >= spreads.length - 1,
  };
}

const TOUCH_BOOK_MQ = "(hover: none), (pointer: coarse), (max-width: 719px)";

/**
 * StPageFlip portrait hit-test is broken (almost always "prev").
 * In portrait the visible page sits on the right half of the virtual spread
 * [pageWidth, 2*pageWidth] — map that half: left = prev, right = next.
 * Also fixes flipPrev/flipNext and swipe, which go through the same helper.
 */
export function patchPortraitPageFlip(api: FlipBookApi) {
  const flip = api.getFlipController();
  const render = api.getRender();
  if (!flip?.getDirectionByPoint || flip.__portraitPatch) {
    return;
  }
  const original = flip.getDirectionByPoint.bind(flip);
  flip.getDirectionByPoint = (point: FlipPoint) => {
    if (render.getOrientation() === "portrait") {
      const rect = flip.getBoundsRect();
      const localX = point.x - rect.pageWidth;
      return localX < rect.pageWidth / 2 ? 1 : 0;
    }
    return original(point);
  };
  flip.__portraitPatch = true;
}

export type FlipBookHandle = {
  pageFlip: () => FlipBookApi;
};

type PlacedStamp = {
  id: StampId;
  top: number;
  left: number;
  rot: number;
  width: number;
  zIndex: number;
};

export type BookLabels = {
  pageTitle: string;
  flipHint: string;
  stampTapHint: string;
  previousPage: string;
  nextPage: string;
  pageOf: string;
};

/** Every catalog stamp appears; light jitter only — not a chaotic scatter. */
const STAMPS_PER_PAGE = 5;

const SLOT_BASE = [
  { top: 8, left: 6, rot: -7, width: 7.1 },
  { top: 6, left: 52, rot: 8, width: 7.1 },
  { top: 36, left: 28, rot: -3, width: 8.0 },
  { top: 58, left: 4, rot: 5, width: 7.4 },
  { top: 56, left: 50, rot: -9, width: 6.8 },
] as const;

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function placeStamp(id: StampId, slotIndex: number): PlacedStamp {
  const slot = SLOT_BASE[slotIndex % SLOT_BASE.length];
  return {
    id,
    top: slot.top + (Math.random() * 4 - 2),
    left: slot.left + (Math.random() * 4 - 2),
    rot: slot.rot + (Math.random() * 4 - 2),
    width: slot.width + (Math.random() * 0.4 - 0.2),
    zIndex: 2 + slotIndex,
  };
}

export function buildStampPages(): PlacedStamp[][] {
  const ids = shuffle(Object.keys(stampCatalog) as StampId[]);
  const pages: PlacedStamp[][] = [];
  for (let i = 0; i < ids.length; i += STAMPS_PER_PAGE) {
    const slice = ids.slice(i, i + STAMPS_PER_PAGE);
    pages.push(slice.map((id, index) => placeStamp(id, index)));
  }
  return pages;
}

export const FlipPage = forwardRef<HTMLDivElement, { children: ReactNode; className?: string; hard?: boolean }>(
  function FlipPage({ children, className, hard }, ref) {
    return (
      <div
        ref={ref}
        data-density={hard ? "hard" : "soft"}
        className={cx(
          "passport-stf-page overflow-hidden bg-[color:var(--paper,#fbfaf5)] text-[color:var(--heading)]",
          className,
        )}
      >
        {children}
      </div>
    );
  },
);

type TipBox = { top: number; left: number; side: "top" | "bottom" };

function isFineDesktopHover() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia(TOUCH_BOOK_MQ).matches
  );
}

/**
 * Only one stamp tip may be active. Calling activate() closes the previous tip
 * without broadcasting CLOSE_STAMP_TIPS (which would also clear the tip about to open).
 */
let activeStampCloser: (() => void) | null = null;

const STAMP_ACTIVATE = "passport:stamp-activate";

/** Ignore duplicate open attempts from touchend + click pairs. */
let stampOpenLockUntil = 0;

/**
 * Stamp opener on the passport book container only (never document).
 * Touch listeners are passive — preventDefault is forbidden (breaks iOS page scroll).
 * Listeners mount only while #passport (or the book) intersects the viewport.
 */
export function useStampHitOpener(rootRef: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const root = rootRef.current;
    if (!root) {
      return;
    }

    let attached = false;
    const touchOrigin = { x: 0, y: 0, active: false };

    const findHit = (x: number, y: number, fallback: EventTarget | null) => {
      const fromPoint = document.elementFromPoint(x, y);
      const viaPoint =
        fromPoint instanceof Element ? fromPoint.closest("button.passport-stamp-hit") : null;
      if (viaPoint && root.contains(viaPoint)) {
        return viaPoint;
      }
      const viaTarget =
        fallback instanceof Element ? fallback.closest("button.passport-stamp-hit") : null;
      return viaTarget && root.contains(viaTarget) ? viaTarget : null;
    };

    const activateHit = (hit: Element) => {
      const now = performance.now();
      if (now < stampOpenLockUntil) {
        return;
      }
      stampOpenLockUntil = now + 700;
      hit.dispatchEvent(new CustomEvent(STAMP_ACTIVATE, { bubbles: false }));
    };

    const onTouchStart = (event: TouchEvent) => {
      const point = event.changedTouches[0];
      if (!point) {
        return;
      }
      touchOrigin.x = point.clientX;
      touchOrigin.y = point.clientY;
      touchOrigin.active = true;
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!touchOrigin.active) {
        return;
      }
      touchOrigin.active = false;
      const point = event.changedTouches[0];
      if (!point) {
        return;
      }
      if (
        Math.abs(point.clientX - touchOrigin.x) > 22 ||
        Math.abs(point.clientY - touchOrigin.y) > 22
      ) {
        return;
      }
      const hit = findHit(point.clientX, point.clientY, event.target);
      if (!hit) {
        return;
      }
      event.stopPropagation();
      activateHit(hit);
    };

    const onClick = (event: MouseEvent) => {
      if (performance.now() < stampOpenLockUntil) {
        const hit = findHit(event.clientX, event.clientY, event.target);
        if (hit) {
          event.stopPropagation();
        }
        return;
      }
      const hit = findHit(event.clientX, event.clientY, event.target);
      if (!hit) {
        return;
      }
      event.stopPropagation();
      activateHit(hit);
    };

    const attach = () => {
      if (attached) {
        return;
      }
      attached = true;
      root.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
      root.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
      root.addEventListener("click", onClick, true);
    };

    const detach = () => {
      if (!attached) {
        return;
      }
      attached = false;
      root.removeEventListener("touchstart", onTouchStart, true);
      root.removeEventListener("touchend", onTouchEnd, true);
      root.removeEventListener("click", onClick, true);
    };

    const section = document.getElementById("passport") ?? root;
    if (typeof IntersectionObserver === "undefined") {
      attach();
      return detach;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          attach();
        } else {
          detach();
        }
      },
      { rootMargin: "100px 0px", threshold: 0 },
    );
    observer.observe(section);

    return () => {
      observer.disconnect();
      detach();
    };
  }, [rootRef, enabled]);
}

/**
 * Stamp name + earn explanation.
 * Always opens a bottom sheet (visible on mobile). Hover still works on desktop.
 */
function StampTip({ label, detail, children }: { label: string; detail: string; children: ReactNode }) {
  const tipRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const hoverTimer = useRef(0);
  const [open, setOpen] = useState(false);
  const [hoverOnly, setHoverOnly] = useState(false);
  const [box, setBox] = useState<TipBox | null>(null);

  const close = useCallback(() => {
    window.clearTimeout(hoverTimer.current);
    setOpen(false);
    setHoverOnly(false);
    setBox(null);
    if (activeStampCloser === close) {
      activeStampCloser = null;
    }
  }, []);

  const activate = useCallback(
    (asHover = false) => {
      window.clearTimeout(hoverTimer.current);
      if (activeStampCloser && activeStampCloser !== close) {
        activeStampCloser();
      }
      activeStampCloser = close;
      setHoverOnly(asHover);
      setOpen(true);
    },
    [close],
  );

  useEffect(() => {
    const onCloseAll = () => close();
    window.addEventListener(CLOSE_STAMP_TIPS, onCloseAll);
    return () => {
      window.removeEventListener(CLOSE_STAMP_TIPS, onCloseAll);
      if (activeStampCloser === close) {
        activeStampCloser = null;
      }
    };
  }, [close]);

  useEffect(() => {
    const node = buttonRef.current;
    if (!node) {
      return;
    }
    const onActivate = () => activate(false);
    node.addEventListener(STAMP_ACTIVATE, onActivate as EventListener);
    return () => node.removeEventListener(STAMP_ACTIVATE, onActivate as EventListener);
  }, [activate]);

  useLayoutEffect(() => {
    if (!open || !hoverOnly) {
      return;
    }
    const place = () => {
      const tip = tipRef.current;
      const anchor = buttonRef.current;
      if (!tip || !anchor) {
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const width = rect.width || 80;
      const tipWidth = Math.max(tip.offsetWidth, 168);
      const tipHeight = Math.max(tip.offsetHeight, 56);
      const gap = 8;
      const margin = 10;
      const topSafe = 72;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top - topSafe;
      const side: TipBox["side"] =
        spaceBelow < tipHeight + gap + margin && spaceAbove > spaceBelow ? "top" : "bottom";
      const top =
        side === "bottom" ? rect.bottom + gap : Math.max(topSafe, rect.top - gap - tipHeight);
      const rawLeft = rect.left + width / 2 - tipWidth / 2;
      const maxLeft = Math.max(margin, window.innerWidth - tipWidth - margin);
      const left = Math.min(Math.max(margin, rawLeft), maxLeft);
      setBox({ top, left, side });
    };
    place();
    const raf = window.requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, hoverOnly, label, detail]);

  useEffect(() => {
    if (!open || hoverOnly) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hoverOnly, close]);

  const closeLabel =
    typeof document !== "undefined" && document.documentElement.dir === "rtl" ? "إغلاق" : "Close";

  const showSheet = open && !hoverOnly;
  const showHoverTip = open && hoverOnly;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="passport-stamp-hit block w-full"
        aria-label={`${label}. ${detail}`}
        aria-expanded={open}
        data-open={open ? "true" : undefined}
        onPointerDown={(event) => {
          // Keep StPageFlip from treating the stamp as a page-fold gesture.
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          // Native strip + desktop: open the stamp sheet from the button itself.
          activate(false);
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === "touch" || !isFineDesktopHover()) {
            return;
          }
          window.clearTimeout(hoverTimer.current);
          hoverTimer.current = window.setTimeout(() => {
            activate(true);
          }, 120);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "touch" || !isFineDesktopHover()) {
            return;
          }
          if (hoverOnly) {
            close();
          }
        }}
      >
        {children}
      </button>
      {showSheet && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={tipRef}
              className="passport-stamp-sheet"
              role="dialog"
              aria-modal="true"
              aria-label={label}
            >
              <button
                type="button"
                className="passport-stamp-sheet-backdrop"
                aria-label={closeLabel}
                onClick={close}
              />
              <div className="passport-stamp-sheet-card">
                <span className="passport-stamp-tip-mark" />
                <div className="passport-stamp-tip-copy">
                  <span className="passport-stamp-tip-label">{label}</span>
                  <span className="passport-stamp-tip-detail">{detail}</span>
                </div>
                <button type="button" className="passport-stamp-sheet-close" onClick={close}>
                  {closeLabel}
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
      {showHoverTip && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={tipRef}
              className="passport-stamp-tip"
              data-placed={box ? "true" : undefined}
              data-side={box?.side ?? "bottom"}
              style={
                {
                  position: "fixed",
                  top: box?.top ?? 12,
                  left: box?.left ?? 12,
                  zIndex: 2147483646,
                  visibility: "visible",
                  opacity: 1,
                  pointerEvents: "none",
                  display: "block",
                } as CSSProperties
              }
              role="tooltip"
            >
              <div className="passport-stamp-tip-surface">
                <span className="passport-stamp-tip-mark" />
                <span className="passport-stamp-tip-copy">
                  <span className="passport-stamp-tip-label">{label}</span>
                  <span className="passport-stamp-tip-detail">{detail}</span>
                </span>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function StampLeaf({
  stamps,
  title,
  pageLabel,
  names,
  earn,
}: {
  stamps: PlacedStamp[];
  title: string;
  pageLabel: string;
  names: Dictionary["stampNames"];
  earn: Dictionary["stampEarn"];
}) {
  return (
    <div className="paper relative flex h-full flex-col p-5 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-heading">{title}</span>
        <span dir="ltr" className="font-mono text-xs tabular-nums text-muted">
          {pageLabel}
        </span>
      </div>
      <div className="relative mt-3 min-h-0 flex-1 overflow-hidden">
        {stamps.map((stamp) => (
          <div
            key={stamp.id}
            className="passport-stamp-pin absolute"
            style={
              {
                top: `${stamp.top}%`,
                left: `${stamp.left}%`,
                width: `${stamp.width}rem`,
                zIndex: stamp.zIndex,
                ["--stamp-rot" as string]: `${stamp.rot}deg`,
              } as CSSProperties
            }
          >
            <StampTip label={names[stamp.id]} detail={earn[stamp.id]}>
              <CatalogStamp
                id={stamp.id}
                names={names}
                className="passport-stamp-art pointer-events-none"
                style={cssVars({ "--rot": "0deg", "--delay": "0ms" })}
              />
            </StampTip>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Touch / coarse pointer: native strip — never loads StPageFlip. */
export function PassportTouchStrip({
  holder,
  names,
  earn,
  labels,
}: {
  holder: ReactNode;
  names: Dictionary["stampNames"];
  earn: Dictionary["stampEarn"];
  labels: BookLabels;
}) {
  const [stampPages, setStampPages] = useState<PlacedStamp[][] | null>(null);

  useEffect(() => {
    setStampPages(buildStampPages());
  }, []);

  const pageLabel = useCallback(
    (leafIndex: number) => {
      const current = String(leafIndex + 1).padStart(2, "0");
      const total = String(stampPages?.length ?? 1).padStart(2, "0");
      return labels.pageOf.replace("{current}", current).replace("{total}", total);
    },
    [labels.pageOf, stampPages],
  );

  if (!stampPages) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-[30px] bg-[linear-gradient(145deg,#24666b,#123a3e_55%,#0c282b)] p-2 shadow-float sm:p-2.5">
          <div className="paper min-h-[22rem] animate-pulse rounded-[22px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="overflow-hidden rounded-[30px] bg-[linear-gradient(145deg,#24666b,#123a3e_55%,#0c282b)] p-2 shadow-float sm:p-2.5">
        <div className="no-scrollbar flex gap-4 overflow-x-auto overflow-y-hidden px-5 py-3">
          <div className="paper h-[min(72dvh,34rem)] w-[min(82%,22rem)] shrink-0 overflow-hidden rounded-[22px]">
            {holder}
          </div>
          {stampPages.map((stamps, index) => (
            <div
              key={`stamp-${index}`}
              className="h-[min(72dvh,34rem)] w-[min(82%,22rem)] shrink-0 overflow-hidden rounded-[22px]"
            >
              <StampLeaf
                stamps={stamps}
                title={labels.pageTitle}
                pageLabel={pageLabel(index)}
                names={names}
                earn={earn}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-col items-center gap-1.5 text-center">
        <p className="inline-flex items-center gap-2 text-sm text-muted">
          <Icon node={BookOpen} size={15} className="shrink-0 text-accent" />
          <span>{labels.flipHint}</span>
        </p>
        <p className="inline-flex items-center gap-2 text-sm text-muted">
          <Icon node={StampIcon} size={15} className="shrink-0 text-accent" />
          <span>{labels.stampTapHint}</span>
        </p>
      </div>
    </div>
  );
}
