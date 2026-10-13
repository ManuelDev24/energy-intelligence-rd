import { describe, expect, it } from 'vitest';

import {
  QUALITY, SEVERITY, daysBetween, fmtDate, fmtDop, fmtKwh, fmtMetric, fmtMonth, fmtNumber, fmtPct, fmtPeriod,
  billDaysLabel, currentCycle, sparkline, sparklineSummary, trendValues, fmtSigned, investigationRange, monthlySeries, validateRange, resolutionLabel, shouldLabel, sourceLabel, suggestNextPeriod,
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
    expect(fmtPeriod('2026-10-04', '2026-10-04')).toBe('4 oct 2026');
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
  it('real bars carry the billed days; the projection has none (ERD-CHARTS-01)', () => {
    const s = monthlySeries(bills, { kwh: '260' });
    expect(s.map((b) => b.days)).toEqual([30, 31, undefined]);
  });
  it('labels billed days with the right plural', () => {
    expect(billDaysLabel(31)).toBe('31 días');
    expect(billDaysLabel(1)).toBe('1 día');
    expect(billDaysLabel(0)).toBe('0 días');
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
  it('does not derive business metrics: the projection delta comes from the API (ERD-PROJECTION-METRIC-API)', async () => {
    const core = await import('./index');
    expect('projectionDeltaPct' in core).toBe(false);
  });
});

describe('investigar una desviación (ERD-CHARTS-01)', () => {
  const day = { granularity: 'day' as const, period_start: '2026-10-04', period_end: '2026-10-04' };
  const month = { granularity: 'month' as const, period_start: '2026-09-01', period_end: '2026-09-30' };
  it('un día anómalo se estudia con las dos semanas que terminan ese día, en detalle diario', () => {
    expect(investigationRange(day)).toEqual({ from: '2026-09-21', to: '2026-10-04', granularity: 'day' });
  });
  it('un mes anómalo se desglosa día a día dentro de ese mes', () => {
    expect(investigationRange(month)).toEqual({ from: '2026-09-01', to: '2026-09-30', granularity: 'day' });
  });
  it('cruza el cambio de año sin errores y siempre es un rango válido para la API', () => {
    const r = investigationRange({ granularity: 'day', period_start: '2026-01-05', period_end: '2026-01-05' });
    expect(r.from).toBe('2025-12-23');
    for (const input of [day, month, { granularity: 'month' as const, period_start: '2026-02-01', period_end: '2026-02-28' }]) {
      const range = investigationRange(input);
      expect(validateRange(range.from, range.to)).toBeNull();
    }
  });
});

describe('ciclo de facturación actual (ERD-CHARTS-01)', () => {
  const last = { period_start: '2026-08-01', period_end: '2026-08-31', days: 31 };
  it('dentro del ciclo estimado: avance y rango ya transcurrido', () => {
    expect(currentCycle(last, '2026-09-10')).toEqual({
      state: 'active', start: '2026-09-01', end: '2026-09-30', days: 30, elapsed: 10, range: { from: '2026-09-01', to: '2026-09-10' },
    });
  });
  it('el primer y el último día del ciclo cuentan', () => {
    expect(currentCycle(last, '2026-09-01')).toMatchObject({ state: 'active', elapsed: 1, range: { from: '2026-09-01', to: '2026-09-01' } });
    expect(currentCycle(last, '2026-09-30')).toMatchObject({ state: 'active', elapsed: 30, range: { from: '2026-09-01', to: '2026-09-30' } });
  });
  it('si el ciclo estimado ya terminó, está vencido: no se inventa otro y se consulta el ciclo completo', () => {
    expect(currentCycle(last, '2026-10-04')).toEqual({
      state: 'overdue', start: '2026-09-01', end: '2026-09-30', days: 30, elapsed: 30, range: { from: '2026-09-01', to: '2026-09-30' },
    });
  });
  it('si el ciclo estimado aún no empieza, no hay rango que consultar', () => {
    expect(currentCycle(last, '2026-08-31')).toEqual({ state: 'upcoming', start: '2026-09-01', end: '2026-09-30', days: 30, elapsed: 0, range: null });
  });
  it('un ciclo que no coincide con el mes repite la duración del anterior', () => {
    expect(currentCycle({ period_start: '2026-07-15', period_end: '2026-08-14', days: 31 }, '2026-08-20')).toMatchObject({
      start: '2026-08-15', end: '2026-09-14', days: 31, elapsed: 6, state: 'active',
    });
  });
});

describe('mini-tendencias (ERD-CHARTS-01)', () => {
  const bar = (kwh: number, kind: 'REAL' | 'PROJECTED' = 'REAL', amountDop: number | null = kwh * 10) => ({ key: String(kwh), periodEnd: '2026-01-01', kwh, amountDop, kind });
  it('usa solo facturas reales: la proyección nunca entra en la tendencia', () => {
    expect(trendValues([bar(100), bar(200), bar(300, 'PROJECTED')], 'kwh')).toEqual([100, 200]);
    expect(trendValues([bar(1, 'REAL', null), bar(2)], 'amountDop')).toEqual([20]);
  });
  it('no dibuja con menos de 3 puntos y no inventa los que faltan', () => {
    expect(sparkline([])).toBeNull();
    expect(sparkline([1, 2])).toBeNull();
    expect(sparkline([1, NaN, 3])).toBeNull();
  });
  it('normaliza: el valor más alto queda arriba (y = 0) y el más bajo abajo (y = 1)', () => {
    const line = sparkline([100, 300, 200])!;
    expect(line.points).toEqual([{ x: 0, y: 1 }, { x: 0.5, y: 0 }, { x: 1, y: 0.5 }]);
    expect([line.first, line.last, line.min, line.max]).toEqual([100, 200, 100, 300]);
  });
  it('una serie constante es una línea al centro, sin dividir entre cero', () => {
    expect(sparkline([5, 5, 5])!.points.map((p) => p.y)).toEqual([0.5, 0.5, 0.5]);
  });
  it('el resumen accesible dice la dirección y los extremos', () => {
    const f = (n: number) => `${n} kWh`;
    expect(sparklineSummary('consumo', sparkline([100, 150, 200])!, f)).toBe('Tendencia de consumo en las últimas 3 facturas: subió, de 100 kWh a 200 kWh.');
    expect(sparklineSummary('consumo', sparkline([200, 150, 100])!, f)).toContain('bajó');
    expect(sparklineSummary('consumo', sparkline([100, 150, 100])!, f)).toContain('se mantuvo');
  });
});

describe('alertas (ERD-ALERT-02)', () => {
  it('cada tipo tiene un titular, y el pago vencido se distingue del que vence pronto', async () => {
    const { alertTitle } = await import('./index');
    expect(alertTitle({ type: 'payment_due', severity: 'critical' })).toBe('Factura vencida');
    expect(alertTitle({ type: 'payment_due', severity: 'warning' })).toBe('Factura por vencer');
    expect(alertTitle({ type: 'bill_variation', severity: 'savings' })).toBe('Ahorro frente al período anterior');
    expect(alertTitle({ type: 'bill_variation', severity: 'critical' })).toBe('Consumo más alto que el período anterior');
    expect(alertTitle({ type: 'stale_readings', severity: 'info' })).toBe('Lecturas atrasadas');
  });
  it('el destino de «resolver» depende del tipo y nunca inventa una factura', async () => {
    const { alertTarget, SEVERITY_ORDER } = await import('./index');
    expect(alertTarget({ type: 'payment_due', bill_id: 'b1' })).toEqual({ kind: 'bill', billId: 'b1', label: 'Ver factura' });
    expect(alertTarget({ type: 'payment_due', bill_id: null })).toBeNull();
    expect(alertTarget({ type: 'missing_bill', bill_id: 'b1' })?.kind).toBe('new-bill');
    expect(alertTarget({ type: 'stale_readings', bill_id: null })?.kind).toBe('new-reading');
    expect(alertTarget({ type: 'anomaly', bill_id: null })?.kind).toBe('home');
    expect(Object.entries(SEVERITY_ORDER).sort((a, b) => a[1] - b[1]).map(([k]) => k)).toEqual(['critical', 'warning', 'info', 'savings']);
  });
});
