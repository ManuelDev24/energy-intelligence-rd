import type { Anomaly } from '@energyrd/api-contracts';
import { fmtPeriod } from './format';

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
