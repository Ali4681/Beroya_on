"use client";

import { intlLocale, type Locale } from "@/core/i18n/config";
import { statusCopy } from "@/features/health/copy";
import { useBackendHealth } from "@/features/health/hooks/use-backend-health";
import { isApiError } from "@/infrastructure/http/api-error";
import { Button } from "@/shared/ui/button";

type BackendStatusCardProps = {
  locale: Locale;
  upstreamHost: string | null;
};

export function BackendStatusCard({ locale, upstreamHost }: BackendStatusCardProps) {
  const copy = statusCopy[locale];
  const health = useBackendHealth();
  const message = health.error ? (isApiError(health.error) ? health.error.message : copy.requestFailed) : null;
  const state = health.isFetching
    ? copy.states.checking
    : health.data
      ? copy.states[health.data.status]
      : message
        ? copy.states.failed
        : copy.states.idle;

  return (
    <section className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-accent">{copy.eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold text-heading">{copy.title}</h1>
          <p className="mt-2 max-w-xl text-sm leading-7 text-muted">
            {copy.lead}{" "}
            <code dir="ltr" className="text-heading">
              /api/proxy/health
            </code>
            {copy.leadEnd}
          </p>
        </div>
        <Button onClick={() => health.refetch()} disabled={health.isFetching}>
          {health.isFetching ? copy.testing : copy.test}
        </Button>
      </div>

      <dl className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-canvas px-4 py-3">
          <dt className="text-xs text-muted">{copy.target}</dt>
          <dd className="mt-1 text-sm font-medium text-heading">{upstreamHost ?? copy.targetMissing}</dd>
        </div>
        <div className="rounded-2xl bg-canvas px-4 py-3">
          <dt className="text-xs text-muted">{copy.route}</dt>
          <dd className="mt-1 text-sm font-medium text-heading">GET /health</dd>
        </div>
        <div className="rounded-2xl bg-canvas px-4 py-3">
          <dt className="text-xs text-muted">{copy.state}</dt>
          <dd className="mt-1 text-sm font-medium text-heading">{state}</dd>
        </div>
      </dl>

      {message ? <p className="mt-4 rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">{message}</p> : null}

      {health.data ? (
        <p className="mt-4 text-sm text-muted">
          {copy.lastCheck}: {new Date(health.data.checkedAt).toLocaleString(intlLocale[locale])}
          {health.data.service ? ` · ${health.data.service}` : ""}
        </p>
      ) : null}
    </section>
  );
}
