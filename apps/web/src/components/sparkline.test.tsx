import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricCard } from "@/components/metric-card";
import { Sparkline } from "@/components/sparkline";

const trend = (values: number[]) => ({ values, label: "consumo", format: (n: number) => `${n} kWh` });

describe("Sparkline (ERD-CHARTS-01)", () => {
  it("describe la tendencia con texto, no solo con la forma", () => {
    render(<Sparkline trend={trend([100, 150, 200])} />);
    expect(screen.getByRole("img", { name: "Tendencia de consumo en las últimas 3 facturas: subió, de 100 kWh a 200 kWh." })).toBeInTheDocument();
  });
  it("con menos de 3 facturas reales no dibuja nada", () => {
    const { container } = render(<Sparkline trend={trend([100, 200])} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("la tarjeta de métrica la muestra solo cuando recibe tendencia", () => {
    const { rerender } = render(<MetricCard label="Consumo" value="200" trend={trend([100, 150, 200])} />);
    expect(screen.getByRole("img", { name: /Tendencia de consumo/ })).toBeInTheDocument();
    rerender(<MetricCard label="Consumo" value="200" />);
    expect(screen.queryByRole("img")).toBeNull();
  });
});
