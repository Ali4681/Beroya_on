// One motion for every section, in either direction. The curve is symmetric, so the
// way the page leaves a section is the way it arrives, whether the trip is up or down.

export const NAV_TRAVEL = "beroya:nav-travel";
export const NAV_TRAVEL_END = "beroya:nav-travel-end";

/** Highlight catch-up while the page is scrolled by hand. Same curve, shorter trip. */
export const FOLLOW_MS = 720;

export type NavTravelDetail = {
  hash: string;
  duration: number;
};

export type PillPose = {
  x: number;
  width: number;
  opacity: number;
};

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

// Symmetric ease-in-out: f(1 - t) = 1 - f(t). Halfway in time is halfway in distance.
function easeInOut(t: number) {
  const x = clamp01(t);
  return x < 0.5 ? 8 * x * x * x * x : 1 - (-2 * x + 2) ** 4 / 2;
}

/** How long a trip of `distance` pixels should take. Same for every section. */
export function travelDuration(distance: number, viewport: number) {
  const spans = distance / Math.max(viewport, 1);
  return Math.round(Math.min(1600, Math.max(1100, 980 + Math.min(spans, 4) * 150)));
}

/** Scroll position at progress `t` (0–1). Direction only changes the sign of the distance. */
export function travelPosition(origin: number, to: number, t: number) {
  return origin + (to - origin) * easeInOut(t);
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

function pillFrames(from: PillPose, to: PillPose): Keyframe[] {
  const count = 16;
  const frames: Keyframe[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const p = easeInOut(t);
    frames.push({
      offset: t,
      transform: `translate3d(${lerp(from.x, to.x, p)}px, 0, 0)`,
      width: `${lerp(from.width, to.width, p)}px`,
      opacity: lerp(from.opacity, 1, p),
    });
  }
  return frames;
}

function readPose(pill: HTMLElement): PillPose {
  const raw = getComputedStyle(pill).transform;
  const matrix = raw && raw !== "none" ? new DOMMatrix(raw) : new DOMMatrix();
  const opacity = Number.parseFloat(getComputedStyle(pill).opacity);
  return {
    x: matrix.m41,
    width: pill.offsetWidth,
    opacity: Number.isFinite(opacity) ? opacity : 1,
  };
}

function writePose(pill: HTMLElement, pose: PillPose, top: number, height: number) {
  pill.style.top = `${top}px`;
  pill.style.height = `${height}px`;
  pill.style.width = `${pose.width}px`;
  pill.style.opacity = String(pose.opacity);
  pill.style.transform = `translate3d(${pose.x}px, 0, 0)`;
}

/** Slides the highlight to the link `href` inside `list`. Returns false when the link is absent. */
export function moveNavPill(pill: HTMLElement | null, list: HTMLElement | null, href: string, duration: number) {
  if (!pill || !list) {
    return false;
  }

  const link = [...list.querySelectorAll<HTMLElement>("a[href]")].find((anchor) => anchor.getAttribute("href") === href);
  if (!link) {
    return false;
  }

  const to: PillPose = {
    x: link.offsetLeft,
    width: link.offsetWidth,
    opacity: 1,
  };

  pill.style.top = `${link.offsetTop}px`;
  pill.style.height = `${link.offsetHeight}px`;

  const from = readPose(pill);
  writePose(pill, from, link.offsetTop, link.offsetHeight);
  for (const animation of pill.getAnimations()) {
    animation.cancel();
  }

  const same = Math.abs(from.x - to.x) < 0.5 && Math.abs(from.width - to.width) < 0.5;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (duration < 40 || same || reduce) {
    writePose(pill, to, link.offsetTop, link.offsetHeight);
    return true;
  }

  const animation = pill.animate(pillFrames(from, to), { duration, easing: "linear", fill: "forwards" });
  animation.onfinish = () => {
    writePose(pill, to, link.offsetTop, link.offsetHeight);
    animation.cancel();
  };
  return true;
}
