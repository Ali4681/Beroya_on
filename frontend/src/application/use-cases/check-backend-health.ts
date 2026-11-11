import type { HealthRepository } from "@/domain/ports/health-repository";

export function checkBackendHealth(health: HealthRepository, signal?: AbortSignal) {
  return health.check(signal);
}
