import "server-only";

import type { AuthRepository } from "@/domain/ports/auth-repository";
import type { HealthRepository } from "@/domain/ports/health-repository";
import { getServerEnv } from "@/core/config/server-env";
import { ApiClient } from "@/infrastructure/http/api-client";
import { HttpAuthRepository } from "@/infrastructure/repositories/http-auth-repository";
import { HttpHealthRepository } from "@/infrastructure/repositories/http-health-repository";

export type ServerServices = {
  health: HealthRepository;
  auth: AuthRepository;
};

export function createServerServices(
  getAccessToken?: () => Promise<string | null>,
): ServerServices {
  const env = getServerEnv();

  if (!env.apiUrl) {
    throw new Error("API_URL is not configured");
  }

  const http = new ApiClient({
    baseUrl: env.apiUrl,
    timeoutMs: env.timeoutMs,
    getAccessToken,
  });

  return {
    health: new HttpHealthRepository(http),
    auth: new HttpAuthRepository(http),
  };
}
