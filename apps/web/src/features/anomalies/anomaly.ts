export { formatAnomaly } from '@energyrd/core';
export type { FormattedAnomaly } from '@energyrd/core';
import { investigationRange } from '@energyrd/core';
import type { Anomaly } from '@/lib/api/schemas';

/** Enlace a «Consumo → Por lecturas» con el rango para investigar la desviación (ERD-CHARTS-01). */
export function investigateHref(anomaly: Pick<Anomaly, 'granularity' | 'period_start' | 'period_end'>): string {
  const { from, to, granularity } = investigationRange(anomaly);
  return `/consumption?from=${from}&to=${to}&granularity=${granularity}`;
}
