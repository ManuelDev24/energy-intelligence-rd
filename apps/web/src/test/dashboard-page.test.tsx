import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/(app)/dashboard/page";
import { expectDashboardRendered } from "./assertions";
import { BILLS, DASHBOARD_A, HOME_A, createMockApi } from "./mock-api";
import { renderWithApp } from "./render";

// La página del dashboard (features/energy) usa fetch directo contra la API: se
// simula la API con las fixtures de test.
async function stubApiFetch() {
  const homes = await createMockApi().listHomes();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = url.endsWith("/homes")
        ? homes
        : url.endsWith(`/homes/${HOME_A}/bills`)
          ? BILLS.filter((b) => b.home_id === HOME_A)
          : url.endsWith(`/homes/${HOME_A}/dashboard`)
            ? DASHBOARD_A
            : null;
      return { ok: body !== null, status: body !== null ? 200 : 404, json: async () => body };
    }),
  );
}

describe("DashboardPage", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("muestra kWh, RD$, proyección y etiquetas de calidad tal como los entrega la API", async () => {
    await stubApiFetch();
    renderWithApp(<DashboardPage />, HOME_A);

    await screen.findByText("Próxima factura");
    expectDashboardRendered(DASHBOARD_A, BILLS.filter((b) => b.home_id === HOME_A));
  });

  it("siempre usa la API real: no ofrece el modo demo", async () => {
    await stubApiFetch();
    renderWithApp(<DashboardPage />, HOME_A);

    await screen.findByText("Próxima factura");
    expect(screen.getByLabelText("Origen de datos")).toBeDisabled();
    expect(screen.getByLabelText("Origen de datos")).toHaveValue("api");
  });
});
