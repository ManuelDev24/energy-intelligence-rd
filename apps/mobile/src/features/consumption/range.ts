// Rangos predefinidos de la pestaña Consumo. Puro (sin React Native), probado con vitest.
import type { Granularity } from '@energyrd/api-contracts';

import { addDays } from '../../lib/rdTime';

/** Límite de la API (`GET /consumption`): rango inclusivo de hasta 366 días. */
export const MAX_RANGE_DAYS = 366;

export type PresetKey = '7d' | '30d' | '12m';
export const PRESETS: readonly { key: PresetKey; label: string; granularity: Granularity }[] = [
  { key: '7d', label: '7 días', granularity: 'day' },
  { key: '30d', label: '30 días', granularity: 'day' },
  { key: '12m', label: '12 meses', granularity: 'month' },
];

export const GRANULARITIES: readonly { key: Granularity; label: string }[] = [
  { key: 'day', label: 'Día' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
];

/**
 * Rango inclusivo que termina hoy (fecha local RD). 12 meses empieza el día 1 del mes de hace
 * 11 meses, así cada barra mensual es un mes de calendario completo (≤ 366 días).
 */
export function rangeForPreset(preset: PresetKey, today: string): { from: string; to: string } {
  if (preset === '7d') return { from: addDays(today, -6), to: today };
  if (preset === '30d') return { from: addDays(today, -29), to: today };
  const [y, m] = today.split('-').map(Number);
  const index = y * 12 + (m - 1) - 11;
  const from = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
  return { from, to: today };
}
