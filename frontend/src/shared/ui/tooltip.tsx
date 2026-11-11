"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { cx } from "@/shared/lib/cx";

const HOVER_DELAY = 280;

type Side = "top" | "bottom";

type Box = {
  top: number;
  left: number;
  side: Side;
  arrow: number;
};

// Portaled so the label is not clipped by overflow on the header, mobile menu, or footer.
export function Tooltip({
  label,
  detail,
  children,
  className,
}: {
  label: string;
  detail?: string;
  children: ReactNode;
  className?: string;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const timer = useRef(0);
  const fromPointer = useRef(false);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  // Hover and keyboard focus show a label without intercepting control input.
  const [showDetail, setShowDetail] = useState(false);

  function prefersNoHoverTooltip() {
    return typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;
  }

  function show(delay: number) {
    if (prefersNoHoverTooltip()) {
      return;
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setShowDetail(false);
      setOpen(true);
    }, delay);
  }

  function hide() {
    window.clearTimeout(timer.current);
    setOpen(false);
    setBox(null);
    setShowDetail(false);
  }

  function onPointerEnter(event: PointerEvent<HTMLSpanElement>) {
    if (event.pointerType === "touch") {
      return;
    }
    show(HOVER_DELAY);
  }

  // Tooltips must never consume gestures intended for the wrapped control.
  function onPointerDown() {
    fromPointer.current = true;
    hide();
  }

  function onFocus() {
    if (fromPointer.current) {
      return;
    }
    show(40);
  }

  function onBlur() {
    fromPointer.current = false;
    hide();
  }

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    let placeTries = 0;
    const place = () => {
      const anchor = anchorRef.current;
      const tip = tipRef.current;
      if (!anchor || !tip) {
        return;
      }

      const rect = anchor.getBoundingClientRect();
      // Page-flip can briefly zero a page during paint — retry instead of closing the tip.
      if (rect.width === 0 || rect.height === 0) {
        placeTries += 1;
        if (placeTries < 8) {
          window.requestAnimationFrame(place);
        }
        return;
      }

      const tipRect = tip.getBoundingClientRect();
      const gap = 12;
      const margin = 10;
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      const side: Side = below < tipRect.height + gap + margin && above > below ? "top" : "bottom";
      const top = side === "bottom" ? rect.bottom + gap : rect.top - gap - tipRect.height;
      const rawLeft = rect.left + rect.width / 2 - tipRect.width / 2;
      const maxLeft = Math.max(margin, window.innerWidth - tipRect.width - margin);
      const left = Math.min(Math.max(margin, rawLeft), maxLeft);
      const center = rect.left + rect.width / 2 - left;
      const arrow = Math.min(Math.max(14, center), Math.max(14, tipRect.width - 14));

      setBox((current) => {
        if (
          current &&
          current.side === side &&
          Math.abs(current.top - top) < 0.5 &&
          Math.abs(current.left - left) < 0.5 &&
          Math.abs(current.arrow - arrow) < 0.5
        ) {
          return current;
        }
        return { top, left, side, arrow };
      });
    };

    place();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hide();
      }
    };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, label, detail, showDetail]);

  useLayoutEffect(() => () => window.clearTimeout(timer.current), []);

  const style: CSSProperties = {
    top: box?.top ?? 0,
    left: box?.left ?? 0,
    ["--arrow" as string]: `${box?.arrow ?? 0}px`,
  };

  return (
    <span
      ref={anchorRef}
      className={cx(className ?? "inline-flex")}
      data-open={open ? "true" : undefined}
      onPointerEnter={onPointerEnter}
      onPointerLeave={hide}
      onPointerDown={onPointerDown}
      onFocusCapture={onFocus}
      onBlurCapture={onBlur}
    >
      {children}
      {open
        ? createPortal(
            <span
              ref={tipRef}
              className="ui-tooltip"
              data-placed={box ? "true" : undefined}
              data-side={box?.side ?? "bottom"}
              style={style}
              role="tooltip"
            >
              <span className="ui-tooltip-arrow" />
              <span
                className="ui-tooltip-surface"
                data-detail={showDetail && detail ? "true" : undefined}
              >
                <span className="ui-tooltip-mark" />
                <span className="ui-tooltip-copy">
                  <span className="ui-tooltip-label">{label}</span>
                  {showDetail && detail ? <span className="ui-tooltip-detail">{detail}</span> : null}
                </span>
              </span>
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
