import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ChartBar } from "@energyrd/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertCard } from "./alert-card";
import { ConsumptionChart } from "./consumption-chart";
import { DataStatusBadge } from "./data-status-badge";
import { EmptyState } from "./empty-state";
import { EnergyGauge } from "./energy-gauge";
import { EquipmentBreakdownChart } from "./equipment-breakdown-chart";
import { ErrorState } from "./error-state";
import { KwhTrendChart } from "./kwh-trend-chart";
import { MetricCard } from "./metric-card";
import { QualityBadge } from "./quality-badge";

describe("DataStatusBadge", () => {
  it("etiqueta las 4 calidades y no muestra REAL salvo que se pida", () => {
    const { container, rerender } = render(<DataStatusBadge quality="REAL" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<DataStatusBadge quality="REAL" always />);
    expect(screen.getByText("REAL")).toBeInTheDocument();
    for (const [q, label] of [
      ["ESTIMATED", "ESTIMADO"],
      ["PROJECTED", "PROYECTADO"],
    ] as const) {
      rerender(<DataStatusBadge quality={q} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("INFERIDO lleva borde punteado (no solo color) y explica su significado", () => {
    render(<DataStatusBadge quality="INFERRED" />);
    const badge = screen.getByText("INFERIDO");
    expect(badge).toHaveClass("border-dashed");
    expect(badge).toHaveAttribute("title", expect.stringMatching(/modelo/));
  });

  it("QualityBadge sigue funcionando como alias", () => {
    render(<QualityBadge quality="PROJECTED" />);
    expect(screen.getByText("PROYECTADO")).toBeInTheDocument();
  });
});

describe("AlertCard", () => {
  it.each([
    ["critical", "Crítica"],
    ["warning", "Advertencia"],
    ["info", "Información"],
    ["savings", "Ahorro"],
  ] as const)("tono %s: nombre accesible con su severidad y el título", (tone, word) => {
    render(
      <AlertCard tone={tone} title="Consumo alto">
        Texto
      </AlertCard>,
    );
    const card = screen.getByRole("article", { name: `${word}: Consumo alto` });
    expect(card).toHaveAttribute("data-tone", tone);
    expect(within(card).getByText("Texto")).toBeInTheDocument();
  });

  it("solo se anuncia (role=alert) cuando se pide", () => {
    render(
      <AlertCard tone="critical" announce action={<button type="button">Ver alertas</button>}>
        Subió 50%
      </AlertCard>,
    );
    expect(screen.getByRole("alert", { name: "Crítica" })).toHaveTextContent("Subió 50%");
    expect(screen.getByRole("button", { name: "Ver alertas" })).toBeInTheDocument();
  });
});

describe("MetricCard", () => {
  it("muestra valor, calidad y una subida con flecha, signo y texto", () => {
    render(
      <MetricCard
        label="Consumo"
        value="+140 kWh"
        quality="ESTIMATED"
        delta={{ pct: "50.00", label: "vs. período anterior" }}
        helper="Diferencia de energía"
      />,
    );
    expect(screen.getByText("+140 kWh")).toBeInTheDocument();
    expect(screen.getByText("ESTIMADO")).toBeInTheDocument();
    const pct = screen.getByText("+50.00%");
    const line = pct.parentElement as HTMLElement;
    expect(line).toHaveTextContent("▲Sube+50.00%vs. período anterior");
    // Subir consumo no es bueno: tono de advertencia.
    expect(line).toHaveClass("text-warning");
  });

  it("una bajada de consumo es buena (verde) y usa ▼", () => {
    render(<MetricCard label="Consumo" value="300" unit="kWh" delta={{ pct: "-10", label: "vs. anterior" }} />);
    expect(screen.getByText("300 kWh")).toBeInTheDocument();
    const line = screen.getByText("−10.00%").parentElement as HTMLElement;
    expect(line).toHaveTextContent("▼Baja");
    expect(line).toHaveClass("text-success");
  });
});

const SERIES: ChartBar[] = [
  { key: "a", periodEnd: "2026-07-31", kwh: 280, amountDop: 3560, kind: "REAL" },
  { key: "b", periodEnd: "2026-08-31", kwh: 420, amountDop: 5600, kind: "REAL" },
  { key: "p", periodEnd: "2026-09-30", kwh: 486.67, amountDop: 6553.33, kind: "PROJECTED" },
];

describe("ConsumptionChart", () => {
  // Movimiento reducido: Recharts dibuja las barras sin animación (y así se pueden inspeccionar).
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());
  it("expone un resumen accesible que distingue la proyección", () => {
    render(<ConsumptionChart series={SERIES} />);
    const img = screen.getByRole("img", { name: /Consumo mensual por factura/ });
    expect(img).toHaveAccessibleName(
      "Consumo mensual por factura, en kWh. jul 2026: 280 kWh; ago 2026: 420 kWh; sep 2026: 486.67 kWh (proyectado).",
    );
    // Se dibuja de verdad (Recharts con tamaño en jsdom): una barra por punto, la proyección rayada.
    const bars = img.querySelectorAll(".recharts-bar-rectangle path");
    expect(bars).toHaveLength(3);
    expect(bars[2].getAttribute("fill")).toMatch(/^url\(#hatch-/);
    expect(bars[2]).toHaveAttribute("stroke-dasharray", "4 3");
  });

  it("tiene una tabla de datos alternativa con kWh, RD$ y calidad", () => {
    render(<ConsumptionChart series={SERIES} />);
    const toggle = screen.getByRole("button", { name: "Ver tabla de datos" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const table = screen.getByRole("table");
    const projected = within(table).getByRole("row", { name: /Próxima/ });
    expect(projected).toHaveTextContent("486.67 kWh");
    expect(projected).toHaveTextContent("RD$ 6,553.33");
    expect(within(projected).getByText("PROYECTADO")).toBeInTheDocument();
  });

  it("no dibuja nada sin datos", () => {
    const { container } = render(<ConsumptionChart series={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("KwhTrendChart", () => {
  const bill = (id: string, end: string, kwh: string) => ({
    id,
    period_start: end.slice(0, 8) + "01",
    period_end: end,
    days: 30,
    kwh,
    amount_dop: "100.00",
  });

  it("necesita al menos 2 facturas", () => {
    const { container } = render(<KwhTrendChart bills={[bill("a", "2026-06-30", "250.00")]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("resume primera y última factura en orden cronológico", () => {
    render(<KwhTrendChart bills={[bill("b", "2026-08-31", "420.00"), bill("a", "2026-06-30", "250.00")]} />);
    expect(screen.getByText("jun 2026: 250 kWh → ago 2026: 420 kWh")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /2 facturas/ })).toBeInTheDocument();
  });
});

describe("EquipmentBreakdownChart", () => {
  const m = (value: string) => ({ value, unit: "kWh/mes", quality: "ESTIMATED" as const });
  const item = (id: string, name: string, kwh: string) => ({
    equipment_id: `cccccccc-0000-4000-8000-00000000000${id}`,
    name,
    room: null,
    daily_kwh: m("1.00"),
    monthly_kwh: m(kwh),
  });

  it("ordena de mayor a menor y etiqueta el reparto como ESTIMADO", () => {
    render(
      <EquipmentBreakdownChart
        items={[item("1", "Nevera", "45.00"), item("2", "Aire acondicionado", "108.00"), item("3", "TV", "0.00")]}
        total={m("153.00")}
      />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Aire acondicionado108 kWh · ≈71%");
    expect(rows[1]).toHaveTextContent("Nevera45 kWh · ≈29%");
    expect(screen.getByText("ESTIMADO")).toBeInTheDocument();
  });

  it("con un solo equipo no hay reparto que dibujar", () => {
    const { container } = render(<EquipmentBreakdownChart items={[item("1", "Nevera", "45.00")]} total={m("45.00")} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("EnergyGauge", () => {
  it("expone el valor como meter accesible", () => {
    render(<EnergyGauge value={72} label="Energy Score" />);
    const meter = screen.getByRole("meter", { name: "Energy Score" });
    expect(meter).toHaveAttribute("aria-valuenow", "72");
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", "100");
    expect(meter).toHaveAttribute("aria-valuetext", "72 de 100, bueno");
  });

  it("acota valores fuera de rango", () => {
    render(<EnergyGauge value={140} label="Score" />);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "100");
  });
});

describe("EmptyState y ErrorState", () => {
  it("EmptyState explica qué falta y ofrece la acción", () => {
    render(<EmptyState title="Sin facturas" hint="Registra una" action={<button type="button">Registrar</button>} />);
    expect(screen.getByText("Sin facturas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar" })).toBeInTheDocument();
  });

  it("ErrorState muestra el mensaje y Reintentar llama al callback", () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Error 500" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar");
    expect(screen.getByText("Error 500")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("ErrorState avisa cuando no hay conexión", () => {
    const spy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<ErrorState message="Failed to fetch" onRetry={() => {}} />);
    expect(screen.getByText("Sin conexión")).toBeInTheDocument();
    spy.mockRestore();
  });
});
