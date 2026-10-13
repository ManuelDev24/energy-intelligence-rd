// ERD-SAVE-01 (web): pantalla de recomendaciones de ahorro — estimados etiquetados, explicación, estados y reintento.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SavingsPage from "@/app/(app)/savings/page";
import { getApi } from "@/lib/api";
import { HOME_A } from "./mock-api";
import { renderWithApp } from "./render";

vi.mock("@/lib/api", async () => {
  const { createMockApi } = await import("./mock-api");
  const api = createMockApi();
  return { getApi: () => api };
});

const rec = (over: Record<string, unknown> = {}) => ({
  id: "c1000000-0000-4000-8000-000000000001", home_id: HOME_A, equipment_id: null, anomaly_id: null, rule_id: "ac-one-hour", rule_version: 1,
  ruleset_version: 1, category: "equipment", title: "Una hora menos de aire acondicionado al día (Sala)", summary: "Sala usa unas 6.00 h al día.",
  action: "Sube el termostato a 24–25 °C.", confidence: "medium", status: "active", savings_kwh_month: "45.00", savings_dop_month: "585.00",
  assumptions: ["Se supone que el compresor trabaja a la potencia nominal declarada."], evidence: { power_w: "1500" },
  created_at: "2026-10-11T12:00:00Z", last_seen_at: "2026-10-11T12:00:00Z", status_changed_at: "2026-10-11T12:00:00Z", ...over,
});
const list = (items: unknown[], totals = true) => ({
  home_id: HOME_A, ruleset_version: 1, items, note: "Ahorro ESTIMADO: no es una medición ni una garantía.",
  total_savings_kwh_month: totals ? { value: "45.00", unit: "kWh/mes", quality: "ESTIMATED" } : null,
  total_savings_dop_month: totals ? { value: "585.00", unit: "RD$/mes", quality: "ESTIMATED" } : null,
});

describe("SavingsPage", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("muestra el ahorro como ESTIMADO, con la explicación y los supuestos a un clic", async () => {
    vi.spyOn(getApi(), "refreshRecommendations").mockResolvedValue(list([rec()]) as never);
    renderWithApp(<SavingsPage />, HOME_A);
    const item = await screen.findByRole("listitem", { name: /Ahorro: Una hora menos de aire acondicionado/ });
    expect(within(item).getByTestId("recommendation-savings")).toHaveTextContent("≈ 45 kWh al mes · ≈ RD$ 585.00 al mes");
    expect(within(item).getByText("ESTIMADO")).toBeInTheDocument();
    expect(within(item).getByText("Sube el termostato a 24–25 °C.")).toBeInTheDocument();
    expect(within(item).getByText(/Confianza media/)).toBeInTheDocument();
    expect(within(item).getByText(/potencia nominal declarada/)).toBeInTheDocument();
    expect(within(item).getByText("Regla: ac-one-hour v1")).toBeInTheDocument();
    expect(screen.getByTestId("savings-total")).toHaveTextContent("≈ 45 kWh al mes");
    expect(screen.getByText(/no es una medición ni una garantía/)).toBeInTheDocument();
    expect(within(item).getByRole("link", { name: /Ver mis equipos/ })).toHaveAttribute("href", "/equipment");
  });

  it("una recomendación sin ahorro (meta) no inventa cifras ni total", async () => {
    vi.spyOn(getApi(), "refreshRecommendations").mockResolvedValue(
      list([rec({ category: "goal", rule_id: "goal-gap", title: "La próxima factura superaría tu meta", savings_kwh_month: null, savings_dop_month: null })], false) as never);
    renderWithApp(<SavingsPage />, HOME_A);
    const item = await screen.findByRole("listitem", { name: /La próxima factura superaría tu meta/ });
    expect(within(item).queryByTestId("recommendation-savings")).not.toBeInTheDocument();
    expect(within(item).getByRole("link", { name: /Ver mi meta/ })).toHaveAttribute("href", "/goal");
    expect(screen.queryByTestId("savings-total")).not.toBeInTheDocument();
  });

  it("sin recomendaciones explica qué hacer", async () => {
    vi.spyOn(getApi(), "refreshRecommendations").mockResolvedValue(list([], false) as never);
    renderWithApp(<SavingsPage />, HOME_A);
    expect(await screen.findByText("Sin recomendaciones por ahora")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a Equipos" })).toHaveAttribute("href", "/equipment");
  });

  it("«Ya la apliqué» y «Descartar» llaman a la API con el estado correcto", async () => {
    const api = getApi();
    vi.spyOn(api, "refreshRecommendations").mockResolvedValue(list([rec(), rec({ id: "c1000000-0000-4000-8000-000000000002", title: "Dos horas menos de TV (Sala)" })]) as never);
    const update = vi.spyOn(api, "updateRecommendation").mockResolvedValue(rec({ status: "applied" }) as never);
    renderWithApp(<SavingsPage />, HOME_A);
    fireEvent.click(await screen.findByRole("button", { name: /Ya la apliqué: Una hora menos/ }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(HOME_A, "c1000000-0000-4000-8000-000000000001", "applied"));
    fireEvent.click(screen.getByRole("button", { name: /Descartar: Dos horas menos de TV/ }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(HOME_A, "c1000000-0000-4000-8000-000000000002", "dismissed"));
  });

  it("lo aplicado o descartado queda aparte y se puede reactivar", async () => {
    const api = getApi();
    vi.spyOn(api, "refreshRecommendations").mockResolvedValue(list([], false) as never);
    vi.spyOn(api, "listRecommendations").mockResolvedValue(list([rec({ status: "dismissed" }), rec({ id: "c1000000-0000-4000-8000-000000000009", status: "active" })]) as never);
    const update = vi.spyOn(api, "updateRecommendation").mockResolvedValue(rec() as never);
    renderWithApp(<SavingsPage />, HOME_A);
    fireEvent.click(await screen.findByText(/Aplicadas y descartadas \(1\)/));
    fireEvent.click(screen.getByRole("button", { name: /Volver a activar: Una hora menos/ }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(HOME_A, "c1000000-0000-4000-8000-000000000001", "active"));
  });

  it("si falla el recálculo muestra lo guardado; si todo falla, mensaje local con Reintentar", async () => {
    const api = getApi();
    vi.spyOn(api, "refreshRecommendations").mockRejectedValue(new Error("boom"));
    const stored = vi.spyOn(api, "listRecommendations").mockResolvedValue(list([rec()]) as never);
    const { unmount } = renderWithApp(<SavingsPage />, HOME_A);
    expect(await screen.findByRole("listitem", { name: /Una hora menos de aire/ })).toBeInTheDocument();
    unmount();
    stored.mockRejectedValue(new Error("TEXTO-INTERNO"));
    renderWithApp(<SavingsPage />, HOME_A);
    expect(await screen.findByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
    expect(screen.queryByText(/TEXTO-INTERNO/)).not.toBeInTheDocument();
  });

  it("un error al actualizar se anuncia sin texto del servidor", async () => {
    const api = getApi();
    vi.spyOn(api, "refreshRecommendations").mockResolvedValue(list([rec()]) as never);
    vi.spyOn(api, "updateRecommendation").mockRejectedValue(new Error("TEXTO-INTERNO"));
    renderWithApp(<SavingsPage />, HOME_A);
    fireEvent.click(await screen.findByRole("button", { name: /Ya la apliqué/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo actualizar la recomendación");
    expect(screen.queryByText(/TEXTO-INTERNO/)).not.toBeInTheDocument();
  });
});
