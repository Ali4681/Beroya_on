import type { ServiceArea, ServiceAreaStatus } from "@/domain/entities/service-area";
import type { ServiceAreaRepository } from "@/domain/ports/service-area-repository";

const statusOrder: Record<ServiceAreaStatus, number> = { active: 0, coming_soon: 1 };

export async function listServiceAreas(
  areas: ServiceAreaRepository,
  signal?: AbortSignal,
): Promise<ServiceArea[]> {
  const list = await areas.list(signal);

  return [...list].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
}
