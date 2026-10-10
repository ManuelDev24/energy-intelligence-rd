import type { Anomaly } from '@energyrd/api-contracts';
import { fmtPeriod } from './format';
import { addDays } from './insights';

export type FormattedAnomaly = {
  observed: string;
  baseline: string;
  delta: string;
  period: string;
  explanation: string;
};

/** Presentation only: API decimal strings are preserved; no anomaly math is performed here. */
export function formatAnomaly(record: Anomaly): FormattedAnomaly {
  const delta = record.delta_pct.startsWith('-') || record.delta_pct.startsWith('+') ? record.delta_pct : `+${record.delta_pct}`;
  return {
    observed: `${record.observed_kwh} kWh`,
    baseline: `${record.baseline_kwh} kWh`,
    delta: `${delta}%`,
    period: fmtPeriod(record.period_start, record.period_end),
    explanation: record.explanation,
  };
}

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
