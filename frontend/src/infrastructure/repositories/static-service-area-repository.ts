import type { ServiceArea } from "@/domain/entities/service-area";
import type { ServiceAreaRepository } from "@/domain/ports/service-area-repository";

// Placeholder until the backend exposes service areas. Only mark a city as
// "active" once the launch is officially confirmed.
const areas: ServiceArea[] = [
  {
    id: "aleppo",
    name: { ar: "حلب", en: "Aleppo" },
    status: "coming_soon",
    coordinates: { lat: 36.2021, lng: 37.1343 },
  },
  {
    id: "damascus",
    name: { ar: "دمشق", en: "Damascus" },
    status: "coming_soon",
    coordinates: { lat: 33.5138, lng: 36.2765 },
  },
];

export class StaticServiceAreaRepository implements ServiceAreaRepository {
  async list(): Promise<ServiceArea[]> {
    return areas;
  }
}
