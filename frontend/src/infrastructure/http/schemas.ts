import { z, type ZodType } from "zod";

import type { AuthSession } from "@/domain/entities/auth-session";
import type { User } from "@/domain/entities/user";

function unwrapData(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    return payload;
  }

  const data = payload.data;
  return data && typeof data === "object" ? data : payload;
}

const userObjectSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    email: z.string(),
    name: z.string().optional(),
    full_name: z.string().optional(),
    fullName: z.string().optional(),
  })
  .transform((value) => ({
    id: String(value.id),
    email: value.email,
    name: value.name ?? value.fullName ?? value.full_name ?? value.email,
  }));

const sessionObjectSchema = z
  .object({
    accessToken: z.string().optional(),
    access_token: z.string().optional(),
    token: z.string().optional(),
    refreshToken: z.string().optional(),
    refresh_token: z.string().optional(),
    user: userObjectSchema,
  })
  .transform((value) => {
    const accessToken = value.accessToken ?? value.access_token ?? value.token;

    if (!accessToken) {
      throw new Error("Login response is missing an access token");
    }

    return {
      accessToken,
      refreshToken: value.refreshToken ?? value.refresh_token,
      user: value.user,
    };
  });

export const userSchema: ZodType<User> = z.preprocess(unwrapData, userObjectSchema);

export const sessionSchema: ZodType<AuthSession> = z.preprocess(unwrapData, sessionObjectSchema);

export const healthResponseSchema = z.object({
  status: z.string().optional(),
  service: z.string().optional(),
  timestamp: z.string().optional(),
});
