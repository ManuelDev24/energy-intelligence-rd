// Presentación del consumo por lecturas (ERD-CONS-01). Puro: convierte lo que envía la API en
// etiquetas y textos locales. Un período sin cobertura es `null` (hueco), nunca 0.
import type { Consumption, ConsumptionBucketItem, ConsumptionComparison, Granularity } from '@energyrd/api-contracts';
import { fmtDate, fmtKwh, fmtMetric, fmtMonth, fmtPeriod } from '@energyrd/core';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dayMonth = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};

/** Etiqueta corta del eje: "4 oct" (día/semana, por su inicio) o "oct 26" (mes). */
export const bucketLabel = (b: ConsumptionBucketItem, g: Granularity) =>
  g === 'month' ? fmtMonth(b.start, { short: true }) : dayMonth(b.start);

/** Etiqueta completa para lectores de pantalla y la tabla de detalle. */
export const bucketLongLabel = (b: ConsumptionBucketItem, g: Granularity) =>
  g === 'day' ? fmtDate(b.start) : g === 'week' ? fmtPeriod(b.start, b.end) : fmtMonth(b.start);

/** Valores numéricos para el gráfico: null se conserva como hueco; "0.00" es un 0 real. */
export const bucketValues = (buckets: readonly ConsumptionBucketItem[]) =>
  buckets.map((b) => (b.kwh === null ? null : Number(b.kwh)));

/** Cobertura 0–1 (texto decimal de la API) -> porcentaje entero 0–100. */
export function coveragePct(ratio: string | number): number {
  const n = Number(ratio);
  return Number.isFinite(n) ? Math.round(Math.min(1, Math.max(0, n)) * 100) : 0;
}

/** Motivo redactado aquí desde `reason_code` (el texto `reason` del servidor no se muestra). */
export function reasonText(b: ConsumptionBucketItem): string | null {
  if (b.kwh === null || b.reason_code === 'no_coverage') return 'Sin lecturas que cubran este período (no es 0).';
  if (b.reason_code === 'partial_coverage') return `Cobertura parcial (${coveragePct(b.coverage_ratio)}%): puede estar subestimado.`;
  return null;
}

export const bucketValueText = (b: ConsumptionBucketItem) => (b.kwh === null ? 'sin dato' : fmtKwh(b.kwh));

const SUMMARY_LIMIT = 31;
/** Resumen accesible del gráfico; con más de 31 barras se resume (no se leen 300 valores). */
export function chartSummary(buckets: readonly ConsumptionBucketItem[], g: Granularity): string {
  if (buckets.length > SUMMARY_LIMIT) {
    const gaps = buckets.filter((b) => b.kwh === null).length;
    return `${buckets.length} períodos, ${gaps} sin dato. Consulte el detalle por período.`;
  }
  return buckets
    .map((b) => `${bucketLongLabel(b, g)}: ${bucketValueText(b)}${b.quality === 'ESTIMATED' ? ' estimado' : ''}`)
    .join('; ');
}

export type ComparisonTone = 'warning' | 'success' | 'neutral';
export interface ComparisonView {
  text: string;
  icon: 'arrow-up' | 'arrow-down' | 'remove';
  tone: ComparisonTone;
}

/**
 * Nota compacta de comparación vs. el período anterior equivalente (CH-03). Un aumento es
 * desfavorable (tono de advertencia); una disminución usa el tono positivo de la app (no verde
 * genérico, el mismo "éxito" de metas). `null` = sin suficiente historial: no se muestra nada.
 */
export function comparisonView(c: ConsumptionComparison | null | undefined): ComparisonView | null {
  if (!c) return null;
  const delta = Number(c.kwh_delta.value);
  const tone: ComparisonTone = delta > 0 ? 'warning' : delta < 0 ? 'success' : 'neutral';
  const icon: ComparisonView['icon'] = delta > 0 ? 'arrow-up' : delta < 0 ? 'arrow-down' : 'remove';
  if (c.kwh_pct === null) {
    const deltaText = fmtMetric(c.kwh_delta.value, c.kwh_delta.unit, { signed: true });
    return { text: `${deltaText} vs. período anterior (no se pudo calcular el porcentaje)`, icon, tone };
  }
  const pctText = fmtMetric(c.kwh_pct.value, c.kwh_pct.unit, { signed: true });
  return { text: `${pctText} vs. período anterior`, icon, tone };
}

/** Avisos de la pantalla, calculados localmente a partir de los datos (no del texto del servidor). */
export function consumptionNotices(c: Pick<Consumption, 'totals' | 'buckets'>) {
  return {
    noData: c.totals.kwh === null,
    gaps: c.buckets.filter((b) => b.kwh === null).length,
    partial: c.buckets.filter((b) => b.kwh !== null && b.reason_code === 'partial_coverage').length,
    coverage: coveragePct(c.totals.coverage_ratio),
  };
}
