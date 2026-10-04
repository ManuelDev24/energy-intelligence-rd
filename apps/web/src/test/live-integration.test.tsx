import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import BillsPage from "@/app/(app)/bills/page";
import DashboardPage from "@/app/(app)/dashboard/page";
import { createLiveApi } from "@/lib/api/live";
import { formatDop, formatNumber } from "@/lib/format";
import { expectDashboardRendered, type RawBillLike, type RawDashboardLike } from "./assertions";
import { collectMetrics, renderWithApp } from "./render";

// PRUEBA DE INTEGRACIÓN CONTRA LA API REAL. Se omite si no hay LIVE_API_URL.
//   LIVE_API_URL=http://localhost:8000 npm test --workspace apps/web
// Criterio de aceptación: para cada vivienda, la web muestra los mismos kWh, RD$,
// proyección y etiquetas de calidad que devuelve la API.

// El dashboard (features/energy) lee la URL de la API desde env: debe fijarse antes
// de que se importe ese módulo.
vi.hoisted(() => {
  if (process.env.LIVE_API_URL) process.env.NEXT_PUBLIC_API_URL = process.env.LIVE_API_URL;
});

const API_URL = process.env.LIVE_API_URL;
const ROOT = `${(API_URL ?? "http://localhost:8000").replace(/\/+$/, "")}/api/v1`;

vi.mock("@/lib/api", async () => {
  const { createLiveApi: create } = await import("@/lib/api/live");
  const api = create(process.env.LIVE_API_URL ?? "http://localhost:8000");
  return { getApi: () => api };
});

const nativeFetch = globalThis.fetch;

async function raw<T>(path: string): Promise<T> {
  const res = await fetch(`${ROOT}${path}`);
  expect(res.ok, `${path} → ${res.status}`).toBe(true);
  return (await res.json()) as T;
}

interface RawHome {
  id: string;
  code: string | null;
  name: string;
}
interface RawBill extends RawBillLike {
  id: string;
}
interface RawDashboard extends RawDashboardLike {
  latest_bill: { bill_id: string; kwh: { value: string }; amount_dop: { value: string } } | null;
  quality_legend: Record<string, string>;
}

// Varias viviendas renderizadas en jsdom contra una API real tardan más que los 5 s por defecto.
describe.skipIf(!API_URL)("web ↔ API real", { timeout: 60_000 }, () => {
  beforeAll(() => {
    // Solo en tests: TanStack Query pasa a fetch el AbortSignal de jsdom y el fetch nativo
    // de Node lo rechaza ("Expected signal to be an instance of AbortSignal"). En el
    // navegador no ocurre. Se omite la señal para que la página pueda hablar con la API.
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      nativeFetch(input, init ? { ...init, signal: undefined } : init),
    );
  });
  afterAll(() => vi.unstubAllGlobals());
  beforeEach(() => window.localStorage.clear());

  it("hay viviendas en la API (¿corrió el seed?)", async () => {
    const homes = await raw<RawHome[]>("/homes");
    expect(homes.length).toBeGreaterThan(0);
  });

  it("el cliente tipado no altera ningún valor: los parseados son idénticos a los crudos", async () => {
    const api = createLiveApi(API_URL!);
    for (const home of await raw<RawHome[]>("/homes")) {
      const rawBills = await raw<RawBill[]>(`/homes/${home.id}/bills`);
      const bills = await api.listBills(home.id);
      expect(bills.map((b) => [b.id, b.kwh, b.amount_dop])).toEqual(
        rawBills.map((b) => [b.id, b.kwh, b.amount_dop]),
      );

      const rawDash = await raw<RawDashboard>(`/homes/${home.id}/dashboard`);
      const dash = await api.getDashboard(home.id);
      expect(collectMetrics(dash)).toEqual(collectMetrics(rawDash));
      expect(dash.quality_legend).toEqual(rawDash.quality_legend);
    }
  });

  it("la última factura del dashboard coincide con la factura más reciente de /bills", async () => {
    for (const home of await raw<RawHome[]>("/homes")) {
      const bills = await raw<RawBill[]>(`/homes/${home.id}/bills`);
      const dash = await raw<RawDashboard>(`/homes/${home.id}/dashboard`);
      if (bills.length === 0) {
        expect(dash.latest_bill).toBeNull();
        continue;
      }
      const latest = [...bills].sort((a, b) => b.period_end.localeCompare(a.period_end))[0];
      expect(dash.latest_bill?.bill_id).toBe(latest.id);
      expect(dash.latest_bill?.kwh.value).toBe(latest.kwh);
      expect(dash.latest_bill?.amount_dop.value).toBe(latest.amount_dop);
    }
  });

  it("el dashboard renderizado muestra lo mismo que la API, vivienda por vivienda", async () => {
    for (const home of await raw<RawHome[]>("/homes")) {
      const rawBills = await raw<RawBill[]>(`/homes/${home.id}/bills`);
      const rawDash = await raw<RawDashboard>(`/homes/${home.id}/dashboard`);
      const { unmount } = renderWithApp(<DashboardPage />, home.id);

      const select = await screen.findByLabelText("Vivienda");
      await waitFor(() => expect(select).toBeEnabled(), { timeout: 5000 });
      fireEvent.change(select, { target: { value: home.id } });
      await waitFor(
        () => expect(screen.queryByText("Cargando dashboard energético…")).not.toBeInTheDocument(),
        { timeout: 5000 },
      );

      if (rawBills.length === 0) {
        expect(screen.getByText(/No hay facturas para esta vivienda/)).toBeInTheDocument();
      } else {
        expectDashboardRendered(rawDash, rawBills);
      }
      unmount();
    }
  });

  it("la lista de facturas renderizada muestra los kWh y RD$ exactos de la API", async () => {
    for (const home of await raw<RawHome[]>("/homes")) {
      const rawBills = await raw<RawBill[]>(`/homes/${home.id}/bills`);
      const { unmount } = renderWithApp(<BillsPage />, home.id);

      if (rawBills.length === 0) {
        await waitFor(() => expect(screen.getByText(/Aún no hay facturas/)).toBeInTheDocument());
      } else {
        await waitFor(() =>
          expect(screen.getAllByRole("link", { name: /kWh/ })).toHaveLength(rawBills.length),
        );
        const links = screen.getAllByRole("link", { name: /kWh/ }).map((l) => l.textContent ?? "");
        for (const b of rawBills) {
          const expected = `${formatNumber(b.kwh)} kWh · ${formatDop(b.amount_dop)}`;
          expect(links.some((t) => t.includes(expected)), expected).toBe(true);
        }
      }
      unmount();
    }
  });
});
