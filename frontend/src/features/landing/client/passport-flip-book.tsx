"use client";

import { BookOpen, ChevronLeft, ChevronRight, Stamp as StampIcon } from "lucide";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
// Desktop only — never imported on touch devices.
import HTMLFlipBook from "react-pageflip";

import type { Dictionary } from "@/core/i18n/dictionaries";
import { cx } from "@/shared/lib/cx";
import { Icon } from "@/shared/ui/icon";

import {
  buildStampPages,
  clearFold,
  CLOSE_STAMP_TIPS,
  FlipPage,
  patchPortraitPageFlip,
  spreadEdges,
  StampLeaf,
  useStampHitOpener,
  type BookLabels,
  type FlipBookHandle,
} from "./passport-book";

/** Desktop StPageFlip booklet — loaded only when (hover:hover) and (pointer:fine). */
export function PassportFlipBook({
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
  const bookRef = useRef<FlipBookHandle | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastPageIndex = useRef(0);
  const flippingRef = useRef(false);
  const [stampPages, setStampPages] = useState<ReturnType<typeof buildStampPages> | null>(null);
  useStampHitOpener(rootRef, Boolean(stampPages));
  const [ready, setReady] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [showCornerHint, setShowCornerHint] = useState(true);

  useEffect(() => {
    setStampPages(buildStampPages());
  }, []);

  const syncPages = useCallback(() => {
    const api = bookRef.current?.pageFlip();
    if (!api) {
      return;
    }
    const nextIndex = api.getCurrentPageIndex();
    if (nextIndex !== lastPageIndex.current) {
      lastPageIndex.current = nextIndex;
      setShowCornerHint(false);
      flippingRef.current = false;
    }
    try {
      const edges = spreadEdges(api);
      setAtStart(edges.atStart);
      setAtEnd(edges.atEnd);
    } catch {
      setAtStart(nextIndex <= 0);
      setAtEnd(nextIndex >= api.getPageCount() - 1);
    }
  }, []);

  const runFlip = useCallback(
    (direction: "next" | "prev") => {
      const api = bookRef.current?.pageFlip();
      if (!api || flippingRef.current) {
        return;
      }

      window.dispatchEvent(new Event(CLOSE_STAMP_TIPS));

      let edges: { atStart: boolean; atEnd: boolean };
      try {
        edges = spreadEdges(api);
      } catch {
        const index = api.getCurrentPageIndex();
        edges = { atStart: index <= 0, atEnd: index >= api.getPageCount() - 1 };
      }
      if (direction === "next" ? edges.atEnd : edges.atStart) {
        return;
      }

      setShowCornerHint(false);
      clearFold(api);

      const before = api.getCurrentPageIndex();
      flippingRef.current = true;

      const hardTurn = () => {
        if (direction === "next") {
          api.turnToNextPage();
        } else {
          api.turnToPrevPage();
        }
        flippingRef.current = false;
        syncPages();
      };

      try {
        if (direction === "next") {
          api.flipNext("bottom");
        } else {
          api.flipPrev("bottom");
        }
      } catch {
        hardTurn();
        return;
      }

      window.setTimeout(() => {
        const now = bookRef.current?.pageFlip();
        if (!now) {
          flippingRef.current = false;
          return;
        }
        if (now.getState() === "read" && now.getCurrentPageIndex() === before) {
          if (direction === "next") {
            now.turnToNextPage();
          } else {
            now.turnToPrevPage();
          }
          flippingRef.current = false;
          syncPages();
          return;
        }
        window.setTimeout(() => {
          flippingRef.current = false;
          syncPages();
        }, 950);
      }, 80);
    },
    [syncPages],
  );

  const goNext = useCallback(() => runFlip("next"), [runFlip]);
  const goPrev = useCallback(() => runFlip("prev"), [runFlip]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const api = bookRef.current?.pageFlip();
    if (api) {
      patchPortraitPageFlip(api);
    }
  }, [ready]);

  useEffect(() => {
    if (!ready || !showCornerHint) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let cancelled = false;
    let busy = false;
    const timers: number[] = [];

    const getApi = () => bookRef.current?.pageFlip() ?? null;

    const flatten = () => {
      const api = getApi();
      if (!api) {
        return;
      }
      const rect = api.getBoundsRect();
      if (!rect?.width || !rect.height) {
        return;
      }
      const flip = api.getFlipController();
      const render = api.getRender();
      flip.showCorner({ x: rect.left - 80, y: rect.top - 80 });
      timers.push(
        window.setTimeout(() => {
          if (cancelled) {
            return;
          }
          render.finishAnimation();
          flip.stopMove();
          render.setFlippingPage(null);
          render.setBottomPage(null);
          render.clearShadow();
          busy = false;
        }, 520),
      );
    };

    const peek = () => {
      if (cancelled || busy) {
        return;
      }
      const api = getApi();
      if (!api) {
        return;
      }
      if (api.getCurrentPageIndex() >= api.getPageCount() - 1) {
        return;
      }
      const flip = api.getFlipController();
      if (flip.getState() !== "read") {
        return;
      }
      const rect = api.getBoundsRect();
      if (!rect?.width || !rect.height) {
        return;
      }

      busy = true;
      flip.showCorner({
        x: rect.left + rect.width - 10,
        y: rect.top + rect.height - 10,
      });
      timers.push(
        window.setTimeout(() => {
          if (!cancelled) {
            flatten();
          }
        }, 900),
      );
    };

    timers.push(window.setTimeout(peek, 800));
    const interval = window.setInterval(peek, 3800);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      for (const id of timers) {
        window.clearTimeout(id);
      }
      flatten();
    };
  }, [ready, showCornerHint]);

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

  const leaves = stampPages.map((stamps, index) => (
    <FlipPage key={`stamp-${index}`}>
      <StampLeaf
        stamps={stamps}
        title={labels.pageTitle}
        pageLabel={pageLabel(index)}
        names={names}
        earn={earn}
      />
    </FlipPage>
  ));

  if ((1 + leaves.length) % 2 !== 0) {
    leaves.push(
      <FlipPage key="blank-end">
        <div className="paper flex h-full items-center justify-center p-8">
          <p className="text-sm text-muted">{labels.flipHint}</p>
        </div>
      </FlipPage>,
    );
  }

  return (
    <div ref={rootRef} className="mx-auto max-w-3xl">
      <div className="rounded-[30px] bg-[linear-gradient(145deg,#24666b,#123a3e_55%,#0c282b)] p-2 shadow-float sm:p-2.5">
        <div
          dir="ltr"
          className={cx(
            "passport-stf passport-stf--stretch relative overflow-hidden rounded-[22px] bg-[color:var(--paper)]",
            ready ? "opacity-100" : "opacity-0",
          )}
        >
          <HTMLFlipBook
            key="passport-mouse"
            ref={bookRef as never}
            width={380}
            height={510}
            size="stretch"
            minWidth={280}
            maxWidth={440}
            minHeight={350}
            maxHeight={560}
            drawShadow
            flippingTime={900}
            usePortrait
            startZIndex={2}
            autoSize
            maxShadowOpacity={0.55}
            showCover={false}
            showPageCorners
            mobileScrollSupport
            swipeDistance={30}
            clickEventForward
            useMouseEvents
            disableFlipByClick={false}
            renderOnlyPageLengthChange
            className="passport-stf-book mx-auto"
            style={{ margin: "0 auto" }}
            onInit={() => {
              const api = bookRef.current?.pageFlip();
              if (api) {
                patchPortraitPageFlip(api);
              }
              setReady(true);
              syncPages();
              window.requestAnimationFrame(() => {
                syncPages();
                const again = bookRef.current?.pageFlip();
                if (again) {
                  patchPortraitPageFlip(again);
                }
              });
            }}
            onFlip={syncPages}
            onChangeState={(event) => {
              const state = String(event.data);
              if (state === "flipping" || state === "user_fold") {
                window.dispatchEvent(new Event(CLOSE_STAMP_TIPS));
              }
              syncPages();
            }}
          >
            <FlipPage>
              <div className="h-full">{holder}</div>
            </FlipPage>
            {leaves}
          </HTMLFlipBook>
        </div>
      </div>

      <div className="mt-5 flex flex-col items-center gap-3">
        <div dir="ltr" className="flex items-center gap-2">
          <button
            type="button"
            disabled={!ready || atStart}
            aria-label={labels.previousPage}
            onClick={goPrev}
            className="grid size-10 place-items-center rounded-full border border-line bg-surface text-heading transition enabled:hover:border-brand/40 enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Icon node={ChevronLeft} size={18} />
          </button>
          <button
            type="button"
            disabled={!ready || atEnd}
            aria-label={labels.nextPage}
            onClick={goNext}
            className="grid size-10 place-items-center rounded-full border border-line bg-surface text-heading transition enabled:hover:border-brand/40 enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Icon node={ChevronRight} size={18} />
          </button>
        </div>

        <div className="flex max-w-md flex-col items-center gap-1.5 text-center">
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
    </div>
  );
}
