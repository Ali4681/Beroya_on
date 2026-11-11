"use client";

import { useQuery } from "@tanstack/react-query";

import { checkBackendHealth } from "@/application/use-cases/check-backend-health";
import { useServices } from "@/infrastructure/composition/services-context";
import { queryKeys } from "@/infrastructure/query/query-keys";

export function useBackendHealth() {
  const { health } = useServices();

  return useQuery({
    queryKey: queryKeys.health.status,
    queryFn: ({ signal }) => checkBackendHealth(health, signal),
    enabled: false,
    retry: false,
  });
}
