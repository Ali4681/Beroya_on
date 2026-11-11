import { bilingualName, listJoin } from "@/features/desk/i18n/t";
import { staffFieldMessage, staffMessage } from "@/features/desk/messages";
import { isStaffRole, readSession, writeSession, type StaffUser } from "@/features/desk/session";

const BASE = "/api/proxy/api/v1/go";

export class GoApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly fields: Record<string, string>;
  /** Raw error body (e.g. `minimum`, `available`, `reasons`) for screens that explain the refusal. */
  readonly details: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    requestId?: string,
    detail?: string,
    fields: Record<string, string> = {},
    details: Record<string, unknown> = {},
  ) {
    super(staffMessage(code, detail));
    this.name = "GoApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.fields = fields;
    this.details = details;
  }
}

export type GoQuery = Record<string, string | number | boolean | null | undefined>;

type GoOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: GoQuery;
  body?: unknown;
  auth?: boolean;
  idempotent?: boolean;
  /** Fixed key, so retrying the same money operation can never apply it twice. */
  idempotencyKey?: string;
};

type TokenPair = {
  access_token: string;
  refresh_token: string;
  user: StaffUser;
};

let refreshTask: Promise<string | null> | null = null;

function search(query?: GoQuery) {
  const params = new URLSearchParams();
  if (!query) return "";
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

async function parseBody(response: Response) {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function validationErrors(body: Record<string, unknown>) {
  const fields: Record<string, string> = {};
  let detail: string | undefined;
  if (!Array.isArray(body.errors)) return { fields, detail };
  for (const item of body.errors) {
    if (!item || typeof item !== "object") continue;
    const messages = (item as { messages?: unknown }).messages;
    if (!Array.isArray(messages)) continue;
    const text = messages.find((message) => typeof message === "string" && message);
    if (typeof text !== "string") continue;
    detail ??= text;
    const field = (item as { field?: unknown }).field;
    if (typeof field === "string" && field) fields[field] = staffFieldMessage(text);
  }
  return { fields, detail };
}

function errorFrom(status: number, payload: unknown) {
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const code = typeof body.code === "string" ? body.code : `HTTP_${status}`;
  const requestId = typeof body.request_id === "string" ? body.request_id : undefined;
  const parsed = validationErrors(body);
  const detail = parsed.detail ?? (typeof body.message === "string" ? body.message : undefined);
  return new GoApiError(status, code, requestId, detail, parsed.fields, body);
}

async function raw<T>(path: string, options: GoOptions, accessToken?: string | null): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  if (options.auth !== false && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
  else if (options.idempotent) headers.set("Idempotency-Key", crypto.randomUUID());

  const response = await fetch(`${BASE}${path}${search(options.query)}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  const payload = await parseBody(response);
  if (!response.ok) throw errorFrom(response.status, payload);
  return payload as T;
}

async function refreshAccess() {
  const session = readSession();
  if (!session) return null;
  const data = await raw<TokenPair>(
    "/auth/refresh",
    { method: "POST", auth: false, idempotent: true, body: { refresh_token: session.refreshToken } },
  );
  if (!isStaffRole(data.user.role)) throw new GoApiError(403, "ROLE_NOT_ALLOWED");
  writeSession({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    user: data.user,
  });
  return data.access_token;
}

/** One refresh at a time, shared by HTTP retries and the live socket. */
export function refreshStaffSession() {
  refreshTask ??= refreshAccess().finally(() => {
    refreshTask = null;
  });
  return refreshTask;
}

export async function go<T>(path: string, options: GoOptions = {}): Promise<T> {
  const session = readSession();
  try {
    return await raw<T>(path, options, session?.accessToken);
  } catch (error) {
    const canRefresh =
      error instanceof GoApiError &&
      error.status === 401 &&
      options.auth !== false &&
      path !== "/auth/refresh" &&
      path !== "/auth/staff/login";
    if (!canRefresh) throw error;
    const token = await refreshStaffSession();
    if (!token) throw error;
    return raw<T>(path, options, token);
  }
}

export function asRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  for (const key of ["data", "items", "results"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return [];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function textOf(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return listJoin(value.map(textOf));
  if (isRecord(value)) {
    return bilingualName(value) ?? textOf(value.full_name ?? value.public_number ?? value.code ?? value.id);
  }
  return String(value);
}
