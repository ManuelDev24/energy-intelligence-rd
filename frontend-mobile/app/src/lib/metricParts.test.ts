import { describe, expect, it } from 'vitest';

import { metricParts } from './metricParts';

describe('metricParts', () => {
  it('kWh: número sin decimales innecesarios y unidad aparte', () => {
    expect(metricParts('400', 'kWh')).toEqual({ value: '400', unit: 'kWh' });
    expect(metricParts('1234.5', 'kWh')).toEqual({ value: '1,234.50', unit: 'kWh' });
  });

  it('RD$ lleva el prefijo en el valor; precio por kWh explica la unidad', () => {
    expect(metricParts('5200', 'RD$')).toEqual({ value: 'RD$ 5,200.00' });
    expect(metricParts('13', 'RD$/kWh')).toEqual({ value: 'RD$ 13.00', unit: 'por kWh' });
  });

  it('kWh/día y porcentajes', () => {
    expect(metricParts('12.9', 'kWh/día')).toEqual({ value: '12.90', unit: 'kWh/día' });
    expect(metricParts('50', '%')).toEqual({ value: '50.00%' });
  });

  it('valor no numérico → "—" (no se inventa)', () => {
    expect(metricParts('abc', 'kWh')).toEqual({ value: '—', unit: 'kWh' });
  });
});
