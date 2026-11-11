"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";

import type { Dictionary } from "@/core/i18n/dictionaries";

import { PassportTouchStrip } from "./passport-book";

type BookProps = {
  holder: ReactNode;
  names: Dictionary["stampNames"];
  earn: Dictionary["stampEarn"];
  labels: {
    pageTitle: string;
    flipHint: string;
    stampTapHint: string;
    previousPage: string;
    nextPage: string;
    pageOf: string;
  };
};

function PassportSkeleton() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-[30px] bg-[linear-gradient(145deg,#24666b,#123a3e_55%,#0c282b)] p-2 shadow-float sm:p-2.5">
        <div className="paper min-h-[22rem] animate-pulse rounded-[22px]" />
      </div>
    </div>
  );
}

/** Desktop-only dynamic import — react-pageflip / StPageFlip never loads on touch. */
const PassportFlipBook = dynamic(
  () => import("./passport-flip-book").then((mod) => mod.PassportFlipBook),
  { ssr: false, loading: () => <PassportSkeleton /> },
);

const TOUCH_MQ = "(hover: none), (pointer: coarse)";
const DESKTOP_MQ = "(hover: hover) and (pointer: fine)";

function usePassportMode(): "pending" | "touch" | "desktop" {
  const [mode, setMode] = useState<"pending" | "touch" | "desktop">("pending");

  useEffect(() => {
    const sync = () => {
      const touch = window.matchMedia(TOUCH_MQ).matches;
      const desktop = window.matchMedia(DESKTOP_MQ).matches;
      // Prefer touch strip whenever coarse/no-hover — never mount StPageFlip there.
      setMode(touch || !desktop ? "touch" : "desktop");
    };
    sync();
    const touchMq = window.matchMedia(TOUCH_MQ);
    const deskMq = window.matchMedia(DESKTOP_MQ);
    touchMq.addEventListener("change", sync);
    deskMq.addEventListener("change", sync);
    return () => {
      touchMq.removeEventListener("change", sync);
      deskMq.removeEventListener("change", sync);
    };
  }, []);

  return mode;
}

export function PassportBookClient(props: BookProps) {
  const mode = usePassportMode();

  if (mode === "pending") {
    return <PassportSkeleton />;
  }
  if (mode === "touch") {
    return <PassportTouchStrip {...props} />;
  }
  return <PassportFlipBook {...props} />;
}
