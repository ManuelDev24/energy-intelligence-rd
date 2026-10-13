import { describe, expect, it } from 'vitest';

import { inclusiveDays } from '../../lib/billForm';
import { MAX_RANGE_DAYS, PRESETS, initialRangeFromParams, rangeForPreset } from './range';

describe('rangos predefinidos de consumo', () => {
  it('7 días y 30 días terminan hoy e incluyen hoy', () => {
    expect(rangeForPreset('7d', '2026-10-04')).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(rangeForPreset('30d', '2026-10-04')).toEqual({ from: '2026-09-05', to: '2026-10-04' });
    expect(inclusiveDays('2026-09-28', '2026-10-04')).toBe(7);
    expect(inclusiveDays('2026-09-05', '2026-10-04')).toBe(30);
  });

  it('12 meses empieza el día 1 del mes de hace 11 meses (meses completos)', () => {
    expect(rangeForPreset('12m', '2026-10-04')).toEqual({ from: '2025-11-01', to: '2026-10-04' });
    expect(rangeForPreset('12m', '2026-01-15')).toEqual({ from: '2025-02-01', to: '2026-01-15' });
  });

  it('nunca excede el máximo de la API (366 días), incluso a fin de mes en año bisiesto', () => {
    for (const today of ['2026-10-31', '2028-02-29', '2027-12-31', '2028-12-31']) {
      const r = rangeForPreset('12m', today);
      expect(inclusiveDays(r.from, r.to)).toBeLessThanOrEqual(MAX_RANGE_DAYS);
    }
  });

  it('cada rango sugiere una granularidad que se lee bien', () => {
    expect(PRESETS.map((p) => [p.key, p.granularity])).toEqual([['7d', 'day'], ['30d', 'day'], ['12m', 'month']]);
    expect(PRESETS.map((p) => p.label)).toEqual(['7 días', '30 días', '12 meses']);
  });
});

describe('rango inicial desde parámetros de navegación (ERD-CHARTS-01)', () => {
  it('acepta un rango válido', () => {
    expect(initialRangeFromParams({ from: '2026-09-21', to: '2026-10-04', granularity: 'day' })).toEqual({ from: '2026-09-21', to: '2026-10-04', granularity: 'day' });
  });
  it.each([
    [undefined, 'sin parámetros'],
    [{}, 'vacío'],
    [{ from: '2026-09-21', to: '2026-10-04' }, 'sin granularidad'],
    [{ from: '2026-09-21', to: '2026-10-04', granularity: 'hour' }, 'granularidad desconocida'],
    [{ from: '2026-10-04', to: '2026-09-21', granularity: 'day' }, 'invertido'],
    [{ from: '2024-01-01', to: '2026-10-04', granularity: 'day' }, 'más de 366 días'],
    [{ from: '2026-02-30', to: '2026-03-04', granularity: 'day' }, 'fecha inexistente'],
    [{ from: 20260921, to: '2026-10-04', granularity: 'day' }, 'tipo incorrecto'],
  ])('rechaza %j (%s) sin adivinar', (params, _why) => {
    expect(initialRangeFromParams(params as never)).toBeNull();
  });
});
