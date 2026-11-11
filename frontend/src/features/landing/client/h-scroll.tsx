"use client";

import { useEffect, useRef, type HTMLAttributes, type ReactNode, type Ref, type RefObject } from "react";

import { cx } from "@/shared/lib/cx";

/** Mouse-drag scrolling for overflow-x tracks. Touch/pen stay on native overflow scrolling. */
export function useHScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    // Touch devices: never run JS drag — native overflow-x must own the gesture.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      return;
    }

    const node = ref.current;
    if (!node) {
      return;
    }

    let pointerId: number | null = null;
    let originX = 0;
    let originY = 0;
    let originScroll = 0;
    let axis: "undecided" | "x" | "y" = "undecided";
    let dragged = false;
    let snapType = "";
    let scrollBehavior = "";

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) {
        return;
      }
      if (node.scrollWidth <= node.clientWidth + 2) {
        return;
      }
      pointerId = event.pointerId;
      originX = event.clientX;
      originY = event.clientY;
      originScroll = node.scrollLeft;
      axis = "undecided";
      dragged = false;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) {
        return;
      }
      const dx = event.clientX - originX;
      const dy = event.clientY - originY;

      if (axis === "undecided") {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
          return;
        }
        axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
        if (axis === "x") {
          try {
            node.setPointerCapture(event.pointerId);
          } catch {
            /* ignore */
          }
          snapType = node.style.scrollSnapType;
          scrollBehavior = node.style.scrollBehavior;
          node.style.scrollSnapType = "none";
          node.style.scrollBehavior = "auto";
          dragged = true;
        }
      }

      if (axis !== "x") {
        return;
      }

      event.preventDefault();
      // RTL scrollLeft is negative in Chromium; subtracting dx keeps pointer and content aligned.
      node.scrollLeft = originScroll - dx;
    };

    const endPointer = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) {
        return;
      }
      if (node.hasPointerCapture(event.pointerId)) {
        node.releasePointerCapture(event.pointerId);
      }
      if (axis === "x") {
        node.style.scrollSnapType = "";
        node.style.scrollBehavior = "";
      }
      pointerId = null;
      axis = "undecided";
    };

    // Block click-through after a drag so cards/links do not activate mid-swipe.
    const onClickCapture = (event: MouseEvent) => {
      if (!dragged) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      dragged = false;
    };

    node.addEventListener("pointerdown", onPointerDown);
    node.addEventListener("pointermove", onPointerMove, { passive: false });
    node.addEventListener("pointerup", endPointer);
    node.addEventListener("pointercancel", endPointer);
    node.addEventListener("lostpointercapture", endPointer);
    node.addEventListener("click", onClickCapture, true);

    return () => {
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("pointermove", onPointerMove);
      node.removeEventListener("pointerup", endPointer);
      node.removeEventListener("pointercancel", endPointer);
      node.removeEventListener("lostpointercapture", endPointer);
      node.removeEventListener("click", onClickCapture, true);
    };
  }, [ref]);
}

type HScrollProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  as?: "ul" | "div";
  children: ReactNode;
};

/** Horizontal strip: native overflow-x for touch; mouse drag via useHScroll. */
export function HScroll({ as = "div", className, children, ...props }: HScrollProps) {
  const ref = useRef<HTMLUListElement | HTMLDivElement | null>(null);
  useHScroll(ref);

  const classes = cx("h-scroll", className);

  if (as === "ul") {
    return (
      <ul ref={ref as Ref<HTMLUListElement>} className={classes} {...(props as HTMLAttributes<HTMLUListElement>)}>
        {children}
      </ul>
    );
  }

  return (
    <div ref={ref as Ref<HTMLDivElement>} className={classes} {...(props as HTMLAttributes<HTMLDivElement>)}>
      {children}
    </div>
  );
}
