import type { Consumption, ConsumptionBucketItem, ConsumptionComparison, Metric } from '@energyrd/api-contracts';
import { describe, expect, it } from 'vitest';

import { bucketLabel, bucketLongLabel, bucketValues, chartSummary, comparisonView, consumptionNotices, coveragePct, reasonText } from './model';

const b = (start: string, end: string, kwh: string | null, extra: Partial<ConsumptionBucketItem> = {}): ConsumptionBucketItem => ({
  start, end, kwh,
  quality: kwh === null ? null : 'REAL',
  coverage_ratio: kwh === null ? '0' : '1',
  reason_code: kwh === null ? 'no_coverage' : null,
  reason: kwh === null ? 'texto del servidor' : null,
  ...extra,
});

describe('modelo de consumo', () => {
  it('etiquetas cortas del eje por granularidad', () => {
    expect(bucketLabel(b('2026-10-04', '2026-10-04', '1'), 'day')).toBe('4 oct');
    expect(bucketLabel(b('2026-09-28', '2026-10-04', '1'), 'week')).toBe('28 sep');
    expect(bucketLabel(b('2026-10-01', '2026-10-31', '1'), 'month')).toBe('oct 26');
  });

  it('etiquetas largas para lectores de pantalla', () => {
    expect(bucketLongLabel(b('2026-10-04', '2026-10-04', '1'), 'day')).toBe('4 oct 2026');
    expect(bucketLongLabel(b('2026-09-28', '2026-10-04', '1'), 'week')).toBe('28 sep – 4 oct 2026');
    expect(bucketLongLabel(b('2026-10-01', '2026-10-31', '1'), 'month')).toBe('oct 2026');
  });

  it('un período sin datos es null (hueco), nunca 0; un 0 real se conserva', () => {
    expect(bucketValues([b('2026-10-01', '2026-10-01', null), b('2026-10-02', '2026-10-02', '0.00'), b('2026-10-03', '2026-10-03', '12.5')]))
      .toEqual([null, 0, 12.5]);
  });

  it('el motivo se redacta localmente desde reason_code (no se muestra el texto del servidor)', () => {
    expect(reasonText(b('2026-10-01', '2026-10-01', null))).toMatch(/sin lecturas/i);
    expect(reasonText(b('2026-10-01', '2026-10-01', null))).not.toContain('servidor');
    expect(reasonText(b('2026-10-01', '2026-10-01', '3', { quality: 'ESTIMATED', coverage_ratio: '0.5', reason_code: 'partial_coverage' })))
      .toBe('Cobertura parcial (50%): puede estar subestimado.');
    expect(reasonText(b('2026-10-01', '2026-10-01', '3'))).toBeNull();
  });

  it('coveragePct redondea y acota 0–100', () => {
    expect(coveragePct('0.8333')).toBe(83);
    expect(coveragePct('1.2')).toBe(100);
    expect(coveragePct('abc')).toBe(0);
  });

  it('resumen accesible: valor, calidad estimada y huecos con palabra, no solo color', () => {
    const text = chartSummary([b('2026-10-01', '2026-10-01', '4'), b('2026-10-02', '2026-10-02', null),
      b('2026-10-03', '2026-10-03', '2', { quality: 'ESTIMATED', coverage_ratio: '0.5', reason_code: 'partial_coverage' })], 'day');
    expect(text).toBe('1 oct 2026: 4 kWh; 2 oct 2026: sin dato; 3 oct 2026: 2 kWh estimado');
  });

  it('series largas se resumen para no leer 300 valores', () => {
    const many = Array.from({ length: 40 }, (_, i) => b(`2026-01-${String((i % 28) + 1).padStart(2, '0')}`, '2026-01-01', i % 10 === 0 ? null : '1'));
    expect(chartSummary(many, 'day')).toBe('40 períodos, 4 sin dato. Consulte el detalle por período.');
  });

  it('avisos locales: sin lecturas y cobertura parcial', () => {
    const base = { totals: { kwh: null, covered_days: '0', coverage_ratio: '0' }, buckets: [b('2026-10-01', '2026-10-01', null)] } as unknown as Consumption;
    expect(consumptionNotices(base)).toEqual({ noData: true, gaps: 1, partial: 0, coverage: 0 });
    const partial = {
      totals: { kwh: { value: '5', unit: 'kWh', quality: 'ESTIMATED' }, covered_days: '1.5', coverage_ratio: '0.5' },
      buckets: [b('2026-10-01', '2026-10-01', null), b('2026-10-02', '2026-10-02', '5', { quality: 'ESTIMATED', coverage_ratio: '0.5', reason_code: 'partial_coverage' })],
    } as unknown as Consumption;
    expect(consumptionNotices(partial)).toEqual({ noData: false, gaps: 1, partial: 1, coverage: 50 });
  });

  const metric = (value: string): Metric => ({ value, unit: 'kWh', quality: 'REAL' });
  const comparison = (overrides: Partial<ConsumptionComparison> = {}): ConsumptionComparison => ({
    previous_from: '2026-08-01',
    previous_to: '2026-08-31',
    previous_kwh: metric('100'),
    kwh_delta: metric('10'),
    kwh_pct: { value: '10', unit: '%', quality: 'REAL' },
    ...overrides,
  });

  it('comparisonView: aumento vs. período anterior usa tono de advertencia y flecha arriba', () => {
    const v = comparisonView(comparison({ kwh_delta: metric('10'), kwh_pct: { value: '10', unit: '%', quality: 'REAL' } }));
    expect(v).not.toBeNull();
    expect(v?.tone).toBe('warning');
    expect(v?.icon).toBe('arrow-up');
    expect(v?.text).toBe('+10.00% vs. período anterior');
  });

  it('comparisonView: disminución vs. período anterior usa tono positivo y flecha abajo', () => {
    const v = comparisonView(comparison({ kwh_delta: metric('-10'), kwh_pct: { value: '-10', unit: '%', quality: 'REAL' } }));
    expect(v).not.toBeNull();
    expect(v?.tone).toBe('success');
    expect(v?.icon).toBe('arrow-down');
    expect(v?.text).toBe('−10.00% vs. período anterior');
  });

  it('comparisonView: kwh_pct null muestra el delta en kWh y aclara que no se pudo calcular el porcentaje', () => {
    const v = comparisonView(comparison({ kwh_delta: metric('5'), kwh_pct: null }));
    expect(v).not.toBeNull();
    expect(v?.tone).toBe('warning');
    expect(v?.icon).toBe('arrow-up');
    expect(v?.text).toBe('+5 kWh vs. período anterior (no se pudo calcular el porcentaje)');
  });

  it('comparisonView: comparison null no produce nada que mostrar', () => {
    expect(comparisonView(null)).toBeNull();
  });
});
