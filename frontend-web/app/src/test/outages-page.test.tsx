// ERD-INT-01 (web): registro, historial y resumen mensual de apagones.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OutagesPage from "@/app/(app)/outages/page";
import { ApiError } from "@/lib/api/types";
import { getApi } from "@/lib/api";
import { HOME_A } from "./mock-api";
import { renderWithApp } from "./render";

vi.mock("@/lib/api", async () => {
  const { createMockApi } = await import("./mock-api");
  const api = createMockApi();
  return { getApi: () => api };
});

const outage = (over: Record<string, unknown> = {}) => ({
  id: "d1000000-0000-4000-8000-000000000001", home_id: HOME_A, started_at: "2026-10-01T18:30:00Z", ended_at: "2026-10-01T21:00:00Z", cause: "utility_fault",
  note: "Se fue con la lluvia", source: "manual", created_at: "2026-10-11T21:30:00Z", updated_at: "2026-10-11T21:30:00Z", ongoing: false, duration_minutes: 150, ...over,
});
const month = (key: string, count: number, total = count * 150) => ({ month: key, count, total_minutes: total, longest_minutes: count ? 150 : 0, average_minutes: count ? Math.round(total / count) : null, ongoing: 0 });
const summary = (months = [month("2026-09", 0), month("2026-10", 2, 300)]) => ({
  home_id: HOME_A, timezone: "America/Santo_Domingo", from_month: months[0].month, to_month: months.at(-1)!.month, months,
  totals: { count: 2, total_minutes: 300, longest_minutes: 150, average_minutes: 150, ongoing: 0 }, note: "Cada interrupción se cuenta entera en el mes en que empezó.",
});

function setup(list: unknown[] = [outage()], sum: unknown = summary()) {
  const api = getApi();
  vi.spyOn(api, "listOutages").mockResolvedValue(list as never);
  vi.spyOn(api, "getOutageSummary").mockResolvedValue(sum as never);
  return api;
}

describe("OutagesPage", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("muestra el historial con duración y causa, y el resumen por mes con los meses vacíos", async () => {
    setup();
    renderWithApp(<OutagesPage />, HOME_A);
    const item = await screen.findByTestId("outage");
    expect(within(item).getByTestId("outage-summary")).toHaveTextContent("2 h 30 min · Falla de la distribuidora");
    expect(within(item).getByText("Se fue con la lluvia")).toBeInTheDocument();
    const table = await screen.findByTestId("outage-months");
    expect(within(table).getByText("oct 2026").closest("tr")).toHaveTextContent("2");
    expect(within(table).getByText("sep 2026").closest("tr")).toHaveTextContent("—");
    expect(table.querySelector("caption")).toHaveTextContent("2 apagones, 5 h sin luz");
    expect(screen.getByText(/en el mes en que empezó/)).toBeInTheDocument();
  });

  it("sin apagones explica qué hacer", async () => {
    setup([], { ...summary([month("2026-10", 0)]), totals: { count: 0, total_minutes: 0, longest_minutes: 0, average_minutes: null, ongoing: 0 } });
    renderWithApp(<OutagesPage />, HOME_A);
    expect(await screen.findByText("Aún no hay apagones registrados")).toBeInTheDocument();
    expect(await screen.findByText(/sin apagones registrados/)).toBeInTheDocument();
  });

  it("guarda un apagón con la hora de RD y la causa elegida", async () => {
    const api = setup([]);
    const create = vi.spyOn(api, "createOutage").mockResolvedValue(outage() as never);
    renderWithApp(<OutagesPage />, HOME_A);
    await screen.findByText("Aún no hay apagones registrados");
    fireEvent.change(screen.getByLabelText("Día en que se fue la luz"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Hora en que se fue"), { target: { value: "14:30" } });
    fireEvent.change(screen.getByLabelText("Día en que volvió"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Hora en que volvió"), { target: { value: "16:00" } });
    fireEvent.change(screen.getByLabelText("Causa"), { target: { value: "weather" } });
    fireEvent.change(screen.getByLabelText("Nota (opcional)"), { target: { value: "  Tormenta  " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar apagón" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(HOME_A, { started_at: "2026-10-01T14:30:00-04:00", ended_at: "2026-10-01T16:00:00-04:00", cause: "weather", note: "Tormenta" }));
    expect(await screen.findByText("Apagón guardado.")).toBeInTheDocument();
  });

  it("«Todavía sin luz» oculta el fin y se envía sin ended_at", async () => {
    const api = setup([]);
    const create = vi.spyOn(api, "createOutage").mockResolvedValue(outage({ ended_at: null, ongoing: true, duration_minutes: null }) as never);
    renderWithApp(<OutagesPage />, HOME_A);
    await screen.findByText("Aún no hay apagones registrados");
    fireEvent.click(screen.getByLabelText("Todavía sin luz"));
    expect(screen.queryByLabelText("Día en que volvió")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Día en que se fue la luz"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Hora en que se fue"), { target: { value: "09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar apagón" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(HOME_A, expect.objectContaining({ started_at: "2026-10-01T09:00:00-04:00", ended_at: null })));
  });

  it("valida antes de enviar: fin antes del inicio, futuro; el foco va al primer campo inválido", async () => {
    const api = setup([]);
    const create = vi.spyOn(api, "createOutage");
    renderWithApp(<OutagesPage />, HOME_A);
    await screen.findByText("Aún no hay apagones registrados");
    fireEvent.change(screen.getByLabelText("Día en que se fue la luz"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Hora en que se fue"), { target: { value: "14:30" } });
    fireEvent.change(screen.getByLabelText("Día en que volvió"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Hora en que volvió"), { target: { value: "13:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar apagón" }));
    expect(await screen.findByText("Debe ser después de la hora en que se fue.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Hora en que volvió")).toHaveFocus());
    fireEvent.change(screen.getByLabelText("Día en que se fue la luz"), { target: { value: "2099-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar apagón" }));
    expect(await screen.findByText("El apagón no puede empezar en el futuro.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("un solape (409) se explica con un mensaje local, sin el texto del servidor", async () => {
    const api = setup([]);
    vi.spyOn(api, "createOutage").mockRejectedValue(new ApiError(409, "TEXTO-INTERNO", {}, "conflict"));
    renderWithApp(<OutagesPage />, HOME_A);
    await screen.findByText("Aún no hay apagones registrados");
    fireEvent.change(screen.getByLabelText("Día en que se fue la luz"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Hora en que se fue"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText("Día en que volvió"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Hora en que volvió"), { target: { value: "11:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar apagón" }));
    expect(await screen.findByText(/se solapa con ese período/)).toBeInTheDocument();
    expect(screen.queryByText(/TEXTO-INTERNO/)).not.toBeInTheDocument();
  });

  it("un apagón abierto se cierra con «Ya volvió la luz» (PUT con ended_at)", async () => {
    const api = setup([outage({ ended_at: null, ongoing: true, duration_minutes: null })]);
    const update = vi.spyOn(api, "updateOutage").mockResolvedValue(outage() as never);
    renderWithApp(<OutagesPage />, HOME_A);
    expect(await screen.findByText(/sigue sin luz/)).toBeInTheDocument();
    expect(screen.getByTestId("outage-summary")).toHaveTextContent("Todavía sin luz");
    fireEvent.click(screen.getByRole("button", { name: /Ya volvió la luz/ }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    const [home, id, input] = update.mock.calls[0];
    expect([home, id]).toEqual([HOME_A, "d1000000-0000-4000-8000-000000000001"]);
    expect(input).toMatchObject({ started_at: "2026-10-01T18:30:00Z", cause: "utility_fault" });
    expect(Date.parse(input.ended_at as string)).toBeGreaterThan(Date.parse("2026-10-01T18:30:00Z"));
  });

  it("edita un apagón con los valores precargados en hora de RD", async () => {
    const api = setup();
    const update = vi.spyOn(api, "updateOutage").mockResolvedValue(outage() as never);
    renderWithApp(<OutagesPage />, HOME_A);
    fireEvent.click(await screen.findByRole("button", { name: /Editar el apagón/ }));
    const form = screen.getByRole("form", { name: "Editar apagón" });
    expect(within(form).getByLabelText("Hora en que se fue")).toHaveValue("14:30");
    expect(within(form).getByLabelText("Hora en que volvió")).toHaveValue("17:00");
    fireEvent.change(within(form).getByLabelText("Hora en que volvió"), { target: { value: "18:00" } });
    fireEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(HOME_A, "d1000000-0000-4000-8000-000000000001",
      { started_at: "2026-10-01T14:30:00-04:00", ended_at: "2026-10-01T18:00:00-04:00", cause: "utility_fault", note: "Se fue con la lluvia" }));
  });

  it("eliminar pide confirmación, se puede cancelar y confirma con el botón del grupo", async () => {
    const api = setup();
    const remove = vi.spyOn(api, "deleteOutage").mockResolvedValue(undefined);
    renderWithApp(<OutagesPage />, HOME_A);
    fireEvent.click(await screen.findByRole("button", { name: /Eliminar el apagón/ }));
    const group = screen.getByRole("group", { name: /Confirmar eliminación del apagón/ });
    fireEvent.click(within(group).getByRole("button", { name: "Cancelar" }));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Eliminar el apagón/ }));
    fireEvent.click(within(screen.getByRole("group", { name: /Confirmar eliminación/ })).getByRole("button", { name: "Sí, eliminar" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(HOME_A, "d1000000-0000-4000-8000-000000000001"));
  });

  it("un error de carga da un mensaje local con Reintentar", async () => {
    const api = getApi();
    vi.spyOn(api, "listOutages").mockRejectedValueOnce(new Error("TEXTO-INTERNO")).mockResolvedValue([]);
    vi.spyOn(api, "getOutageSummary").mockResolvedValue(summary() as never);
    renderWithApp(<OutagesPage />, HOME_A);
    fireEvent.click(await screen.findByRole("button", { name: /Reintentar/ }));
    expect(await screen.findByText("Aún no hay apagones registrados")).toBeInTheDocument();
    expect(screen.queryByText(/TEXTO-INTERNO/)).not.toBeInTheDocument();
  });
});
