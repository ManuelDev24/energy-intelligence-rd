import { describe, expect, it } from 'vitest';
import { applyRange, canApplyRange, customRangeError, normalizeDateInput } from './dateRangeModel';

const TODAY = '2026-10-10';
describe('selector de rango móvil', () => {
  it('normaliza fechas escritas a mano', () => {
    expect(normalizeDateInput('2026-9-5')).toBe('2026-09-05');
    expect(normalizeDateInput(' 2026-09-05 ')).toBe('2026-09-05');
    expect(normalizeDateInput('05/09/2026')).toBe('05/09/2026');
  });
  it('acepta un rango válido que termina hoy o antes', () => {
    expect(customRangeError('2026-09-01', '2026-09-30', TODAY)).toBeNull();
    expect(customRangeError('2026-9-1', '2026-10-10', TODAY)).toBeNull();
    expect(canApplyRange('2026-10-10', '2026-10-10', TODAY)).toBe(true);
  });
  it.each([
    ['', '2026-09-30', /AAAA-MM-DD/],
    ['2026-09-01', '30/09/2026', /AAAA-MM-DD/],
    ['2026-02-30', '2026-03-01', /AAAA-MM-DD/],
    ['2026-09-30', '2026-09-01', /igual o anterior/],
    ['2025-01-01', '2026-01-02', /366 días/],
    ['2026-10-01', '2026-10-11', /posterior a hoy/],
  ])('rechaza %s → %s', (from, to, message) => {
    expect(customRangeError(from, to, TODAY)).toMatch(message);
    expect(canApplyRange(from, to, TODAY)).toBe(false);
  });
  it('devuelve el rango normalizado al aplicar', () => expect(applyRange('2026-9-1', ' 2026-9-30')).toEqual({ from: '2026-09-01', to: '2026-09-30' }));
});
