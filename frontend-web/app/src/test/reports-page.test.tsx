// ERD-RPT-01 (web): informe energético imprimible — cifras con calidad, vacío honesto, período inválido y error con reintento.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReportsPage from "@/app/(app)/reports/page";
import { getApi } from "@/lib/api";
import { HOME_A } from "./mock-api";
import { renderWithApp } from "./render";

vi.mock("@/lib/api", async () => {
  const { createMockApi } = await import("./mock-api");
  const api = createMockApi();
  return { getApi: () => api };
});

const m = (value: string, unit: string, quality: string) => ({ value, unit, quality });
const bill = (a: string, b: string, kwh: string, amount: string) => ({ bill_id: "11111111-1111-4111-8111-111111111111", period_start: a, period_end: b, days: 30,
  kwh: m(kwh, "kWh", "REAL"), amount_dop: m(amount, "RD$", "REAL"), avg_price_per_kwh: m("13.00", "RD$/kWh", "ESTIMATED") });
const full = {
  home_id: HOME_A, home: { id: HOME_A, name: "Casa", distributor: "EDESUR", province: "Santo Domingo", municipality: "Distrito Nacional" },
  period: { period_from: "2026-05-01", period_to: "2026-06-30", days: 61 }, generated_at: "2026-10-14T12:00:00Z",
  bills: [bill("2026-05-01", "2026-05-30", "300.00", "3900.00"), bill("2026-06-01", "2026-06-30", "340.00", "4420.00")],
  totals: { bills_count: 2, kwh: m("640.00", "kWh", "REAL"), amount_dop: m("8320.00", "RD$", "REAL"), avg_price_per_kwh: m("13.00", "RD$/kWh", "ESTIMATED"), avg_kwh_per_bill: m("320.00", "kWh", "ESTIMATED") },
  peak_bill: bill("2026-06-01", "2026-06-30", "340.00", "4420.00"), comparison: null,
  equipment: [{ name: "Aire", room: "Sala", monthly_kwh: m("270.00", "kWh/mes", "ESTIMATED"), share_pct: m("100.00", "%", "ESTIMATED") }],
  recommendations: [], goal: null, sources: [{ label: "2 factura(s) registradas por ti", quality: "REAL" }, { label: "Equipos declarados", quality: "ESTIMATED" }],
  notes: ["Las facturas son mensuales: este informe no tiene medición diaria ni por hora."],
};

describe("ReportsPage", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("muestra cifras reales sin etiqueta y las estimadas marcadas, con fuentes y notas", async () => {
    const spy = vi.spyOn(getApi(), "getEnergyReport").mockResolvedValue(full as never);
    renderWithApp(<ReportsPage />, HOME_A);
    const report = await screen.findByTestId("energy-report");
    const summary = within(report).getByRole("region", { name: "Resumen" });
    expect(within(summary).getByText("Consumo total").nextElementSibling).toHaveTextContent("640 kWh");
    expect(within(summary).getByText("Precio medio").nextElementSibling).toHaveTextContent("ESTIMADO");
    expect(within(summary).getByText("Consumo total").nextElementSibling).not.toHaveTextContent("REAL");
    expect(within(report).getByRole("region", { name: "Equipos que más pesan (estimado)" })).toHaveTextContent("ESTIMADO");
    expect(within(report).getByRole("region", { name: "Fuentes" })).toHaveTextContent("2 factura(s) registradas por ti — real");
    expect(within(report).getByRole("region", { name: "Notas" })).toHaveTextContent("no tiene medición diaria");
    expect(spy).toHaveBeenCalledWith(HOME_A, expect.objectContaining({ from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }), expect.anything());
  });

  it("ofrece descargar el PDF con el período elegido, solo cuando hay informe", async () => {
    vi.spyOn(getApi(), "getEnergyReport").mockResolvedValue(full as never);
    renderWithApp(<ReportsPage />, HOME_A);
    const link = await screen.findByRole("link", { name: /Descargar PDF/ });
    expect(link).toHaveAttribute("href", expect.stringMatching(new RegExp(`^/api/bff/homes/${HOME_A}/reports/energy\\.pdf\\?from=\\d{4}-\\d{2}-\\d{2}&to=\\d{4}-\\d{2}-\\d{2}$`)));
    expect(link).toHaveAttribute("download");
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2999-01-01" } });
    await waitFor(() => expect(screen.queryByRole("link", { name: /Descargar PDF/ })).toBeNull());
  });

  it("sin facturas lo dice y no inventa totales; imprimir llama al diálogo del navegador", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    renderWithApp(<ReportsPage />, HOME_A);
    const report = await screen.findByTestId("energy-report");
    expect(within(report).getByText("No hay facturas registradas en este período.")).toBeInTheDocument();
    expect(within(report).queryByText("Consumo total")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Imprimir$/ }));
    expect(print).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("un período inválido se explica y no consulta la API", async () => {
    const spy = vi.spyOn(getApi(), "getEnergyReport").mockResolvedValue(full as never);
    renderWithApp(<ReportsPage />, HOME_A);
    await screen.findByTestId("energy-report");
    spy.mockClear();
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2999-01-01" } });
    expect(await screen.findByText(/hasta 366 días/)).toBeInTheDocument();
    expect(screen.queryByTestId("energy-report")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("si la API falla muestra el error con reintento", async () => {
    vi.spyOn(getApi(), "getEnergyReport").mockRejectedValueOnce(new Error("x")).mockResolvedValue(full as never);
    renderWithApp(<ReportsPage />, HOME_A);
    fireEvent.click(await screen.findByRole("button", { name: /Reintentar/ }));
    await waitFor(() => expect(screen.getByTestId("energy-report")).toBeInTheDocument());
  });
});
