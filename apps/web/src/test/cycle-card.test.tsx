// ERD-CHARTS-01: ciclo actual (fechas estimadas + consumo de lecturas con su calidad).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/(app)/dashboard/page";
import { CycleCard } from "@/features/dashboard/CycleCard";
import { getApi } from "@/lib/api";
import { BILLS, CONSUMPTION_A, HOME_A, HOME_B } from "./mock-api";
import { renderWithApp } from "./render";

vi.mock("@/lib/api", async () => {
  const { createMockApi } = await import("./mock-api");
  const api = createMockApi();
  return { getApi: () => api };
});
afterEach(() => vi.restoreAllMocks());
const LAST = { period_start: "2026-08-01", period_end: "2026-08-31", days: 31 };
const card = () => screen.getByRole("region", { name: "Ciclo actual" }) as HTMLElement;
const view = (today: string, homeId = HOME_A) => renderWithApp(<CycleCard homeId={homeId} lastBill={LAST} today={today} />, homeId);

describe("Ciclo actual", () => {
  it("dentro del ciclo: día X de Y, barra de avance y consumo de lecturas con su etiqueta de calidad", async () => {
    const spy = vi.spyOn(getApi(), "getConsumption");
    view("2026-09-10");
    expect(await within(card()).findByText("Día 10 de 30")).toBeInTheDocument();
    expect(within(card()).getByRole("progressbar", { name: "Avance del ciclo" })).toHaveAttribute("aria-valuenow", "33");
    expect(within(card()).getByText(/fechas estimadas a partir de tu última factura/)).toBeInTheDocument();
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0][1]).toMatchObject({ from: "2026-09-01", to: "2026-09-10", granularity: "day" });
    const total = CONSUMPTION_A.totals.kwh!;
    expect(await within(card()).findByText(`${Number(total.value)} kWh`, { exact: false })).toBeInTheDocument();
    expect(within(card()).getByText(/según lecturas del medidor/)).toBeInTheDocument();
  });

  it("sin lecturas que cubran el ciclo no inventa un valor y ofrece registrar una lectura", async () => {
    view("2026-09-10", HOME_B);
    expect(await within(card()).findByText(/Aún no hay lecturas que cubran este ciclo/)).toBeInTheDocument();
    expect(within(card()).getByRole("link", { name: "Registrar lectura" })).toHaveAttribute("href", "/readings");
    expect(within(card()).queryByText(/\d+ kWh/)).not.toBeInTheDocument();
  });

  it("ciclo estimado vencido: lo dice, pide la factura y consulta el ciclo completo", async () => {
    const spy = vi.spyOn(getApi(), "getConsumption");
    view("2026-10-04");
    expect(await within(card()).findByText(/ya pasaron: registra la factura/)).toBeInTheDocument();
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0][1]).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    expect(within(card()).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("ciclo aún no iniciado: no consulta consumo", async () => {
    const spy = vi.spyOn(getApi(), "getConsumption");
    view("2026-08-31");
    expect(await within(card()).findByText(/El ciclo estimado empieza el 1 sep 2026/)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    expect(within(card()).queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("un error del consumo se avisa sin romper la tarjeta", async () => {
    vi.spyOn(getApi(), "getConsumption").mockRejectedValue(new Error("x"));
    view("2026-09-10");
    expect(await within(card()).findByRole("alert")).toHaveTextContent("No se pudo cargar el consumo del ciclo.");
    expect(within(card()).getByText("Día 10 de 30")).toBeInTheDocument();
  });
});

describe("Ciclo actual en el panel", () => {
  it("aparece en la vista actual y desaparece al elegir un período histórico", async () => {
    renderWithApp(<DashboardPage />, HOME_A);
    expect(await screen.findByRole("region", { name: "Ciclo actual" })).toBeInTheDocument();
    const selector = await screen.findByRole("combobox", { name: "Período de facturación" });
    await waitFor(() => expect(within(selector).getAllByRole("option").length).toBeGreaterThan(1));
    fireEvent.change(selector, { target: { value: BILLS[0].id } });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Ciclo actual" })).not.toBeInTheDocument());
  });
});
