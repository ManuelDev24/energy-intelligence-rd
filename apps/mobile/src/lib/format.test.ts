import { describe, expect, it } from 'vitest';

import { fmtDate, fmtDop, fmtKwh, fmtNumber, fmtPeriod, fmtSigned } from './format';

describe('fmtNumber', () => {
  it('formats with thousands separator and fixed decimals', () => expect(fmtNumber('1250.5')).toBe('1,250.50'));
  it('returns a dash for non-numeric input', () => expect(fmtNumber('abc')).toBe('—'));
});

describe('fmtKwh / fmtDop', () => {
  it('shows kWh without decimals when integer', () => expect(fmtKwh('300')).toBe('300 kWh'));
  it('shows kWh with decimals when fractional', () => expect(fmtKwh('250.5')).toBe('250.50 kWh'));
  it('formats RD$ with two decimals', () => expect(fmtDop('3100')).toBe('RD$ 3,100.00'));
});

describe('fmtSigned', () => {
  it('prefixes a plus sign for positive values', () => expect(fmtSigned('50')).toBe('+50.00'));
  it('uses a minus sign for negative values', () => expect(fmtSigned('-20', '%')).toBe('−20.00%'));
  it('has no sign for zero', () => expect(fmtSigned('0')).toBe('0.00'));
});

describe('fmtDate / fmtPeriod', () => {
  it('renders day month year in Spanish abbreviation', () => expect(fmtDate('2026-08-01')).toBe('1 ago 2026'));
  it('joins a period range', () => expect(fmtPeriod('2026-08-01', '2026-08-31')).toBe('1 ago 2026 – 31 ago 2026'));
});
