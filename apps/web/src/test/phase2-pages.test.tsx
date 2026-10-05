import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import ConsumptionPage from "@/app/(app)/consumption/page";
import DashboardPage from "@/app/(app)/dashboard/page";
import GoalPage from "@/app/(app)/goal/page";
import ReadingsPage from "@/app/(app)/readings/page";
import { getApi } from "@/lib/api";
import { ApiError } from "@/lib/api/types";
import { HOME_A, HOME_B, NO_COVERAGE_REASON } from "./mock-api";
import { renderWithApp } from "./render";

vi.mock("@/lib/api", async () => {
  const { createMockApi } = await import("./mock-api");
  const api = createMockApi();
  return { getApi: () => api };
});

// Reloj fijo: 2026-10-04 13:00 en Santo Domingo. Solo se falsea Date (React Query y waitFor siguen reales).
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-04T17:00:00Z"));
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

/** Convención de las páginas: el valor es un elemento propio y su etiqueta de calidad es hermana. */
function expectValueWithBadge(value: string, badge: string) {
  const matches = screen.getAllByText(value, { exact: true });
  expect(
    matches.some((el) => el.parentElement && within(el.parentElement).queryByText(badge) !== null),
    `${value} debe mostrarse junto a ${badge}`,
  ).toBe(true);
}

describe("Consumo por lecturas", () => {
  it("muestra totales, promedio y pico con su calidad, y los huecos con su motivo (nunca 0)", async () => {
    renderWithApp(<ConsumptionPage />, HOME_A);
    expect(screen.getByRole("tab", { name: "Por lecturas" })).toHaveAttribute("aria-selected", "true");
    await screen.findByText("Total del rango");
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    await screen.findAllByText("21 sep – 27 sep");

    expectValueWithBadge("140 kWh", "ESTIMADO");
    expectValueWithBadge("10.37 kWh/día", "ESTIMADO");
    expectValueWithBadge("70.50 kWh", "REAL");
    const peak = screen.getByText("Pico").parentElement!;
    expect(within(peak).getByText("21 sep – 27 sep")).toBeInTheDocument();

    const gaps = screen.getByRole("region", { name: "Períodos sin datos" });
    expect(within(gaps).getByText("7 sep – 13 sep")).toBeInTheDocument();
    expect(within(gaps).getByText(new RegExp(NO_COVERAGE_REASON.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /7 sep – 13 sep: sin datos; 14 sep – 20 sep: 6\.71 kWh \(estimado, cobertura 10%\)/ })).toBeInTheDocument();
    expect(screen.queryByText(/^0 kWh$/)).toBeNull();
  });

  it("pide 30 días por día por defecto y cambia con atajos y granularidad", async () => {
    const spy = vi.spyOn(getApi(), "getConsumption");
    renderWithApp(<ConsumptionPage />, HOME_A);
    await screen.findByText("Total del rango");
    expect(spy).toHaveBeenLastCalledWith(HOME_A, { granularity: "day", from: "2026-09-05", to: "2026-10-04" }, expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Últimos 12 meses" }));
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(HOME_A, { granularity: "month", from: "2025-11-01", to: "2026-10-04" }, expect.anything()));
    expect(screen.getByRole("button", { name: "Mes" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(HOME_A, { granularity: "week", from: "2025-11-01", to: "2026-10-04" }, expect.anything()));

    fireEvent.click(screen.getByRole("button", { name: "Últimos 7 días" }));
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(HOME_A, { granularity: "day", from: "2026-09-28", to: "2026-10-04" }, expect.anything()));
  });

  it("rango personalizado: valida máximo 366 días sin llamar a la API", async () => {
    const spy = vi.spyOn(getApi(), "getConsumption");
    renderWithApp(<ConsumptionPage />, HOME_A);
    await screen.findByText("Total del rango");
    fireEvent.click(screen.getByRole("button", { name: /Personalizado/ }));
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2025-01-01" } });
    expect(await screen.findByText("El rango no puede superar 366 días.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-10-05" } });
    expect(screen.getByText("La fecha inicial debe ser igual o anterior a la final.")).toBeInTheDocument();
    expect(spy.mock.calls.some(([, q]) => q.from === "2025-01-01" || q.from === "2026-10-05")).toBe(false);

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-09-01" } });
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(HOME_A, { granularity: "day", from: "2026-09-01", to: "2026-10-04" }, expect.anything()));
  });

  it("sin lecturas: estado vacío con acción, y la vista por factura sigue disponible", async () => {
    renderWithApp(<ConsumptionPage />, HOME_B);
    expect(await screen.findByText("Sin consumo calculable en este rango")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Registrar lectura/ })).toHaveAttribute("href", "/readings");

    fireEvent.click(screen.getByRole("tab", { name: "Por factura" }));
    const panel = screen.getByRole("tabpanel", { name: "Por factura" });
    expect(await within(panel).findByRole("heading", { name: "Últimos 12 meses" })).toBeInTheDocument();
    expect(within(panel).getByRole("table", { name: "Consumo y monto por factura" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Por lecturas" })).toHaveAttribute("aria-controls", "panel-readings");
  });

  it("error de la API: mensaje local, nunca el texto del servidor", async () => {
    vi.spyOn(getApi(), "getConsumption").mockRejectedValue(new ApiError(422, "SERVER-TEXT rango", {}, "invalid_input"));
    renderWithApp(<ConsumptionPage />, HOME_A);
    expect(await screen.findByText("Rango de fechas inválido: máximo 366 días.")).toBeInTheDocument();
    expect(screen.queryByText(/SERVER-TEXT/)).toBeNull();
  });
});

describe("Lecturas del medidor", () => {
  it("lista lecturas en hora de RD y registra una nueva (ISO con -04:00)", async () => {
    const spy = vi.spyOn(getApi(), "createReading");
    renderWithApp(<ReadingsPage />, HOME_A);
    const row = (await screen.findByText("3 oct 2026, 20:00")).closest("tr")!;
    expect(within(row).getByText("1,140.00 kWh")).toBeInTheDocument();
    expect(screen.getByText("Antes del viaje")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-09-30" } });
    fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "08:00" } });
    expect(screen.getByText(/Debe ser igual o mayor que la anterior: 1,070\.50 kWh \(27 sep 2026, 08:00\)\. Y no mayor que la siguiente: 1,140\.00 kWh/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Lectura del medidor (kWh)"), { target: { value: "1100.25" } });
    fireEvent.change(screen.getByLabelText("Nota (opcional)"), { target: { value: "Fin de mes" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar lectura" }));

    expect(await screen.findByText("30 sep 2026, 08:00")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(HOME_A, { read_at: "2026-09-30T08:00:00-04:00", reading_kwh: "1100.25", note: "Fin de mes" });
    expect(screen.getByText(/^Lectura guardada: 1,100.25 kWh/)).toBeInTheDocument();
  });

  it("valida en el cliente: negativa, futura y no monótona", async () => {
    const spy = vi.spyOn(getApi(), "createReading");
    renderWithApp(<ReadingsPage />, HOME_A);
    await screen.findByText("3 oct 2026, 20:00");
    const kwh = screen.getByLabelText("Lectura del medidor (kWh)");
    const save = screen.getByRole("button", { name: "Guardar lectura" });

    fireEvent.change(kwh, { target: { value: "-5" } });
    fireEvent.click(save);
    expect(await screen.findByText("La lectura no puede ser negativa.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-10-05" } });
    fireEvent.change(kwh, { target: { value: "1200" } });
    fireEvent.click(save);
    expect(await screen.findByText("La lectura no puede estar en el futuro.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-09-29" } });
    fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "08:00" } });
    fireEvent.change(kwh, { target: { value: "900" } });
    fireEvent.click(save);
    expect(await screen.findByText(/^Debe ser mayor o igual que la lectura anterior/)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([
    [new ApiError(409, "SERVER-TEXT dup", {}, "conflict"), "Ya existe una lectura con esa fecha y hora."],
    [new ApiError(422, "SERVER-TEXT mono", {}, "invalid_input"), /^La lectura no encaja con las demás/],
    [new ApiError(422, "SERVER-TEXT future", { read_at: "SERVER-TEXT" }, "validation_error"), "Revisa la fecha y hora: la lectura no puede estar en el futuro."],
  ])("errores del servidor (%s) → mensaje local", async (error, expected) => {
    vi.spyOn(getApi(), "createReading").mockRejectedValueOnce(error);
    renderWithApp(<ReadingsPage />, HOME_A);
    await screen.findByText("3 oct 2026, 20:00");
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-10-04" } });
    fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "12:00" } });
    fireEvent.change(screen.getByLabelText("Lectura del medidor (kWh)"), { target: { value: "1150" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar lectura" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(screen.queryByText(/SERVER-TEXT/)).toBeNull();
  });

  it("borra con confirmación (cancelar no borra) y avisa si ya no existía", async () => {
    renderWithApp(<ReadingsPage />, HOME_A);
    await screen.findByText("3 oct 2026, 20:00");
    const del = screen.getByRole("button", { name: "Eliminar lectura del 3 oct 2026, 20:00" });

    fireEvent.click(del);
    const group = screen.getByRole("group", { name: /Confirmar eliminación de la lectura del 3 oct 2026, 20:00/ });
    expect(within(group).getByRole("button", { name: "Sí, eliminar" })).toHaveFocus();
    fireEvent.click(within(group).getByRole("button", { name: "Cancelar" }));
    expect(screen.getByText("3 oct 2026, 20:00")).toBeInTheDocument();

    vi.spyOn(getApi(), "deleteReading").mockRejectedValueOnce(new ApiError(404, "SERVER-TEXT gone", {}, "not_found"));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar lectura del 3 oct 2026, 20:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    expect(await screen.findByText("La lectura ya no existe. Actualiza la lista.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar lectura del 3 oct 2026, 20:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    await waitFor(() => expect(screen.queryByText("3 oct 2026, 20:00")).toBeNull());
  });
});

describe("Meta mensual", () => {
  it("dashboard: estado con ícono+texto, actual vs meta, proyección y RD$ estimado con tarifa", async () => {
    renderWithApp(<DashboardPage />, HOME_A);
    const card = await screen.findByRole("region", { name: /Meta de oct 2026/ });
    const statuses = within(card).getAllByText("En riesgo");
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses[0].closest("[data-status]")?.querySelector("svg")).not.toBeNull();

    expectValueWithBadge("RD$ 225.35", "ESTIMADO");
    expectValueWithBadge("30.29 kWh", "REAL");
    expectValueWithBadge("RD$ 3,104.11", "PROYECTADO");
    expectValueWithBadge("331.46 kWh", "PROYECTADO");
    expect(within(card).getByText("RD$ 3,000.00")).toBeInTheDocument();
    expectValueWithBadge("Estimado con tarifa SIE-121-2026-TF", "ESTIMADO");
    expect(within(card).getByRole("link", { name: /Ver resolución/ })).toHaveAttribute("href", "https://sie.gob.do/document/sie-121-2026-tf/");
    expect(within(card).getByRole("link", { name: /Editar meta/ })).toHaveAttribute("href", "/goal");
  });

  it("datos insuficientes: motivo y llamadas a la acción", async () => {
    renderWithApp(<DashboardPage />, HOME_B);
    const card = await screen.findByRole("region", { name: /Meta de oct 2026/ });
    expect(within(card).getByText("Datos insuficientes")).toBeInTheDocument();
    expect(within(card).getByText("No hay meta mensual definida para esta vivienda.")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /Definir meta/ })).toHaveAttribute("href", "/goal");
    expect(within(card).getByRole("link", { name: /Registrar lectura/ })).toHaveAttribute("href", "/readings");
    expect(within(card).getByRole("link", { name: /Agregar factura/ })).toHaveAttribute("href", "/bills/new");
  });

  it("valida, guarda la meta y refresca el progreso", async () => {
    const spy = vi.spyOn(getApi(), "putGoal");
    renderWithApp(<GoalPage />, HOME_B);
    const save = await screen.findByRole("button", { name: "Guardar meta" });
    fireEvent.click(save);
    expect(await screen.findByText("Define al menos una meta: en RD$, en kWh o ambas.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Meta de consumo mensual (kWh)"), { target: { value: "0" } });
    fireEvent.click(save);
    expect(await screen.findByText("Debe ser mayor que 0.")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Meta de consumo mensual (kWh)"), { target: { value: "350" } });
    fireEvent.change(screen.getByLabelText("Meta de gasto mensual (RD$)"), { target: { value: "2500.50" } });
    fireEvent.click(save);
    expect(await screen.findByText("Meta guardada. El progreso se actualizó.")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(HOME_B, { monthly_amount_rd: "2500.50", monthly_kwh: "350" });
    expect(await screen.findByText("No hay lecturas ni facturas en este mes.")).toBeInTheDocument();
    expect(screen.getByLabelText("Meta de consumo mensual (kWh)")).toHaveValue("350");
  });

  it("muestra la tarifa oficial vigente y errores del servidor en español local", async () => {
    vi.spyOn(getApi(), "putGoal").mockRejectedValueOnce(new ApiError(422, "SERVER-TEXT goal", {}, "validation_error"));
    renderWithApp(<GoalPage />, HOME_A);
    expect(await screen.findByText(/tarifa BTS-1 de EDESUR \(SIE-121-2026-TF\), vigente del 1 oct 2026 al 31 dic 2026/)).toBeInTheDocument();
    const input = await screen.findByLabelText("Meta de gasto mensual (RD$)");
    expect(input).toHaveValue("3000.00");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    });
    expect(await screen.findByText("Revisa la meta: valores mayores que 0, con hasta 2 decimales, y al menos una meta.")).toBeInTheDocument();
    expect(screen.queryByText(/SERVER-TEXT/)).toBeNull();
  });
});
