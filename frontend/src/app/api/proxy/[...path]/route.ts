import { NextRequest, NextResponse } from "next/server";

import { getServerEnv } from "@/core/config/server-env";

const SKIPPED_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "accept-encoding",
]);

const SKIPPED_RESPONSE_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "transfer-encoding",
]);

type ProxyContext = {
  params: Promise<{ path: string[] }>;
};

async function proxy(request: NextRequest, context: ProxyContext) {
  const env = getServerEnv();

  if (!env.apiUrl) {
    return NextResponse.json(
      {
        message: "API_URL is not configured",
        code: "API_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  const { path } = await context.params;
  const target = `${env.apiUrl.replace(/\/$/, "")}/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
  const headers = new Headers();

  request.headers.forEach((value, key) => {
    if (!SKIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), env.timeoutMs);

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
      signal: timeoutController.signal,
    });
    const responseHeaders = new Headers();

    upstream.headers.forEach((value, key) => {
      if (!SKIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      {
        message: "Could not reach the backend",
        code: "UPSTREAM_UNAVAILABLE",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}

export const dynamic = "force-dynamic";

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
