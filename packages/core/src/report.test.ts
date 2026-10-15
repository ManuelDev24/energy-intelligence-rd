import { describe, expect, it } from 'vitest';
import type { EnergyReportOut } from '@energyrd/api-contracts';
import { energyReportToText, energyReportView } from './report';

const m = (value: string, unit: string, quality: 'REAL' | 'ESTIMATED' | 'PROJECTED') => ({ value, unit, quality });
const bill = (a: string, b: string, kwh: string, amount: string) => ({ bill_id: '11111111-1111-4111-8111-111111111111', period_start: a, period_end: b, days: 30,
  kwh: m(kwh, 'kWh', 'REAL'), amount_dop: m(amount, 'RD$', 'REAL'), avg_price_per_kwh: m('13.00', 'RD$/kWh', 'ESTIMATED') });
const report = (over: Partial<EnergyReportOut> = {}): EnergyReportOut => ({
  home_id: '11111111-1111-4111-8111-111111111111', home: { id: '11111111-1111-4111-8111-111111111111', name: 'Casa', distributor: 'EDESUR', province: 'Santo Domingo', municipality: 'Distrito Nacional' },
  period: { period_from: '2026-05-01', period_to: '2026-06-30', days: 61 }, generated_at: '2026-10-14T12:00:00Z',
  bills: [bill('2026-05-01', '2026-05-30', '300.00', '3900.00'), bill('2026-06-01', '2026-06-30', '340.00', '4420.00')],
  totals: { bills_count: 2, kwh: m('640.00', 'kWh', 'REAL'), amount_dop: m('8320.00', 'RD$', 'REAL'), avg_price_per_kwh: m('13.00', 'RD$/kWh', 'ESTIMATED'), avg_kwh_per_bill: m('320.00', 'kWh', 'ESTIMATED') },
  peak_bill: bill('2026-06-01', '2026-06-30', '340.00', '4420.00'),
  comparison: { previous_from: '2026-03-01', previous_to: '2026-04-30', previous_kwh: m('280.00', 'kWh', 'REAL'), previous_amount_dop: m('3640.00', 'RD$', 'REAL'),
    kwh_pct: m('128.57', '%', 'ESTIMATED'), amount_pct: m('128.57', '%', 'ESTIMATED') },
  equipment: [{ name: 'Aire', room: 'Sala', monthly_kwh: m('270.00', 'kWh/mes', 'ESTIMATED'), share_pct: m('100.00', '%', 'ESTIMATED') }],
  recommendations: [{ title: 'Una hora menos de aire', action: 'Sube el termostato.', savings_kwh_month: m('45.00', 'kWh/mes', 'ESTIMATED'), difficulty: 'easy', impact: 'high' }],
  goal: { monthly_kwh: '250.00', monthly_amount_rd: null }, sources: [{ label: '2 factura(s) registradas por ti', quality: 'REAL' }, { label: 'Equipos declarados', quality: 'ESTIMATED' }],
  notes: ['Las facturas son mensuales.'], ...over,
});

describe('informe energético (ERD-RPT-01)', () => {
  it('ordena secciones y marca la calidad de cada cifra', () => {
    const v = energyReportView(report());
    expect(v.subtitle).toBe('Casa · EDESUR · Distrito Nacional, Santo Domingo · 1 may – 30 jun 2026');
    expect(v.sections.map(s => s.title)).toEqual(['Resumen', 'Frente al período anterior (1 mar – 30 abr 2026)', 'Facturas', 'Equipos que más pesan (estimado)', 'Cómo ahorrar (estimado)', 'Tu meta mensual']);
    const summary = v.sections[0].lines;
    expect(summary.find(l => l.label === 'Consumo total')).toMatchObject({ value: '640 kWh', quality: 'REAL' });
    expect(summary.find(l => l.label === 'Precio medio')?.quality).toBe('ESTIMATED');
    expect(v.sections[4].lines[0]).toMatchObject({ value: '≈ 45 kWh al mes · Fácil de aplicar · Impacto alto', quality: 'ESTIMATED' });
  });
  it('sin facturas no inventa cifras', () => {
    const v = energyReportView(report({ bills: [], peak_bill: null, comparison: null, equipment: [], recommendations: [], goal: null,
      totals: { bills_count: 0, kwh: null, amount_dop: null, avg_price_per_kwh: null, avg_kwh_per_bill: null }, sources: [] }));
    expect(v.sections).toHaveLength(1);
    expect(v.sections[0]).toMatchObject({ lines: [], empty: 'No hay facturas registradas en este período.' });
    expect(energyReportToText(report({ bills: [], totals: { bills_count: 0, kwh: null, amount_dop: null, avg_price_per_kwh: null, avg_kwh_per_bill: null } }))).toContain('No hay facturas registradas');
  });
  it('el texto plano conserva la etiqueta de estimado y las notas', () => {
    const t = energyReportToText(report());
    expect(t).toContain('• Consumo total: 640 kWh\n');
    expect(t).toMatch(/• Precio medio: .* por kWh \(estimado\)/);
    expect(t).toContain('FUENTES\n• 2 factura(s) registradas por ti — real');
    expect(t).toContain('NOTAS\n• Las facturas son mensuales.');
    expect(t).toContain('Generado el 14 oct 2026');
    expect(t).not.toMatch(/<|undefined|NaN/);
  });
  it('omite la meta vacía y el porcentaje cuando la API no lo trae', () => {
    const v = energyReportView(report({ goal: { monthly_kwh: null, monthly_amount_rd: '5000.00' }, comparison: { ...report().comparison!, kwh_pct: null } }));
    expect(v.sections.find(s => s.title === 'Tu meta mensual')?.lines.map(l => l.label)).toEqual(['Meta de gasto']);
    expect(v.sections[1].lines.map(l => l.label)).not.toContain('Variación del consumo');
  });
});
