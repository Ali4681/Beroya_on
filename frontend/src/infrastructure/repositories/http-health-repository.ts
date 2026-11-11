import type { HealthStatus } from "@/domain/entities/health-status";
import type { HealthRepository } from "@/domain/ports/health-repository";
import type { ApiClient } from "@/infrastructure/http/api-client";
import { endpoints } from "@/infrastructure/http/endpoints";
import { healthResponseSchema } from "@/infrastructure/http/schemas";

function mapStatus(value?: string): HealthStatus["status"] {
  const normalized = value?.toLowerCase();

  if (!normalized || normalized === "ok" || normalized === "up" || normalized === "healthy") {
    return "ok";
  }

  if (normalized === "degraded") {
    return "degraded";
  }

  return "unknown";
}

export class HttpHealthRepository implements HealthRepository {
  constructor(private readonly http: ApiClient) {}

  async check(signal?: AbortSignal): Promise<HealthStatus> {
    const payload = await this.http.get<unknown>(endpoints.health, {
      auth: false,
      signal,
    });
    const parsed = healthResponseSchema.safeParse(
      payload && typeof payload === "object" ? payload : {},
    );
    const body = parsed.success ? parsed.data : {};

    return {
      status: mapStatus(body.status),
      service: body.service,
      checkedAt: body.timestamp ?? new Date().toISOString(),
    };
  }
}
