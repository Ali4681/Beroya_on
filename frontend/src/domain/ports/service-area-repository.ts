import type { ServiceArea } from "@/domain/entities/service-area";

export interface ServiceAreaRepository {
  list(signal?: AbortSignal): Promise<ServiceArea[]>;
}
