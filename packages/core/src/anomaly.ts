import type { Anomaly } from '@energyrd/api-contracts';
import { fmtPeriod } from './format';
import { addDays } from './insights';

export type FormattedAnomaly = {
  title: string;
  confidence: string;
  confidenceHelp: string;
  observed: string;
  baseline: string;
  baselineLabel: string;
  /** `null` cuando la API no da variación porcentual (anomalía nocturna). */
  delta: string | null;
  period: string;
  explanation: string;
};

/** Titular por tipo de hallazgo. El texto largo (la explicación) lo escribe la API. */
export const ANOMALY_TITLE: Record<Anomaly['kind'], string> = {
  increase: 'Consumo más alto de lo habitual',
  drop: 'Consumo más bajo de lo habitual',
  peak: 'Pico de consumo en un día',
  night: 'Consumo nocturno alto',
};

export const CONFIDENCE_TEXT: Record<Anomaly['confidence'], string> = {
  high: 'Confianza alta', medium: 'Confianza media', low: 'Confianza baja',
};

export const CONFIDENCE_HELP: Record<Anomaly['confidence'], string> = {
  high: 'Hay historial suficiente, datos medidos y una comparación estable.',
  medium: 'Hay historial, pero falta alguno de estos: cobertura completa, datos medidos o estabilidad.',
  low: 'Hay poco historial o los datos son parciales o repartidos entre días. Tómelo como una pista, no como un hecho.',
};

/** Presentation only: API decimal strings are preserved; no anomaly math is performed here. */
export function formatAnomaly(record: Anomaly): FormattedAnomaly {
  const delta = record.delta_pct === null ? null : record.delta_pct.startsWith('-') || record.delta_pct.startsWith('+') ? record.delta_pct : `+${record.delta_pct}`;
  return {
    title: ANOMALY_TITLE[record.kind],
    confidence: CONFIDENCE_TEXT[record.confidence],
    confidenceHelp: CONFIDENCE_HELP[record.confidence],
    observed: `${record.observed_kwh} kWh`,
    baseline: `${record.baseline_kwh} kWh`,
    baselineLabel: record.kind === 'night' ? 'Al ritmo promedio' : 'Línea base',
    delta: delta === null ? null : `${delta}%`,
    period: fmtPeriod(record.period_start, record.period_end),
    explanation: record.explanation,
  };
}

/** Solo lo detectado por lecturas se puede investigar en Consumo; lo de facturas se revisa en la factura. */
export const canInvestigate = (record: Pick<Anomaly, 'source' | 'granularity'>) => record.source === 'readings' && record.granularity !== 'billing';

/**
 * Rango de Consumo (por lecturas) para investigar una desviación: un día se ve con las dos semanas que terminan ese día;
 * un mes se desglosa día a día. Solo aritmética de calendario; no recalcula la anomalía.
 */
export function investigationRange(record: Pick<Anomaly, 'granularity' | 'period_start' | 'period_end'>): {
  from: string; to: string; granularity: 'day';
} {
  if (record.granularity === 'month') return { from: record.period_start, to: record.period_end, granularity: 'day' };
  return { from: addDays(record.period_end, -13), to: record.period_end, granularity: 'day' };
}
