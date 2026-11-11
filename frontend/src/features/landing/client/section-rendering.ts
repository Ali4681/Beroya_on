// Landing sections are content-visibility: auto (globals.css): away from the viewport they skip
// style, layout and paint, which keeps scrolling light and lets a locale switch swap the page in
// without laying all of it out. Until a section has been close to the viewport once, its height is
// an estimate.
//
// content-visibility is never changed on a section that is in the page: Chrome (154) can crash in a
// later view transition once it has been. Sections that have to be at their real size as a page is
// swapped in are created rendered instead.

const sections = () => [...document.querySelectorAll<HTMLElement>("main > section")];

const arrivals = new Map<string, CSSStyleSheet>();

/**
 * Has the page swapped in for `locale` create the landing sections `first` to `last` (indexes)
 * rendered. Only a page whose <html> carries that lang matches, so the page in view is unaffected.
 */
export function renderOnArrival(locale: string, first: number, last: number) {
  if (!("adoptedStyleSheets" in document)) {
    return;
  }

  let sheet = arrivals.get(locale);
  if (!sheet) {
    sheet = new CSSStyleSheet();
    arrivals.set(locale, sheet);
  }
  if (!document.adoptedStyleSheets.includes(sheet)) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }

  const selectors: string[] = [];
  for (let index = Math.max(first, 0); index <= last; index++) {
    selectors.push(`html[lang="${locale}"] main > section:nth-of-type(${index + 1})`);
  }
  sheet.replaceSync(selectors.length ? `${selectors.join(", ")} { content-visibility: visible; }` : "");
}

/**
 * Where the browser does not anchor scrolling itself (Safari), a section above the viewport that
 * renders at a height other than its estimate would move what is in view, so the page is moved by
 * the difference. Returns a stop function.
 */
export function keepPlaceAsSectionsRender() {
  if (CSS.supports("overflow-anchor", "auto") || !("ResizeObserver" in window)) {
    return () => {};
  }

  const heights = new WeakMap<Element, number>();
  const observer = new ResizeObserver((entries) => {
    let shift = 0;
    for (const entry of entries) {
      const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      const before = heights.get(entry.target);
      heights.set(entry.target, height);
      if (before !== undefined && entry.target.getBoundingClientRect().bottom - (height - before) <= 0) {
        shift += height - before;
      }
    }
    if (shift) {
      window.scrollBy({ top: shift, behavior: "instant" });
    }
  });

  sections().forEach((section) => observer.observe(section));
  return () => observer.disconnect();
}
