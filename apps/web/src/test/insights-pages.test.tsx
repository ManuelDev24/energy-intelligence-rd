import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AlertsPage from "@/app/(app)/alerts/page";
import EquipmentPage from "@/app/(app)/equipment/page";
import { ALERT_A, HOME_A, HOME_B } from "./mock-api";
import { renderWithApp } from "./render";

vi.mock("@/lib/api", async () => {
  const { createMockApi } = await import("./mock-api");
  const api = createMockApi();
  return { getApi: () => api };
});

describe("AlertsPage", () => {
  beforeEach(() => window.localStorage.clear());

  it("muestra la alerta crítica no leída con período base y umbral, y permite descartarla", async () => {
    renderWithApp(<AlertsPage />, HOME_A);
    await waitFor(() => expect(screen.getByText(ALERT_A.message)).toBeInTheDocument());
    expect(screen.getByText("Crítica")).toBeInTheDocument();
    expect(screen.getByText("nueva")).toBeInTheDocument();
    expect(screen.getByText("+50.00%")).toBeInTheDocument();
    expect(screen.getByText(/Período base: 1–31 jul 2026 · umbral 40%/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Descartar/ }));
    await waitFor(() => expect(screen.getByText("Sin alertas")).toBeInTheDocument());
  });

  it("muestra estado vacío en una vivienda sin alertas", async () => {
    renderWithApp(<AlertsPage />, HOME_B);
    await waitFor(() => expect(screen.getByText("Sin alertas")).toBeInTheDocument());
  });
});

describe("EquipmentPage", () => {
  beforeEach(() => window.localStorage.clear());

  it("valida en el cliente y crea un equipo", async () => {
    renderWithApp(<EquipmentPage />, HOME_B);
    await waitFor(() => expect(screen.getByText("Sin equipos declarados")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Agregar equipo/ }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Nevera" } });
    fireEvent.change(screen.getByLabelText("Potencia (W)"), { target: { value: "-5" } });
    fireEvent.change(screen.getByLabelText("Horas de uso por día"), { target: { value: "24" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar equipo" }));
    expect(await screen.findByText("No puede ser negativo")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Potencia (W)"), { target: { value: "150" } });
    expect(screen.getByText(/≈ 3.60 kWh\/día/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar equipo" }));
    await waitFor(() => expect(screen.getByRole("rowheader", { name: "Nevera" })).toBeInTheDocument());
    expect(screen.getByText("150 W")).toBeInTheDocument();
  });
});
