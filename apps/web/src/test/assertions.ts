import { screen } from "@testing-library/react";
import { expect } from "vitest";

interface RawMetric {
  value: string;
  unit: string;
  quality: string;
}
export interface RawBillLike {
  period_end: string;
  kwh: string;
  amount_dop: string;
}
export interface RawDashboardLike {
  projection: { kwh: RawMetric; amount_dop: RawMetric; note: string } | null;
  alert: { message: string } | null;
  recommendation: string | null;
}

// Misma presentación que EnergyDashboard (es-DO, hasta 2 decimales).
const shown = (value: string) =>
  new Intl.NumberFormat("es-DO", { maximumFractionDigits: 2 }).format(Number(value));

// El dashboard renderizado debe mostrar, sin cambios, lo que entregó el backend:
// kWh y RD$ de la factura más reciente, la proyección con sus etiquetas de calidad,
// y los textos que redacta el backend (nota, aviso, recomendación).
export function expectDashboardRendered(raw: RawDashboardLike, bills: RawBillLike[]) {
  const latest = [...bills].sort((a, b) => b.period_end.localeCompare(a.period_end))[0];
  expect(latest, "la vivienda debe tener al menos una factura").toBeDefined();

  expect(
    screen.getAllByText(`${shown(latest.kwh)} kWh`, { selector: "strong" }).length,
    `kWh de la última factura (${latest.kwh})`,
  ).toBeGreaterThan(0);
  expect(screen.getAllByText(`Importe facturado: RD$ ${shown(latest.amount_dop)} · REAL`).length).toBe(1);

  const p = raw.projection;
  if (p) {
    expect(screen.getAllByText(`${shown(p.kwh.value)} ${p.kwh.unit}`, { selector: "strong" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(p.kwh.quality).length).toBeGreaterThan(0);
    expect(screen.getByText(`${shown(p.amount_dop.value)} ${p.amount_dop.unit} · ${p.amount_dop.quality}`)).toBeInTheDocument();
    expect(screen.getByText(p.note)).toBeInTheDocument();
  } else {
    expect(screen.getByText("No hay datos suficientes para proyectar.")).toBeInTheDocument();
  }

  if (raw.alert) expect(screen.getByText(raw.alert.message)).toBeInTheDocument();
  else expect(screen.getByText("No hay alertas disponibles.")).toBeInTheDocument();

  if (raw.recommendation) expect(screen.getByText(raw.recommendation)).toBeInTheDocument();
  else expect(screen.getByText("No hay recomendaciones disponibles.")).toBeInTheDocument();
}
