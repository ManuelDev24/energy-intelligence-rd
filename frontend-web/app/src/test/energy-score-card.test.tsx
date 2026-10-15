// ERD-SCORE-01 (web): tarjeta del Energy Score — puntaje del backend, componentes, datos faltantes y errores.
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnergyScoreCard } from "@/features/dashboard/EnergyScoreCard";
import { getApi } from "@/lib/api";
import { HOME_A } from "./mock-api";
import { renderWithApp } from "./render";

vi.mock("@/lib/api", async () => {
  const { createMockApi } = await import("./mock-api");
  const api = createMockApi();
  return { getApi: () => api };
});

const component = (key: string, label: string, weight: number, score: number | null, over: Record<string, unknown> = {}) => ({
  key, label, weight, score, available: score !== null, summary: `Qué mide ${label}`, detail: `Detalle de ${label}`, inputs: {},
  reasons: score === null ? [`Falta algo para ${label}`] : [], next_step: `Paso para ${label}`, ...over,
});
const scored = (over: Record<string, unknown> = {}) => ({
  home_id: HOME_A, score_version: 1, as_of: "2026-10-11", status: "ok", score: 72, band: "good", band_label: "Bueno", quality: "INFERRED", coverage_pct: 100,
  components: [component("consumption", "Consumo", 35, 80), component("efficiency", "Eficiencia", 25, 67), component("habits", "Hábitos", 15, 90), component("consistency", "Consistencia", 25, 55)],
  reasons: [], method: "m", note: "Indicador interno INFERIDO.", ...over,
});

describe("EnergyScoreCard", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("muestra el puntaje del backend en el gauge, la etiqueta INFERIDO y los cuatro componentes", async () => {
    vi.spyOn(getApi(), "getEnergyScore").mockResolvedValue(scored() as never);
    renderWithApp(<EnergyScoreCard homeId={HOME_A} />, HOME_A);
    const meter = await screen.findByRole("meter", { name: "Energy Score" });
    expect(meter).toHaveAttribute("aria-valuenow", "72");
    expect(meter).toHaveAttribute("aria-valuetext", "72 de 100, bueno");
    expect(screen.getByText("INFERIDO")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Componentes del Energy Score" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(within(screen.getByTestId("score-efficiency")).getByLabelText("Eficiencia: 67 de 100")).toBeInTheDocument();
    expect(screen.getByText("Detalle de Consumo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver cómo mejorarlo en Ahorro/ })).toHaveAttribute("href", "/savings");
  });

  it("un componente sin datos dice «Sin datos» y qué falta; avisa si el puntaje usa solo parte de los datos", async () => {
    vi.spyOn(getApi(), "getEnergyScore").mockResolvedValue(scored({
      coverage_pct: 60, components: [component("consumption", "Consumo", 35, 100), component("efficiency", "Eficiencia", 25, 50), component("habits", "Hábitos", 15, null), component("consistency", "Consistencia", 25, null)],
    }) as never);
    renderWithApp(<EnergyScoreCard homeId={HOME_A} />, HOME_A);
    await screen.findByRole("meter");
    expect(screen.getByText(/Calculado con 60% de los datos posibles/)).toBeInTheDocument();
    const habits = screen.getByTestId("score-habits");
    expect(within(habits).getByLabelText("Hábitos: sin datos")).toHaveTextContent("Sin datos");
    expect(within(habits).getByText("Falta algo para Hábitos")).toBeInTheDocument();
  });

  it("sin puntaje no dibuja ningún gauge: explica por qué", async () => {
    vi.spyOn(getApi(), "getEnergyScore").mockResolvedValue(scored({ status: "insufficient_data", score: null, band: null, band_label: null, coverage_pct: 0, components: [], reasons: ["Hacen falta datos de al menos 2 componentes; hoy hay 0."] }) as never);
    renderWithApp(<EnergyScoreCard homeId={HOME_A} />, HOME_A);
    expect(await screen.findByText("Sin puntaje todavía")).toBeInTheDocument();
    expect(screen.getByText(/Hacen falta datos de al menos 2 componentes/)).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(screen.queryByText("INFERIDO")).not.toBeInTheDocument();
  });

  it("un error del servidor da un mensaje local con Reintentar y reintentar recupera", async () => {
    const spy = vi.spyOn(getApi(), "getEnergyScore").mockRejectedValueOnce(new Error("TEXTO-INTERNO")).mockResolvedValue(scored() as never);
    renderWithApp(<EnergyScoreCard homeId={HOME_A} />, HOME_A);
    fireEvent.click(await screen.findByRole("button", { name: /Reintentar/ }));
    expect(await screen.findByRole("meter")).toBeInTheDocument();
    expect(screen.queryByText(/TEXTO-INTERNO/)).not.toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
