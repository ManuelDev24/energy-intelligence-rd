import { describe, expect, it } from 'vitest';

import {
  QUALITY, SEVERITY, daysBetween, fmtDate, fmtDop, fmtKwh, fmtMetric, fmtMonth, fmtNumber, fmtPct, fmtPeriod,
  fmtSigned, monthlySeries, projectionDeltaPct, resolutionLabel, shouldLabel, sourceLabel, suggestNextPeriod,
} from './index';

describe('format', () => {
  it('groups thousands deterministically', () => {
    expect(fmtNumber('5600')).toBe('5,600.00');
    expect(fmtNumber(1234567.891, 1)).toBe('1,234,567.9');
    expect(fmtNumber('-1000')).toBe('-1,000.00');
    expect(fmtNumber('abc')).toBe('—');
  });
  it('money is always prefixed RD$', () => {
    expect(fmtDop('5600')).toBe('RD$ 5,600.00');
    expect(fmtDop(-10)).toBe('−RD$ 10.00');
  });
  it('kWh drops useless decimals', () => {
    expect(fmtKwh('400.00')).toBe('400 kWh');
    expect(fmtKwh('12.9')).toBe('12.90 kWh');
  });
  it('signed values and percentages', () => {
    expect(fmtSigned(160)).toBe('+160.00');
    expect(fmtSigned('-10.87')).toBe('−10.87');
    expect(fmtSigned(0)).toBe('0.00');
    expect(fmtPct('66.67')).toBe('+66.67%');
    expect(fmtPct('78.98', { signed: false })).toBe('78.98%');
  });
  it('formats API metrics by unit', () => {
    expect(fmtMetric('5600.00', 'RD$')).toBe('RD$ 5,600.00');
    expect(fmtMetric('2150.00', 'RD$', { signed: true })).toBe('+RD$ 2,150.00');
    expect(fmtMetric('160.00', 'kWh', { signed: true })).toBe('+160 kWh');
    expect(fmtMetric('50.00', '%', { signed: true })).toBe('+50.00%');
    expect(fmtMetric('13.33', 'RD$/kWh')).toBe('RD$ 13.33/kWh');
    expect(fmtMetric('13.548', 'kWh/día')).toBe('13.55 kWh/día');
  });
  it('dates and periods without timezone drift', () => {
    expect(fmtDate('2026-08-01')).toBe('1 ago 2026');
    expect(fmtPeriod('2026-08-01', '2026-08-31')).toBe('1–31 ago 2026');
    expect(fmtPeriod('2026-07-15', '2026-08-14')).toBe('15 jul – 14 ago 2026');
    expect(fmtPeriod('2025-12-15', '2026-01-14')).toBe('15 dic 2025 – 14 ene 2026');
    expect(fmtMonth('2026-08-31')).toBe('ago 2026');
    expect(fmtMonth('2026-08-31', { short: true })).toBe('ago 26');
  });
});

describe('quality', () => {
  it('labels in Spanish and only non-REAL values', () => {
    expect(QUALITY.ESTIMATED.label).toBe('ESTIMADO');
    expect(QUALITY.PROJECTED.label).toBe('PROYECTADO');
    expect(shouldLabel('REAL')).toBe(false);
    expect(shouldLabel('ESTIMATED')).toBe(true);
  });
  it('critical and warning look different', () => {
    expect(SEVERITY.critical.fg).not.toBe(SEVERITY.warning.fg);
    expect(SEVERITY.critical.label).toBe('Alerta crítica');
  });
  it('labels INFERRED and offers the four plan severities', () => {
    expect(QUALITY.INFERRED.label).toBe('INFERIDO');
    expect(shouldLabel('INFERRED')).toBe(true);
    expect(Object.keys(SEVERITY).sort()).toEqual(['critical', 'info', 'savings', 'warning']);
    expect(new Set(Object.values(SEVERITY).map((s) => s.fg)).size).toBe(4);
  });
  it('every badge and severity text passes WCAG AA (4.5:1) on its own background', () => {
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const p of [...Object.values(QUALITY), ...Object.values(SEVERITY)]) {
      expect(ratio(p.fg, p.bg), `${p.label} ${p.fg}/${p.bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('translates API enums', () => {
    expect(sourceLabel('seed')).toBe('demo');
    expect(resolutionLabel('monthly')).toBe('mensual');
    expect(sourceLabel('otro')).toBe('otro');
  });
});

describe('insights', () => {
  const bills = [
    { id: 'b', period_start: '2026-07-01', period_end: '2026-07-31', days: 31, kwh: '240', amount_dop: '3050' },
    { id: 'a', period_start: '2026-06-01', period_end: '2026-06-30', days: 30, kwh: '220', amount_dop: '2800' },
  ];
  it('builds a chronological series with the projection last', () => {
    const s = monthlySeries(bills, { kwh: '260', amount_dop: '3300' });
    expect(s.map((b) => b.kind)).toEqual(['REAL', 'REAL', 'PROJECTED']);
    expect(s[0].kwh).toBe(220);
    expect(s[2]).toMatchObject({ kwh: 260, periodEnd: '2026-08-30' });
  });
  it('limits to the last N bills and omits projection without bills', () => {
    expect(monthlySeries(bills, null, 1).map((b) => b.key)).toEqual(['b']);
    expect(monthlySeries([], { kwh: '1' })).toEqual([]);
  });
  it('suggests the next billing period', () => {
    // mes calendario completo -> mes siguiente completo
    expect(suggestNextPeriod(bills[0])).toEqual({ period_start: '2026-08-01', period_end: '2026-08-31', days: 31 });
    expect(suggestNextPeriod({ period_start: '2026-08-01', period_end: '2026-08-31', days: 31 })).toEqual({
      period_start: '2026-09-01', period_end: '2026-09-30', days: 30,
    });
    // ciclo que no coincide con el mes -> misma duración
    expect(suggestNextPeriod({ period_start: '2026-07-15', period_end: '2026-08-14', days: 31 })).toEqual({
      period_start: '2026-08-15', period_end: '2026-09-14', days: 31,
    });
    expect(suggestNextPeriod(null, new Date(Date.UTC(2026, 9, 4)))).toEqual({
      period_start: '2026-09-01', period_end: '2026-09-30', days: 30,
    });
  });
  it('day counts are inclusive', () => {
    expect(daysBetween('2026-08-01', '2026-08-31')).toBe(31);
    expect(daysBetween('2026-02-01', '2026-02-28')).toBe(28);
  });
  it('projection delta vs last bill', () => {
    expect(projectionDeltaPct('486.67', '420')).toBe(15.87);
    expect(projectionDeltaPct('10', '0')).toBeNull();
  });
});
