"use client";

import { retryPolicy } from "@energyrd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Relee datos tras volver la red aunque aún no haya vencido staleTime.
          queries: { retry: retryPolicy, staleTime: 60_000, refetchOnWindowFocus: false, refetchOnReconnect: "always" },
          // Una escritura que falla sin red no queda pausada para reenviarse automáticamente al reconectar.
          mutations: { retry: false, networkMode: "always" },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
