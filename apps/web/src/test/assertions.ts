import { screen, within } from "@testing-library/react";
import { expect } from "vitest";
import { formatMetric } from "@/lib/format";
import { collectMetrics } from "./render";

interface DashboardPayload {
  projection: { note: string } | null;
  alert: { message: string } | null;
  recommendation: string | null;
  quality_legend: Record<string, string>;
}

// El dashboard renderizado debe contener, sin cambios, lo que entregó el backend:
// cada métrica con su valor (mismos dígitos) y su etiqueta de calidad, y los textos
// que redacta el backend (proyección, aviso, recomendación, leyenda).
export function expectDashboardRendered(raw: DashboardPayload) {
  const metrics = collectMetrics(raw);
  for (const m of metrics) {
    const matches = screen.getAllByText(formatMetric(m.value, m.unit));
    const rows = matches.map((el) => el.parentElement as HTMLElement);
    expect(
      rows.some((row) => within(row).queryByText(m.quality) !== null),
      `${m.value} ${m.unit} debe mostrarse con la etiqueta ${m.quality}`,
    ).toBe(true);
  }

  if (raw.projection) expect(screen.getByText(raw.projection.note)).toBeInTheDocument();
  if (raw.alert) expect(screen.getByText(raw.alert.message)).toBeInTheDocument();
  if (raw.recommendation) expect(screen.getByText(raw.recommendation)).toBeInTheDocument();
  for (const text of Object.values(raw.quality_legend)) {
    expect(screen.getByText(text)).toBeInTheDocument();
  }
  return metrics.length;
}
