import { renderOnArrival } from "./section-rendering";

// The other locale lays out to different heights, so a raw scrollY would land somewhere else.
// The reader's place is kept as the landing section under the reading line and how far into it.
type ReadingPosition = { section: number; progress: number } | { ratio: number };

let kept: ReadingPosition | null = null;
let incoming = "";

const sections = () => document.querySelectorAll<HTMLElement>("main > section");
const readingLine = () => window.innerHeight * 0.3;
const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;

function read(): ReadingPosition {
  const max = maxScroll();
  const y = window.scrollY;

  if (y > 0 && y < max - 1) {
    const line = readingLine();
    const list = sections();
    for (let index = 0; index < list.length; index++) {
      const { top, height } = list[index].getBoundingClientRect();
      if (top <= line && top + height > line) {
        return { section: index, progress: (line - top) / height };
      }
    }
  }

  return { ratio: max > 0 ? y / max : 0 };
}

function keep() {
  kept = read();

  // The incoming page has its sections at estimated heights, apart from the ones it is created
  // with rendered: those in view here and one either side, so the place is measured at real size.
  const list = sections();
  let first = -1;
  let last = list.length - 1;
  for (let index = 0; index < list.length; index++) {
    const { top, bottom } = list[index].getBoundingClientRect();
    if (bottom > 0 && top < window.innerHeight) {
      if (first < 0) {
        first = index;
      }
      last = index;
    } else if (first >= 0) {
      break;
    }
  }
  renderOnArrival(incoming, (first < 0 ? last : first) - 1, last + 1);
}

/** Records the reader's place for the page in `locale`, following any scrolling until it takes over. */
export function keepReadingPosition(locale: string) {
  incoming = locale;
  keep();
  window.addEventListener("scroll", keep, { passive: true });
}

// The part of the Navigation API used below; TypeScript's DOM types do not include it yet.
type NavigateEvent = Event & {
  readonly navigationType: NavigationType;
  readonly canIntercept: boolean;
  readonly destination: { readonly url: string };
  intercept(options?: { scroll?: "after-transition" | "manual"; focusReset?: "after-transition" | "manual" }): void;
};

/** Back/forward to the other locale swaps the page in place as well, so it keeps the place too. */
export function keepReadingPositionAcrossHistory() {
  const navigation = (window as Window & { navigation?: EventTarget }).navigation;
  if (!navigation) {
    return;
  }

  const onNavigate = (event: Event) => {
    const traversal = event as NavigateEvent;
    const locale = new URL(traversal.destination.url).pathname.split("/")[1];
    if (traversal.navigationType !== "traverse" || !traversal.canIntercept || locale === document.documentElement.lang) {
      return;
    }
    keepReadingPosition(locale);
    // The page comes back with its far sections not rendered yet (content-visibility), so the
    // offset the browser saved for the entry would land somewhere else.
    traversal.intercept({ scroll: "manual", focusReset: "manual" });
  };

  navigation.addEventListener("navigate", onNavigate);
  return () => navigation.removeEventListener("navigate", onNavigate);
}

function offsetOf(position: ReadingPosition) {
  if ("ratio" in position) {
    return position.ratio * maxScroll();
  }
  const rect = sections()[position.section]?.getBoundingClientRect();
  return rect ? window.scrollY + rect.top + rect.height * position.progress - readingLine() : window.scrollY;
}

/** Moves a freshly swapped-in page to the place the previous one recorded, if any. */
export function restoreReadingPosition() {
  window.removeEventListener("scroll", keep);
  const position = kept;
  kept = null;

  if (position) {
    window.scrollTo({ top: offsetOf(position), behavior: "instant" });
  }
}
