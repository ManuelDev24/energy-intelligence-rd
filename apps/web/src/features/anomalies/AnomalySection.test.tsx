import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnomalySection } from "./AnomalySection";

const anomaly = {
  home_id: "00000000-0000-0000-0000-000000000001",
  granularity: "month" as const,
  severity: "critical" as const,
  observed_kwh: "510.25",
  baseline_kwh: "400.00",
  delta_pct: "27.56",
  period_start: "2026-09-01",
  period_end: "2026-09-30",
  explanation: "El consumo observado supera la línea base histórica.",
};

describe("AnomalySection", () => {
  it("renders severity, observed versus baseline, period and explanation", () => {
    render(<AnomalySection anomalies={[anomaly]} />);
    expect(screen.getByRole("article", { name: /Crítica: Consumo fuera de lo habitual/ })).toHaveTextContent("510.25 kWh");
    expect(screen.getByText(/400.00 kWh/)).toBeInTheDocument();
    expect(screen.getByText("+27.56%")).toBeInTheDocument();
    expect(screen.getByText(anomaly.explanation)).toBeInTheDocument();
  });

  it("uses a calm empty state", () => {
    render(<AnomalySection anomalies={[]} />);
    expect(screen.getByText("Sin desviaciones recientes")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
