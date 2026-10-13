import { sparkline, sparklineSummary } from "@energyrd/core";

export interface TrendInput {
  /** Valores de facturas REALES en orden cronológico (ver `trendValues`). */
  values: readonly number[];
  /** Nombre de la métrica para el lector de pantalla: "consumo", "monto". */
  label: string;
  format: (n: number) => string;
}

const W = 96;
const H = 28;
const PAD = 3;

/** Mini-tendencia de las últimas facturas. Con menos de 3 puntos reales no dibuja nada. */
export function Sparkline({ trend }: { trend: TrendInput }) {
  const line = sparkline(trend.values);
  if (!line) return null;
  const pts = line.points.map((p) => ({ x: PAD + p.x * (W - 2 * PAD), y: PAD + p.y * (H - 2 * PAD) }));
  const last = pts[pts.length - 1];
  return (
    <svg role="img" aria-label={sparklineSummary(trend.label, line, trend.format)} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="text-primary">
      <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last.x} cy={last.y} r={3} fill="currentColor" />
    </svg>
  );
}
