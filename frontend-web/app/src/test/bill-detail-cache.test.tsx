import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { keys, usePutBillItems } from "@/lib/api/hooks";
import { createLiveApi } from "@/lib/api/live";
import { bffFetch, invalidateAccountRequests } from "@/lib/auth/client";
import { SessionProvider } from "@/lib/session";
import { BILLS, HOME_A, HOME_B } from "./mock-api";

vi.mock("@/lib/api", async () => {
  const { createMockApi } = await import("./mock-api");
  const api = createMockApi();
  return { getApi: () => api };
});

// ERD-BILL-02: claves por cuenta + vivienda + factura. Guardar el detalle invalida SOLO el detalle,
// la evaluación y la propia factura; otras facturas, otras viviendas y las tarifas quedan intactas.
const BILL = BILLS[2].id;
const OTHER_BILL = BILLS[1].id;
const BILL_B = BILLS[3].id;

describe("claves de detalle de factura", () => {
  it("incluyen vivienda, factura y cuenta, bajo el prefijo de la factura", () => {
    expect(keys.billItems(HOME_A, BILL, "user-1")).toEqual(["homes", HOME_A, "bills", BILL, "items", "user-1"]);
    expect(keys.billAssessment(HOME_A, BILL, "user-1")).toEqual(["homes", HOME_A, "bills", BILL, "assessment", "user-1"]);
    expect(keys.billItems(HOME_A, BILL, "user-1")).not.toEqual(keys.billItems(HOME_A, BILL, "user-2"));
    expect(keys.billItems(HOME_A, BILL, "pilot").slice(0, 4)).toEqual(keys.bill(HOME_A, BILL));
  });
});

describe("usePutBillItems", () => {
  it("invalida detalle y evaluación de esa factura, no los de otra factura ni otra vivienda", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    const watched = [
      keys.billItems(HOME_A, BILL, "pilot"), keys.billAssessment(HOME_A, BILL, "pilot"), keys.bill(HOME_A, BILL),
      keys.billItems(HOME_A, OTHER_BILL, "pilot"), keys.billAssessment(HOME_A, OTHER_BILL, "pilot"),
      keys.billItems(HOME_B, BILL_B, "pilot"), keys.tariffs("EDESUR"),
    ];
    for (const k of watched) qc.setQueryData(k, { cached: true });
    const stale = (k: readonly unknown[]) => qc.getQueryState(k)?.isInvalidated ?? false;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}><SessionProvider authEnabled={false}>{children}</SessionProvider></QueryClientProvider>
    );
    const { result } = renderHook(() => usePutBillItems(HOME_A, BILL), { wrapper });
    await act(() => result.current.mutateAsync({ items: [{ label: "Cargo", kind: "charge", amount_dop: "10.00" }] }));
    await waitFor(() => expect(stale(keys.billAssessment(HOME_A, BILL, "pilot"))).toBe(true));
    expect(stale(keys.billItems(HOME_A, BILL, "pilot"))).toBe(true);
    expect(stale(keys.bill(HOME_A, BILL))).toBe(true);
    expect(stale(keys.billItems(HOME_A, OTHER_BILL, "pilot"))).toBe(false);
    expect(stale(keys.billAssessment(HOME_A, OTHER_BILL, "pilot"))).toBe(false);
    expect(stale(keys.billItems(HOME_B, BILL_B, "pilot"))).toBe(false);
    expect(stale(keys.tariffs("EDESUR"))).toBe(false);
  });

  // Revisión R2: el BFF puede responder 502 aunque la API ya guardó; la factura debe refrescarse igual.
  it("invalida la factura también cuando el guardado termina en error", async () => {
    const { getApi } = await import("@/lib/api");
    const spy = vi.spyOn(getApi(), "putBillItems").mockRejectedValueOnce(new Error("502 ambiguo"));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    qc.setQueryData(keys.billItems(HOME_A, BILL, "pilot"), { cached: true });
    qc.setQueryData(keys.billItems(HOME_A, OTHER_BILL, "pilot"), { cached: true });
    const stale = (k: readonly unknown[]) => qc.getQueryState(k)?.isInvalidated ?? false;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}><SessionProvider authEnabled={false}>{children}</SessionProvider></QueryClientProvider>
    );
    const { result } = renderHook(() => usePutBillItems(HOME_A, BILL), { wrapper });
    await act(async () => { await expect(result.current.mutateAsync({ items: [] })).rejects.toThrow(); });
    await waitFor(() => expect(stale(keys.billItems(HOME_A, BILL, "pilot"))).toBe(true));
    expect(stale(keys.billItems(HOME_A, OTHER_BILL, "pilot"))).toBe(false);
    spy.mockRestore();
  });
});

describe("respuestas tardías tras cambiar de cuenta (transporte BFF real)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const detail = { home_id: HOME_A, bill_id: BILL, items: [], items_total_dop: null, bill_amount_dop: "5600.00", difference_dop: null };

  it.each([
    ["getBillItems", (api: ReturnType<typeof createLiveApi>) => api.getBillItems(HOME_A, BILL), detail],
    ["putBillItems", (api: ReturnType<typeof createLiveApi>) => api.putBillItems(HOME_A, BILL, { items: [] }), detail],
  ] as const)("%s se descarta con account_changed", async (_label, call, body) => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(r => { resolve = r; })));
    const pending = call(createLiveApi("", bffFetch));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    invalidateAccountRequests();
    resolve(new Response(JSON.stringify(body), { status: 200 }));
    await expect(pending).rejects.toMatchObject({ code: "account_changed" });
  });
});
