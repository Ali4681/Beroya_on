"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState, type ReactNode } from "react";

import { ServicesProvider } from "@/infrastructure/composition/services-context";
import { createQueryClient } from "@/infrastructure/query/query-client";

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
//this is the provider for the query client and the services provider
  return (
    <QueryClientProvider client={queryClient}>
      <ServicesProvider>
        {children}
        {process.env.NODE_ENV === "development" ? (
          <ReactQueryDevtools buttonPosition="bottom-left" initialIsOpen={false} />
        ) : null}
      </ServicesProvider>
    </QueryClientProvider>
  );
}
