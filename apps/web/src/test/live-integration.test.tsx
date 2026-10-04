import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BillsPage from "@/app/(app)/bills/page";
import DashboardPage from "@/app/(app)/dashboard/page";
import { createLiveApi } from "@/lib/api/live";
import { formatDop, formatNumber } from "@/lib/format";
import { expectDashboardRendered } from "./assertions";
import { collectMetrics, renderWithApp } from "./render";

// PRUEBA DE INTEGRACIÓN CONTRA LA API REAL. Se omite si no hay LIVE_API_URL.
//   LIVE_API_URL=http://localhost:8000 npm test --workspace apps/web
// Criterio de aceptación: para cada vivienda, la web muestra exactamente los mismos
// kWh, RD$, proyección y etiquetas de calidad que devuelve la API.

const API_URL = process.env.LIVE_API_URL;
const ROOT = `${(API_URL ?? "http://localhost:8000").replace(/\/+$/, "")}/api/v1`;

vi.mock("@/lib/api", async () => {
  const { createLiveApi: create } = await import("@/lib/api/live");
  const api = create(process.env.LIVE_API_URL ?? "http://localhost:8000");
  return { getApi: () => api };
});

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
interface RawBill {
  id: string;
  period_end: string;
  kwh: string;
  amount_dop: string;
}
interface RawDashboard {
  latest_bill: { bill_id: string; kwh: { value: string }; amount_dop: { value: string } } | null;
  projection: { note: string } | null;
  alert: { message: string } | null;
  recommendation: string | null;
  quality_legend: Record<string, string>;
}

describe.skipIf(!API_URL)("web ↔ API real", () => {
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
      const rawDash = await raw<RawDashboard>(`/homes/${home.id}/dashboard`);
      const { unmount } = renderWithApp(<DashboardPage />, home.id);

      await waitFor(() => expect(screen.getByText("Estado de los datos")).toBeInTheDocument());
      expectDashboardRendered(rawDash);
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
