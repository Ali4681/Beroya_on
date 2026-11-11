import type { HealthStatus } from "@/domain/entities/health-status";

export interface HealthRepository {
  check(signal?: AbortSignal): Promise<HealthStatus>;
}
