import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { keys, useCreateBill, useCreateReading, useDeleteReading, usePutGoal } from "@/lib/api/hooks";
import { HOME_A, HOME_B, READINGS } from "./mock-api";

vi.mock("@/lib/api", async () => {
  const { createMockApi } = await import("./mock-api");
  const api = createMockApi();
  return { getApi: () => api };
});

// Las claves de fase 2 cuelgan de ["homes", homeId]: escribir una lectura, una factura o la meta
// deja viejos el consumo y el progreso de ESA vivienda (la API los recalcula), no los de otras.
const RANGE = { granularity: "day" as const, from: "2026-09-05", to: "2026-10-04" };
function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
  const watched = [
    keys.readings(HOME_A), keys.consumption(HOME_A, RANGE), keys.goal(HOME_A), keys.goalProgress(HOME_A), keys.dashboard(HOME_A),
    keys.consumption(HOME_B, RANGE), keys.goalProgress(HOME_B), keys.tariffs("EDESUR"),
  ];
  for (const k of watched) qc.setQueryData(k, { cached: true });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const stale = (k: readonly unknown[]) => qc.getQueryState(k)?.isInvalidated ?? false;
  return { wrapper, stale };
}

describe("invalidación de caché de fase 2", () => {
  it("las claves son por vivienda y por rango", () => {
    expect(keys.consumption(HOME_A, RANGE)).toEqual(["homes", HOME_A, "consumption", "day", "2026-09-05", "2026-10-04"]);
    expect(keys.goalProgress(HOME_A).slice(0, 2)).toEqual(["homes", HOME_A]);
  });

  it("crear lectura invalida lecturas, consumo y progreso de la vivienda, no los de otra ni las tarifas", async () => {
    const { wrapper, stale } = setup();
    const { result } = renderHook(() => useCreateReading(HOME_A), { wrapper });
    await act(() => result.current.mutateAsync({ read_at: "2026-10-04T08:00:00-04:00", reading_kwh: "1150" }));
    await waitFor(() => expect(stale(keys.consumption(HOME_A, RANGE))).toBe(true));
    expect(stale(keys.readings(HOME_A))).toBe(true);
    expect(stale(keys.goalProgress(HOME_A))).toBe(true);
    expect(stale(keys.consumption(HOME_B, RANGE))).toBe(false);
    expect(stale(keys.goalProgress(HOME_B))).toBe(false);
    expect(stale(keys.tariffs("EDESUR"))).toBe(false);
  });

  it("borrar lectura invalida consumo y progreso", async () => {
    const { wrapper, stale } = setup();
    const { result } = renderHook(() => useDeleteReading(HOME_A), { wrapper });
    await act(() => result.current.mutateAsync(READINGS[0].id));
    await waitFor(() => expect(stale(keys.goalProgress(HOME_A))).toBe(true));
    expect(stale(keys.consumption(HOME_A, RANGE))).toBe(true);
  });

  it("guardar la meta invalida meta y progreso; una factura nueva también refresca el progreso", async () => {
    const { wrapper, stale } = setup();
    const goal = renderHook(() => usePutGoal(HOME_A), { wrapper });
    await act(() => goal.result.current.mutateAsync({ monthly_kwh: "300", monthly_amount_rd: null }));
    await waitFor(() => expect(stale(keys.goal(HOME_A))).toBe(true));
    expect(stale(keys.goalProgress(HOME_A))).toBe(true);
    expect(stale(keys.goalProgress(HOME_B))).toBe(false);

    const second = setup();
    const bill = renderHook(() => useCreateBill(HOME_A), { wrapper: second.wrapper });
    await act(() => bill.result.current.mutateAsync({ period_start: "2026-09-01", period_end: "2026-09-30", kwh: "300", amount_dop: "4000", days: 30, reading_previous: null, reading_current: null }));
    await waitFor(() => expect(second.stale(keys.goalProgress(HOME_A))).toBe(true));
  });
});
