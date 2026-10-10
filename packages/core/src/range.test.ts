import { describe, expect, it } from 'vitest';
import { MAX_RANGE_DAYS, isIsoDate, presetRange, rangeDays, validateRange } from './range';

describe('rango de fechas compartido (web y móvil)', () => {
  it('valida fechas ISO reales, no solo el formato', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
    for (const bad of ['2026-02-30', '2026-13-01', '2026-1-01', '', 'hoy', '2026-02-28T00:00:00Z']) expect(isIsoDate(bad)).toBe(false);
  });
  it('cuenta los días con ambos extremos incluidos, como la API', () => {
    expect(rangeDays('2026-08-01', '2026-08-31')).toBe(31);
    expect(rangeDays('2026-10-04', '2026-10-04')).toBe(1);
    expect(rangeDays('2025-10-10', '2026-10-10')).toBe(366);
  });
  it('acepta rangos válidos y rechaza los que la API rechazaría', () => {
    expect(validateRange('2026-09-01', '2026-09-30')).toBeNull();
    expect(validateRange('2026-09-01', '2026-09-01')).toBeNull();
    expect(validateRange('', '2026-09-30')).toMatch(/dos fechas/);
    expect(validateRange('2026-09-01', '2026-02-30')).toMatch(/dos fechas/);
    expect(validateRange('2026-09-30', '2026-09-01')).toMatch(/igual o anterior/);
    expect(validateRange('2025-01-01', '2026-01-01')).toBeNull();         // 366 días
    expect(validateRange('2025-01-01', '2026-01-02')).toMatch(new RegExp(`${MAX_RANGE_DAYS} días`));
  });
  it('el límite coincide con el de la API (366)', () => expect(MAX_RANGE_DAYS).toBe(366));
  it('los atajos terminan hoy y respetan el límite', () => {
    expect(presetRange('7d', '2026-10-10')).toEqual({ from: '2026-10-04', to: '2026-10-10', granularity: 'day' });
    expect(presetRange('30d', '2026-10-10')).toEqual({ from: '2026-09-11', to: '2026-10-10', granularity: 'day' });
    expect(presetRange('12m', '2026-10-10')).toEqual({ from: '2025-11-01', to: '2026-10-10', granularity: 'month' });
    for (const today of ['2026-01-31', '2026-03-01', '2024-02-29', '2026-12-31']) {
      for (const preset of ['7d', '30d', '12m'] as const) {
        const r = presetRange(preset, today);
        expect(validateRange(r.from, r.to), `${preset} ${today}`).toBeNull();
        expect(r.to).toBe(today);
      }
    }
  });
  it('12 meses cruza el año sin errores de índice', () => {
    expect(presetRange('12m', '2026-01-15').from).toBe('2025-02-01');
    expect(presetRange('12m', '2026-12-01').from).toBe('2026-01-01');
  });
});
