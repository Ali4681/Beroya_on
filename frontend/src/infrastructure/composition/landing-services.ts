import "server-only";

import type { ServiceAreaRepository } from "@/domain/ports/service-area-repository";
import { StaticServiceAreaRepository } from "@/infrastructure/repositories/static-service-area-repository";

export type LandingServices = {
  serviceAreas: ServiceAreaRepository;
};

export function createLandingServices(): LandingServices {
  return {
    serviceAreas: new StaticServiceAreaRepository(),
  };
}
