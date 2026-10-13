import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnomalySection } from "./AnomalySection";

const HOME = "00000000-0000-0000-0000-000000000001";
const anomaly = {
  id: "00000000-0000-0000-0000-0000000000a1", home_id: HOME, bill_id: null, kind: "increase" as const, source: "readings" as const,
  granularity: "month" as const, severity: "critical" as const, confidence: "medium" as const, status: "open" as const,
  observed_kwh: "510.25", baseline_kwh: "400.00", delta_pct: "27.56", days: "30.00",
  period_start: "2026-09-01", period_end: "2026-09-30", explanation: "El consumo observado supera la línea base histórica.",
  detected_at: "2026-10-01T12:00:00Z", last_seen_at: "2026-10-02T12:00:00Z",
};
const peak = { ...anomaly, id: "00000000-0000-0000-0000-0000000000a2", kind: "peak" as const, granularity: "day" as const, severity: "warning" as const,
  period_start: "2026-10-04", period_end: "2026-10-04" };
const billAnomaly = { ...anomaly, id: "00000000-0000-0000-0000-0000000000a3", source: "bills" as const, granularity: "billing" as const,
  bill_id: "00000000-0000-0000-0000-0000000000b1" };
const night = { ...anomaly, id: "00000000-0000-0000-0000-0000000000a4", kind: "night" as const, granularity: "day" as const, severity: "info" as const,
  delta_pct: null, period_start: "2026-10-03", period_end: "2026-10-04" };

describe("AnomalySection", () => {
  it("renders severity, title by kind, observed versus baseline, confidence and explanation", () => {
    render(<AnomalySection anomalies={[anomaly]} />);
    expect(screen.getByRole("article", { name: /Crítica: Consumo más alto de lo habitual/ })).toHaveTextContent("510.25 kWh");
    expect(screen.getByText(/Línea base: 400.00 kWh/)).toBeInTheDocument();
    expect(screen.getByText(/Confianza media/)).toBeInTheDocument();
    expect(screen.getByText("+27.56%")).toBeInTheDocument();
    expect(screen.getByText(anomaly.explanation)).toBeInTheDocument();
  });

  it("each kind has its own title, and a night anomaly shows no percentage", () => {
    render(<AnomalySection anomalies={[peak, night]} />);
    expect(screen.getByRole("article", { name: /Pico de consumo en un día/ })).toBeInTheDocument();
    const nightCard = screen.getByRole("article", { name: /Consumo nocturno alto/ });
    expect(nightCard).toHaveTextContent("Al ritmo promedio");
    expect(nightCard).not.toHaveTextContent("%");
  });

  it("uses a calm empty state", () => {
    render(<AnomalySection anomalies={[]} />);
    expect(screen.getByText("Sin desviaciones recientes")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ERD-CHARTS-01: lo detectado por lecturas se investiga en Consumo con el rango correcto", () => {
    render(<AnomalySection anomalies={[anomaly, peak]} />);
    const links = screen.getAllByRole("link", { name: /Investigar en Consumo/ });
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/consumption?from=2026-09-01&to=2026-09-30&granularity=day",
      "/consumption?from=2026-09-21&to=2026-10-04&granularity=day",
    ]);
  });

  it("lo detectado por facturas lleva a la factura, no a Consumo", () => {
    render(<AnomalySection anomalies={[billAnomaly]} />);
    expect(screen.queryByRole("link", { name: /Investigar en Consumo/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver la factura/ })).toHaveAttribute("href", "/bills/00000000-0000-0000-0000-0000000000b1");
  });

  it("sin desviaciones no hay enlace que investigar", () => {
    render(<AnomalySection anomalies={[]} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("Descartar avisa con la desviación elegida y se desactiva mientras guarda", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<AnomalySection anomalies={[anomaly, peak]} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /Descartar la desviación de 4 oct 2026/ }));
    expect(onDismiss).toHaveBeenCalledWith(peak);
    rerender(<AnomalySection anomalies={[anomaly, peak]} onDismiss={onDismiss} pendingId={peak.id} />);
    expect(screen.getByRole("button", { name: /Descartar la desviación de 4 oct 2026/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Descartar la desviación de 1–30 sep 2026/ })).toBeEnabled();
  });

  it("sin acción de descarte no se muestra el botón", () => {
    render(<AnomalySection anomalies={[anomaly]} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
