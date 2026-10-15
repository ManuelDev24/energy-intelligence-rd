import { describe, expect, it } from 'vitest';

import { fmtDate, fmtDop, fmtKwh, fmtMetric, fmtNumber, fmtPct, fmtPeriod, fmtSigned } from './format';

// El móvil usa el formato compartido de @energyrd/core (mismo resultado que la web).
describe('formato móvil (core)', () => {
  it('miles y decimales fijos', () => expect(fmtNumber('1250.5')).toBe('1,250.50'));
  it('guion para no numéricos', () => expect(fmtNumber('abc')).toBe('—'));
  it('kWh sin decimales si es entero', () => expect(fmtKwh('300')).toBe('300 kWh'));
  it('kWh con decimales si es fraccional', () => expect(fmtKwh('250.5')).toBe('250.50 kWh'));
  it('RD$ con prefijo', () => expect(fmtDop('3100')).toBe('RD$ 3,100.00'));
  it('signos', () => {
    expect(fmtSigned('50')).toBe('+50.00');
    expect(fmtPct('-20')).toBe('−20.00%');
    expect(fmtSigned('0')).toBe('0.00');
  });
  it('deltas de monto con prefijo y signo', () => expect(fmtMetric('2150', 'RD$', { signed: true })).toBe('+RD$ 2,150.00'));
  it('fechas y períodos', () => {
    expect(fmtDate('2026-08-01')).toBe('1 ago 2026');
    expect(fmtPeriod('2026-08-01', '2026-08-31')).toBe('1–31 ago 2026');
  });
});
