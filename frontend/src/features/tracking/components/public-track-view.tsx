"use client";

import { useEffect, useState } from "react";

import type { Locale } from "@/core/i18n/config";
import { directionOf } from "@/core/i18n/config";
import { Logo } from "@/features/landing/components/logo";
import { cx } from "@/shared/lib/cx";
import { ThemeToggle } from "@/shared/theme/theme-toggle";

import { fetchPublicTrack, mapsHref } from "../api";
import { statusLabel, trackingCopy } from "../copy";
import type { TrackViewState } from "../types";

const POLL_MS = 5_000;

type Props = {
  token: string;
  lang: Locale;
  apiBase: string;
  themeLabel: string;
};

export function PublicTrackView({ token, lang, apiBase, themeLabel }: Props) {
  const copy = trackingCopy[lang];
  const [state, setState] = useState<TrackViewState>({ kind: "loading" });

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = directionOf(lang);
  }, [lang]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const controller = new AbortController();

    async function load(isPoll: boolean) {
      const next = await fetchPublicTrack(apiBase, token, controller.signal);
      if (cancelled) {
        return;
      }
      // Keep the last live snapshot on transient network errors while polling.
      if (isPoll && next.kind === "loading") {
        return;
      }
      setState(next);
      if (next.kind !== "live" && timer) {
        clearInterval(timer);
        timer = undefined;
      }
    }

    void load(false);
    timer = setInterval(() => void load(true), POLL_MS);

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [apiBase, token]);

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[radial-gradient(120%_80%_at_50%_-10%,color-mix(in_oklab,var(--brand)_28%,transparent),transparent_55%),var(--bg)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--teal)_18%,transparent),transparent)]" />
      <div className="shell relative mx-auto flex min-h-dvh max-w-lg flex-col gap-8 px-5 py-8 sm:py-12">
        <header className="flex items-center justify-between gap-4">
          <a href={`/${lang}`} className="rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">
            <Logo />
          </a>
          <ThemeToggle label={themeLabel} />
        </header>

        <section className="flex flex-1 flex-col justify-center gap-6 pb-10">
          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--accent-text)]">{copy.header}</p>
            <h1 className="text-3xl font-semibold tracking-tight text-heading sm:text-4xl">{copy.title}</h1>
          </div>

          {state.kind === "loading" ? (
            <p className="animate-pulse text-muted" role="status">
              {copy.loading}
            </p>
          ) : null}

          {state.kind === "invalid" || state.kind === "ended" ? (
            <p className="rounded-2xl border border-line bg-surface/80 px-5 py-6 text-heading shadow-[var(--shadow-card)]" role="status">
              {state.kind === "ended" ? copy.ended : copy.invalid}
            </p>
          ) : null}

          {state.kind === "live" ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-line bg-surface/90 px-5 py-5 shadow-[var(--shadow-card)]">
                <p className="text-lg font-semibold text-[var(--accent-text)]">
                  {statusLabel(copy, state.data.status)}
                </p>
                {state.data.driver_eta_sec != null ? (
                  <p className="mt-2 text-muted">
                    {copy.etaPrefix}
                    {Math.max(1, Math.round(state.data.driver_eta_sec / 60))}
                    {copy.etaUnit}
                  </p>
                ) : null}
              </div>

              {state.data.driver ? (
                <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface/90 px-5 py-5 shadow-[var(--shadow-card)]">
                  {state.data.driver.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote API host avatar
                    <img
                      src={state.data.driver.avatar_url}
                      alt=""
                      className="size-14 shrink-0 rounded-full object-cover ring-2 ring-[color-mix(in_oklab,var(--brand)_45%,transparent)]"
                    />
                  ) : (
                    <div className="grid size-14 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold text-heading">
                      {(state.data.driver.name ?? copy.driverFallback).slice(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-heading">
                      {state.data.driver.name || copy.driverFallback}
                    </p>
                    {state.data.vehicle ? (
                      <>
                        <p className="mt-0.5 truncate text-sm text-muted">
                          {[state.data.vehicle.make, state.data.vehicle.model, state.data.vehicle.color]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {state.data.vehicle.plate ? (
                          <p
                            dir="ltr"
                            className="mt-2 inline-block rounded-md border-2 border-heading px-2.5 py-0.5 text-sm font-bold tracking-wider text-heading"
                          >
                            {state.data.vehicle.plate}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-line bg-surface/90 px-5 py-5 shadow-[var(--shadow-card)]">
                {state.data.driver_location ? (
                  <div className="space-y-4">
                    <p className="font-semibold text-heading">{copy.locationLabel}</p>
                    <a
                      href={mapsHref(state.data.driver_location.lat, state.data.driver_location.lng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cx(
                        "flex h-12 w-full items-center justify-center rounded-xl bg-[var(--teal)] text-base font-semibold text-white",
                        "transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]",
                      )}
                    >
                      {copy.openInMaps}
                    </a>
                  </div>
                ) : (
                  <p className="text-muted">{copy.locationUnavailable}</p>
                )}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
