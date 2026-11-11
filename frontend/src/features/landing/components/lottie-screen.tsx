"use client";

import { useEffect, useRef, useState } from "react";

import { cx } from "@/shared/lib/cx";

type LottieScreenProps = {
  src: string;
  className?: string;
  loop?: boolean;
};

const cache = new Map<string, object>();

/** Full-bleed Lottie for phone mockups (Figma exports at ~393×852). Loads when near viewport. */
export function LottieScreen({ src, className, loop = true }: LottieScreenProps) {
  const host = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const node = host.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setActive(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!active) return;
    let destroyed = false;
    let anim: { destroy: () => void } | undefined;
    const container = host.current;
    if (!container) return;
    setFailed(false);

    void (async () => {
      try {
        const mod = await import("lottie-web");
        let animationData = cache.get(src);
        if (!animationData) {
          const response = await fetch(src);
          if (!response.ok) throw new Error(`Lottie ${response.status}`);
          animationData = (await response.json()) as object;
          cache.set(src, animationData);
        }
        if (destroyed || !host.current) return;
        host.current.replaceChildren();
        // Playback only — no interactivity / scroll-driven APIs (touch stays on the carousel track).
        anim = mod.default.loadAnimation({
          container: host.current,
          renderer: "svg",
          loop,
          autoplay: true,
          animationData,
        });
      } catch {
        if (!destroyed) setFailed(true);
      }
    })();

    return () => {
      destroyed = true;
      anim?.destroy();
    };
  }, [active, src, loop]);

  if (failed) {
    return (
      <div
        className={cx("pointer-events-none absolute inset-0 bg-canvas [touch-action:auto]", className)}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      ref={host}
      className={cx(
        "pointer-events-none absolute inset-0 overflow-hidden bg-canvas [touch-action:auto]",
        "[&_svg]:pointer-events-none [&_svg]:h-full [&_svg]:w-full [&_svg]:[touch-action:auto]",
        className,
      )}
      aria-hidden="true"
    />
  );
}
