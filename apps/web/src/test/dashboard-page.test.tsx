import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/(app)/dashboard/page";
import { expectDashboardRendered } from "./assertions";
import { BILLS, DASHBOARD_A, HOME_A, HOME_B } from "./mock-api";
import { renderWithApp } from "./render";
import { getApi } from "@/lib/api";
import { useSession } from "@/lib/session";

vi.mock("@/lib/api", async () => {
  const { createMockApi } = await import("./mock-api");
  const api = createMockApi();
  return { getApi: () => api };
});

describe("DashboardPage", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("consulta el período elegido y no incluye facturas posteriores en la gráfica", async () => {
    const historical = { ...DASHBOARD_A, latest_bill: {
      ...DASHBOARD_A.latest_bill, bill_id: BILLS[0].id,
      period_start: BILLS[0].period_start, period_end: BILLS[0].period_end,
      kwh: { ...DASHBOARD_A.latest_bill.kwh, value: "250.00" },
    }, comparison: null, projection: null, alert: null };
    const dashboard = vi.spyOn(getApi(), "getDashboard").mockImplementation(async (_home, _signal, bill) =>
      bill ? historical : DASHBOARD_A);
    renderWithApp(<DashboardPage />, HOME_A);
    const selector = await screen.findByRole("combobox", { name: "Período de facturación" });
    await waitFor(() => expect(within(selector).getAllByRole("option")).toHaveLength(4));
    fireEvent.change(selector, { target: { value: BILLS[0].id } });
    expect(await screen.findByText("Factura del período")).toBeInTheDocument();
    expect(dashboard).toHaveBeenLastCalledWith(HOME_A, expect.any(AbortSignal), BILLS[0].id);
    expect(screen.getByRole("img", { name: /jun 2026: 250 kWh/ }).getAttribute("aria-label")).not.toMatch(/jul|ago|proyectado/);
    expect(screen.getByText(/Sin período anterior para comparar/)).toBeInTheDocument();
    fireEvent.change(selector, { target: { value: "" } });
    expect(await screen.findByText("Última factura")).toBeInTheDocument();
  });

  it("restablece el período y no reutiliza el resumen al cambiar de vivienda", async () => {
    function SwitchHome() {
      const { signIn } = useSession();
      return <button onClick={() => signIn(HOME_B)}>Cambiar vivienda</button>;
    }
    const dashboard = vi.spyOn(getApi(), "getDashboard");
    renderWithApp(<><SwitchHome /><DashboardPage /></>, HOME_A);
    const selector = await screen.findByRole("combobox", { name: "Período de facturación" });
    await waitFor(() => expect(within(selector).getAllByRole("option")).toHaveLength(4));
    fireEvent.change(selector, { target: { value: BILLS[0].id } });
    await screen.findByRole("article", { name: "Información: Resumen histórico" });
    fireEvent.click(screen.getByRole("button", { name: "Cambiar vivienda" }));
    expect(await screen.findByText("Aún no hay facturas")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Período de facturación" })).toHaveValue("");
    expect(dashboard).toHaveBeenLastCalledWith(HOME_B, expect.any(AbortSignal), undefined);
    expect(screen.queryByRole("article", { name: "Información: Resumen histórico" })).not.toBeInTheDocument();
  });

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

  it("ERD-PROJECTION-METRIC-API: el titular muestra la variación que calcula la API, sin recalcularla", async () => {
    // 99.00 es deliberadamente distinto de lo que daría la aritmética del cliente (486.67 vs 420 = 15.87):
    // si la UI volviera a calcularlo, mostraría +15.87%.
    const fromApi = { ...DASHBOARD_A, projection: { ...DASHBOARD_A.projection, kwh_pct_vs_latest: { value: "99.00", unit: "%", quality: "PROJECTED" as const } } };
    vi.spyOn(getApi(), "getDashboard").mockResolvedValue(fromApi);
    renderWithApp(<DashboardPage />, HOME_A);
    const hero = await screen.findByRole("region", { name: "Resumen" });
    expect(hero).toHaveTextContent(/\+99\.00%\s*vs\. la última factura/);
    expect(hero).not.toHaveTextContent("15.87");
  });

  it("ERD-PROJECTION-METRIC-API: sin variación de la API (base 0 o API anterior) no se muestra ni se inventa", async () => {
    const withoutDelta = { ...DASHBOARD_A, projection: { ...DASHBOARD_A.projection, kwh_pct_vs_latest: null } };
    vi.spyOn(getApi(), "getDashboard").mockResolvedValue(withoutDelta);
    renderWithApp(<DashboardPage />, HOME_A);
    const hero = await screen.findByRole("region", { name: "Resumen" });
    expect(hero).toHaveTextContent("PROYECTADO");
    expect(hero).not.toHaveTextContent("vs. la última factura");
  });
});
