// Rangos predefinidos de la pestaña Consumo. Puro (sin React Native), probado con vitest.
import type { Granularity } from '@energyrd/api-contracts';

import { MAX_RANGE_DAYS as CORE_MAX_RANGE_DAYS, presetRange, validateRange } from '@energyrd/core';

/** Límite de la API (`GET /consumption`): rango inclusivo de hasta 366 días (definido en @energyrd/core). */
export const MAX_RANGE_DAYS = CORE_MAX_RANGE_DAYS;
export { validateRange };

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
 * Rango inclusivo que termina hoy (fecha local RD). 12 meses empieza el día 1 del mes de hace 11 meses, así cada barra
 * mensual es un mes de calendario completo (≤ 366 días). La aritmética es la de @energyrd/core (compartida con la web).
 */
export function rangeForPreset(preset: PresetKey, today: string): { from: string; to: string } {
  const { from, to } = presetRange(preset, today);
  return { from, to };
}
