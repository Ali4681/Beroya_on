import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  apiUrl: z.url().optional(),
  timeoutMs: z.number().int().positive(),
});

export function getServerEnv() {
  const apiUrl = process.env.API_URL?.trim();
  const timeout = Number(process.env.API_TIMEOUT_MS || 15_000);

  return serverEnvSchema.parse({
    apiUrl: apiUrl || undefined,
    timeoutMs: Number.isFinite(timeout) ? timeout : 15_000,
  });
}

export type ServerEnv = z.infer<typeof serverEnvSchema>;
