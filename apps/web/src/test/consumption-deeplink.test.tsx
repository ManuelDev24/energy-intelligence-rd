// ERD-CHARTS-01: «Investigar en Consumo» abre Por lecturas con el rango de la desviación.
import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConsumptionPage from "@/app/(app)/consumption/page";
import { getApi } from "@/lib/api";
import { HOME_A } from "./mock-api";
import { renderWithApp } from "./render";

const search = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search.value) }));
vi.mock("@/lib/api", async () => {
  const { createMockApi } = await import("./mock-api");
  const api = createMockApi();
  return { getApi: () => api };
});
afterEach(() => vi.restoreAllMocks());

describe("Consumo abierto desde una desviación", () => {
  it("pide exactamente el rango del enlace en modo personalizado y lo muestra", async () => {
    search.value = "from=2026-09-21&to=2026-10-04&granularity=day";
    const spy = vi.spyOn(getApi(), "getConsumption");
    renderWithApp(<ConsumptionPage />, HOME_A);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0][1]).toMatchObject({ from: "2026-09-21", to: "2026-10-04", granularity: "day" });
    expect(screen.getByRole("button", { name: "Personalizado" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Desde")).toHaveValue("2026-09-21");
    expect(screen.getByLabelText("Hasta")).toHaveValue("2026-10-04");
  });

  it("con parámetros inválidos ignora el enlace y usa los últimos 30 días", async () => {
    search.value = "from=2020-01-01&to=2026-10-04&granularity=day";
    const spy = vi.spyOn(getApi(), "getConsumption");
    renderWithApp(<ConsumptionPage />, HOME_A);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Últimos 30 días" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("Desde")).not.toBeInTheDocument();
  });
});
