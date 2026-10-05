import { QUALITY, type Quality } from "@energyrd/core";
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

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// El dashboard renderizado debe contener lo que entregó el backend: cada métrica con su valor
// (formato común web/móvil; los deltas llevan signo) y, si NO es REAL, su etiqueta de calidad en
// español junto al valor. Lo REAL no se etiqueta (es el caso normal). También los textos que
// redacta el backend (proyección, aviso, recomendación, leyenda).
export function expectDashboardRendered(raw: DashboardPayload) {
  const metrics = collectMetrics(raw);
  for (const m of metrics) {
    const candidates = [formatMetric(m.value, m.unit), formatMetric(m.value, m.unit, { signed: true })];
    const matches = screen.getAllByText(new RegExp(`^(${candidates.map(escape).join("|")})$`));
    expect(matches.length, `${m.value} ${m.unit} debe mostrarse`).toBeGreaterThan(0);
    const q = m.quality as Quality;
    if (q !== "REAL") {
      const rows = matches.map((el) => el.parentElement as HTMLElement);
      expect(
        rows.some((row) => within(row).queryByText(QUALITY[q].label) !== null),
        `${m.value} ${m.unit} debe mostrarse con la etiqueta ${QUALITY[q].label}`,
      ).toBe(true);
    }
  }

  if (raw.projection) expect(screen.getByText(raw.projection.note)).toBeInTheDocument();
  if (raw.alert) expect(screen.getByText(raw.alert.message)).toBeInTheDocument();
  if (raw.recommendation) expect(screen.getByText(raw.recommendation)).toBeInTheDocument();
  for (const text of Object.values(raw.quality_legend)) {
    expect(screen.getByText(text)).toBeInTheDocument();
  }
  return metrics.length;
}
