import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { keys, useCreateBill, useDeleteBill, useSetAlertStatus } from "@/lib/api/hooks";
import { ALERT_A, BILLS, HOME_A, HOME_B } from "./mock-api";

vi.mock("@/lib/api", async () => {
  const { createMockApi } = await import("./mock-api");
  const api = createMockApi();
  return { getApi: () => api };
});

// Regresión (auditoría W1): guardar una factura debe invalidar el dashboard, las alertas y el
// estimado de ESA vivienda (la API los recalcula). Antes solo se invalidaba la lista de facturas
// y el dashboard quedaba viejo hasta 60 s.
function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
  for (const k of [keys.dashboard(HOME_A), keys.alerts(HOME_A), keys.estimate(HOME_A), keys.dashboard(HOME_B)]) {
    qc.setQueryData(k, { cached: true });
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const stale = (k: readonly unknown[]) => qc.getQueryState(k)?.isInvalidated ?? false;
  return { qc, wrapper, stale };
}

describe("invalidación de caché tras escribir", () => {
  it("crear factura invalida dashboard, alertas y estimado de la vivienda, no de otras", async () => {
    const { wrapper, stale } = setup();
    const { result } = renderHook(() => useCreateBill(HOME_A), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        period_start: "2026-09-01",
        period_end: "2026-09-30",
        kwh: "300",
        amount_dop: "4000",
        days: 30,
        reading_previous: null,
        reading_current: null,
      }),
    );
    await waitFor(() => expect(stale(keys.dashboard(HOME_A))).toBe(true));
    expect(stale(keys.alerts(HOME_A))).toBe(true);
    expect(stale(keys.estimate(HOME_A))).toBe(true);
    expect(stale(keys.dashboard(HOME_B))).toBe(false);
  });

  it("borrar factura y cambiar estado de alerta también refrescan el dashboard", async () => {
    const { wrapper, stale, qc } = setup();
    const del = renderHook(() => useDeleteBill(HOME_A), { wrapper });
    await act(() => del.result.current.mutateAsync(BILLS[0].id));
    await waitFor(() => expect(stale(keys.dashboard(HOME_A))).toBe(true));

    qc.setQueryData(keys.dashboard(HOME_A), { cached: true });
    const setStatus = renderHook(() => useSetAlertStatus(HOME_A), { wrapper });
    await act(() => setStatus.result.current.mutateAsync({ id: ALERT_A.id, status: "dismissed" }));
    await waitFor(() => expect(stale(keys.alerts(HOME_A))).toBe(true));
  });
});
