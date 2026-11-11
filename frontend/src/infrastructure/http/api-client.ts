import type { ZodType } from "zod";

import { ApiError } from "@/infrastructure/http/api-error";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export type ApiRequestOptions<T> = {
  method?: HttpMethod;
  query?: QueryParams;
  body?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
  auth?: boolean;
  schema?: ZodType<T>;
};

type TokenProvider = () => string | null | Promise<string | null>;

type ApiClientConfig = {
  baseUrl: string;
  timeoutMs?: number;
  getAccessToken?: TokenProvider;
};

const DEFAULT_TIMEOUT_MS = 15_000;

function resolveUrl(baseUrl: string, path: string, query?: QueryParams) {
  const base = baseUrl.replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const params = new URLSearchParams();

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        params.set(key, String(value));
      }
    }
  }

  const search = params.toString();
  return `${base}${suffix}${search ? `?${search}` : ""}`;
}

function readErrorPayload(payload: unknown, status: number) {
  if (typeof payload === "string" && payload.trim()) {
    return { message: payload, code: `HTTP_${status}`, details: payload };
  }

  if (payload && typeof payload === "object") {
    const body = payload as Record<string, unknown>;
    const message =
      (typeof body.message === "string" && body.message) ||
      (typeof body.error === "string" && body.error) ||
      (typeof body.detail === "string" && body.detail) ||
      `Request failed with status ${status}`;
    const code = typeof body.code === "string" ? body.code : `HTTP_${status}`;

    return { message, code, details: body.errors ?? body.details ?? body };
  }

  return {
    message: `Request failed with status ${status}`,
    code: `HTTP_${status}`,
  };
}

export class ApiClient {
  constructor(private readonly config: ApiClientConfig) {}

  get<T>(path: string, options?: Omit<ApiRequestOptions<T>, "method" | "body">) {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  post<T>(path: string, options?: Omit<ApiRequestOptions<T>, "method">) {
    return this.request<T>(path, { ...options, method: "POST" });
  }

  put<T>(path: string, options?: Omit<ApiRequestOptions<T>, "method">) {
    return this.request<T>(path, { ...options, method: "PUT" });
  }

  patch<T>(path: string, options?: Omit<ApiRequestOptions<T>, "method">) {
    return this.request<T>(path, { ...options, method: "PATCH" });
  }

  delete<T>(path: string, options?: Omit<ApiRequestOptions<T>, "method" | "body">) {
    return this.request<T>(path, { ...options, method: "DELETE" });
  }

  async request<T>(path: string, options: ApiRequestOptions<T> = {}): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");

    if (options.auth !== false && this.config.getAccessToken) {
      const token = await this.config.getAccessToken();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    }

    let body: string | undefined;
    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.body);
    }

    const timeoutMs = options.timeoutMs ?? this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await fetch(resolveUrl(this.config.baseUrl, path, options.query), {
        method: options.method ?? "GET",
        headers,
        body,
        signal,
        cache: "no-store",
      });

      if (response.status === 204 || response.status === 205) {
        return undefined as T;
      }

      const text = await response.text();
      const payload = text ? parseJson(text) : undefined;

      if (!response.ok) {
        const error = readErrorPayload(payload ?? text, response.status);
        throw new ApiError({
          message: error.message,
          status: response.status,
          code: error.code,
          details: error.details,
        });
      }

      if (!options.schema) {
        return payload as T;
      }

      const parsed = options.schema.safeParse(payload);
      if (!parsed.success) {
        throw new ApiError({
          message: "Backend response did not match the expected contract",
          status: response.status,
          code: "INVALID_RESPONSE",
          details: parsed.error.issues,
        });
      }

      return parsed.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError({
          message: options.signal?.aborted
            ? "Request was cancelled"
            : "Backend request timed out",
          status: 0,
          code: options.signal?.aborted ? "ABORTED" : "TIMEOUT",
        });
      }

      throw new ApiError({
        message: error instanceof Error ? error.message : "Network request failed",
        status: 0,
        code: "NETWORK_ERROR",
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

function parseJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
