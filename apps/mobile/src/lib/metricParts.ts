// Separa un Metric de la API en valor + unidad para MetricCard (el número grande y la unidad pequeña).
// Solo formato: el valor es el que envía la API, sin recalcular.
import { fmtDop, fmtNumber, fmtPct, fmtSmart } from '@energyrd/core';

export function metricParts(value: string | number, unit: string): { value: string; unit?: string } {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return { value: '—', unit: unit || undefined };
  switch (unit) {
    case 'RD$':
      return { value: fmtDop(n) };
    case 'RD$/kWh':
      return { value: `RD$ ${fmtNumber(n, 2)}`, unit: 'por kWh' };
    case '%':
      return { value: fmtPct(n, { signed: false }) };
    case 'kWh':
      return { value: fmtSmart(n), unit: 'kWh' };
    case 'kWh/día':
    case 'kWh/mes':
      return { value: fmtNumber(n, 2), unit };
    default:
      return { value: fmtNumber(n), unit: unit || undefined };
  }
}
