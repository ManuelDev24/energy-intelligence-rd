import { screen, waitFor } from "@testing-library/react";
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

    expect(screen.getByText(/3 facturas · fuente: seed/)).toBeInTheDocument();
  });
});
