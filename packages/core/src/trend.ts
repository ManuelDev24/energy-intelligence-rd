import type { ChartBar } from './insights';

/** Mínimo de facturas reales para dibujar una tendencia: con 2 puntos solo hay una diferencia, no una tendencia. */
export const MIN_TREND_POINTS = 3;

export interface Sparkline {
  /** Coordenadas normalizadas: x e y en [0, 1], con y = 0 arriba (el valor más alto). */
  points: { x: number; y: number }[];
  first: number;
  last: number;
  min: number;
  max: number;
}

/** Valores de las facturas REALES (nunca la proyección) en orden cronológico. */
export function trendValues(series: readonly ChartBar[], field: 'kwh' | 'amountDop'): number[] {
  const values: number[] = [];
  for (const bar of series) {
    if (bar.kind !== 'REAL') continue;
    const v = bar[field];
    if (v !== null && Number.isFinite(v)) values.push(v);
  }
  return values;
}

/** Geometría de una mini-tendencia; `null` si no hay suficientes puntos reales (no se interpola ni se inventa). */
export function sparkline(values: readonly number[]): Sparkline | null {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < MIN_TREND_POINTS) return null;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min;
  return {
    points: clean.map((v, i) => ({ x: i / (clean.length - 1), y: span === 0 ? 0.5 : 1 - (v - min) / span })),
    first: clean[0],
    last: clean[clean.length - 1],
    min,
    max,
  };
}

/** Descripción para lectores de pantalla: la tendencia nunca depende solo de la forma o el color. */
export function sparklineSummary(label: string, line: Sparkline, format: (n: number) => string): string {
  const direction = line.last > line.first ? 'subió' : line.last < line.first ? 'bajó' : 'se mantuvo';
  return `Tendencia de ${label} en las últimas ${line.points.length} facturas: ${direction}, de ${format(line.first)} a ${format(line.last)}.`;
}
