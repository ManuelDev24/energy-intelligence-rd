import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/(app)/dashboard/page";
import { expectDashboardRendered } from "./assertions";
import { DASHBOARD_A, HOME_A } from "./mock-api";
import { renderWithApp } from "./render";

vi.mock("@/lib/api", async () => {
  const { createMockApi } = await import("./mock-api");
  const api = createMockApi();
  return { getApi: () => api };
});

describe("DashboardPage", () => {
  beforeEach(() => window.localStorage.clear());

  it("muestra cada métrica del backend con su valor y su etiqueta de calidad", async () => {
    renderWithApp(<DashboardPage />, HOME_A);
    await waitFor(() => expect(screen.getByText("Última factura")).toBeInTheDocument());

    expect(expectDashboardRendered(DASHBOARD_A)).toBeGreaterThan(0);
  });

  it("muestra el estado de los datos y su leyenda", async () => {
    renderWithApp(<DashboardPage />, HOME_A);
    await waitFor(() => expect(screen.getByText("Estado de los datos")).toBeInTheDocument());

    expect(screen.getByText(/3 facturas · fuente: demo/)).toBeInTheDocument();
  });

  it("CH-01 y CH-05: gráfica accesible con la proyección y deltas con flecha frente al período anterior", async () => {
    renderWithApp(<DashboardPage />, HOME_A);
    expect(
      await screen.findByRole("img", { name: /ago 2026: 420 kWh; sep 2026: 486.67 kWh \(proyectado\)/ }),
    ).toBeInTheDocument();
    const compare = screen.getByRole("region", { name: "Vs. período anterior" });
    expect(within(compare).getByText("+50.00%").parentElement).toHaveTextContent("▲Sube+50.00%vs. período anterior");
    expect(within(compare).getByText("+57.30%")).toBeInTheDocument();
    expect(screen.getByRole("alert", { name: "Crítica" })).toHaveTextContent(DASHBOARD_A.alert.message);
  });
});
