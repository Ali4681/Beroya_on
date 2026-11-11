import { publicEnv } from "@/core/config/public-env";
import type { AuthRepository } from "@/domain/ports/auth-repository";
import type { HealthRepository } from "@/domain/ports/health-repository";
import type { TokenStore } from "@/domain/ports/token-store";
import { browserTokenStore } from "@/infrastructure/auth/browser-token-store";
import { ApiClient } from "@/infrastructure/http/api-client";
import { HttpAuthRepository } from "@/infrastructure/repositories/http-auth-repository";
import { HttpHealthRepository } from "@/infrastructure/repositories/http-health-repository";

export type BrowserServices = {
  health: HealthRepository;
  auth: AuthRepository;
  tokens: TokenStore;
};

export function createBrowserServices(): BrowserServices {
  const http = new ApiClient({
    baseUrl: publicEnv.apiUrl,
    getAccessToken: () => browserTokenStore.getAccessToken(),
  });

  return {
    health: new HttpHealthRepository(http),
    auth: new HttpAuthRepository(http),
    tokens: browserTokenStore,
  };
}
