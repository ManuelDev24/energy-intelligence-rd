import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { SessionProvider } from "@/lib/session";

// Renderiza una página con los mismos providers que la app y una vivienda "logueada".
export function renderWithApp(ui: ReactElement, homeId: string) {
  window.localStorage.setItem("energyrd.homeId", homeId);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionProvider>{ui}</SessionProvider>
    </QueryClientProvider>,
  );
}

export interface MetricLike {
  value: string;
  unit: string;
  quality: string;
}

// Recorre un payload y devuelve todas las métricas {value, unit, quality}.
export function collectMetrics(node: unknown, out: MetricLike[] = []): MetricLike[] {
  if (Array.isArray(node)) {
    node.forEach((n) => collectMetrics(n, out));
  } else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o.value === "string" && typeof o.unit === "string" && typeof o.quality === "string") {
      out.push({ value: o.value, unit: o.unit, quality: o.quality });
    } else {
      Object.values(o).forEach((n) => collectMetrics(n, out));
    }
  }
  return out;
}
