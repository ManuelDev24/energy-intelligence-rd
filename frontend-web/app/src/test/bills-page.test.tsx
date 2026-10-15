import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BillsPage from "@/app/(app)/bills/page";
import { formatDop, formatMetric, formatPeriod } from "@/lib/format";
import { BILLS, HOME_A } from "./mock-api";
import { renderWithApp } from "./render";

vi.mock("@/lib/api", async () => {
  const { createMockApi } = await import("./mock-api");
  const api = createMockApi();
  return { getApi: () => api };
});

describe("BillsPage", () => {
  beforeEach(() => window.localStorage.clear());

  it("lista las facturas de la vivienda con los kWh y RD$ exactos de la API", async () => {
    renderWithApp(<BillsPage />, HOME_A);

    const own = BILLS.filter((b) => b.home_id === HOME_A);
    await waitFor(() =>
      expect(screen.getAllByRole("link", { name: /kWh/ })).toHaveLength(own.length),
    );

    for (const b of own) {
      const text = `${formatMetric(b.kwh, "kWh")} · ${formatDop(b.amount_dop)}`;
      expect(screen.getByText(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeInTheDocument();
      expect(screen.getByText(formatPeriod(b.period_start, b.period_end))).toBeInTheDocument();
    }
  });

  it("no muestra facturas de otra vivienda", async () => {
    renderWithApp(<BillsPage />, HOME_A);
    await waitFor(() => expect(screen.getAllByRole("link", { name: /kWh/ }).length).toBeGreaterThan(0));

    const other = BILLS.find((b) => b.home_id !== HOME_A)!;
    expect(screen.queryByText(new RegExp(`${formatMetric(other.kwh, "kWh")} ·`))).not.toBeInTheDocument();
  });

  it("CH-14: muestra la tendencia de kWh cuando hay 2 o más facturas", async () => {
    renderWithApp(<BillsPage />, HOME_A);
    expect(await screen.findByText("jun 2026: 250 kWh → ago 2026: 420 kWh")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Tendencia de consumo en 3 facturas/ })).toBeInTheDocument();
  });
});
