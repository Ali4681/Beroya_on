"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import {
  createBrowserServices,
  type BrowserServices,
} from "@/infrastructure/composition/browser-services";

const ServicesContext = createContext<BrowserServices | null>(null);

export function ServicesProvider({ children }: { children: ReactNode }) {
  const services = useMemo(() => createBrowserServices(), []);

  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices() {
  const services = useContext(ServicesContext);

  if (!services) {
    throw new Error("useServices must be used within ServicesProvider");
  }

  return services;
}
