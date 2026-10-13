import type { GoalMetric, GoalProgress } from '@energyrd/api-contracts';
import { ApiError, ContractError } from '@energyrd/api-client';
import { describe, expect, it } from 'vitest';

import { goalToValues, validateGoal } from './form';
import { GOAL_STATUS, goalCardModel, isEndpointUnavailable, progressFraction, sourceNote } from './model';

const HOME = '11111111-1111-4111-8111-111111111111';
const TARIFF = {
  tariff_id: '22222222-2222-4222-8222-222222222222', distributor: 'EDESUR' as const, tariff_code: 'BTS-1',
  effective_from: '2026-10-01', effective_to: '2026-12-31', source_resolution: 'SIE-121-2026-TF', source_url: null,
};
const metric = (over: Partial<GoalMetric> = {}): GoalMetric => ({
  target: '300.00', unit: 'kWh',
  so_far: { value: '120.00', unit: 'kWh', quality: 'REAL' },
  projected: { value: '310.00', unit: 'kWh', quality: 'PROJECTED' },
  percent_so_far: '40.00', percent_projected: '103.33', status: 'at_risk',
  basis: 'readings', projection_method: 'run_rate_readings', tariff: null, reasons: [], ...over,
});
const progress = (over: Partial<GoalProgress> = {}): GoalProgress => ({
  home_id: HOME, month_start: '2026-10-01', month_end: '2026-10-31', as_of: '2026-10-04', timezone: 'America/Santo_Domingo',
  goal: { home_id: HOME, monthly_amount_rd: null, monthly_kwh: '300.00', updated_at: '2026-10-04T12:00:00Z' },
  status: 'at_risk', data_source: 'readings', kwh: metric(), amount: null, reasons: [], quality_legend: {}, ...over,
});

describe('validateGoal', () => {
  it('exige al menos una meta', () => {
    const r = validateGoal({ amount: ' ', kwh: '' });
    expect(r.input).toBeNull();
    expect(r.errors.form).toMatch(/al menos una/);
  });
  it('cada meta > 0, con máximo 2 decimales; vacía -> null', () => {
    expect(validateGoal({ amount: '0', kwh: '' }).errors.amount).toMatch(/mayor que 0/);
    expect(validateGoal({ amount: '', kwh: '-5' }).errors.kwh).toMatch(/mayor que 0/);
    expect(validateGoal({ amount: '10.123', kwh: '' }).errors.amount).toMatch(/2 decimales/);
    expect(validateGoal({ amount: 'abc', kwh: '' }).errors.amount).toMatch(/número/);
    expect(validateGoal({ amount: '3,000.50', kwh: '' })).toEqual({ errors: {}, input: { monthly_amount_rd: '3000.50', monthly_kwh: null } });
    expect(validateGoal({ amount: '', kwh: '300' }).input).toEqual({ monthly_amount_rd: null, monthly_kwh: '300' });
  });
  it('goalToValues precarga sin ceros decimales innecesarios', () => {
    expect(goalToValues(null)).toEqual({ amount: '', kwh: '' });
    expect(goalToValues({ home_id: HOME, monthly_amount_rd: '3000.00', monthly_kwh: '250.50', updated_at: 'x' })).toEqual({ amount: '3000', kwh: '250.50' });
  });
});

describe('estado de la meta: icono + texto + tono (nunca solo color)', () => {
  it('cada estado tiene etiqueta, icono y descripción distintos', () => {
    const entries = Object.entries(GOAL_STATUS);
    expect(entries.map(([k]) => k).sort()).toEqual(['at_risk', 'exceeded', 'insufficient_data', 'on_track']);
    expect(new Set(entries.map(([, v]) => v.icon)).size).toBe(4);
    expect(new Set(entries.map(([, v]) => v.label)).size).toBe(4);
    expect(GOAL_STATUS.exceeded.label).toBe('Meta excedida');
  });
});

describe('progressFraction', () => {
  it('porcentaje -> fracción acotada; null si no hay dato', () => {
    expect(progressFraction('40.00')).toBe(0.4);
    expect(progressFraction('150')).toBe(1);
    expect(progressFraction(null)).toBeNull();
    expect(progressFraction('x')).toBeNull();
  });
});

describe('sourceNote', () => {
  it('RD$ con tarifa: ESTIMADO con la resolución SIE', () => {
    expect(sourceNote(metric({ unit: 'RD$', basis: 'tariff', tariff: TARIFF })))
      .toEqual({ text: 'Estimado con tarifa SIE-121-2026-TF', quality: 'ESTIMATED' });
  });
  it('una resolución con formato raro no se muestra tal cual', () => {
    expect(sourceNote(metric({ unit: 'RD$', basis: 'tariff', tariff: { ...TARIFF, source_resolution: '<b>x</b>' } }))?.text)
      .toBe('Estimado con tarifa oficial SIE');
  });
  it('precio medio de factura y prorrateo también son estimados; lecturas no llevan nota', () => {
    expect(sourceNote(metric({ basis: 'bill_average_price' }))?.quality).toBe('ESTIMATED');
    expect(sourceNote(metric({ basis: 'bills_prorated' }))?.text).toMatch(/facturas/);
    expect(sourceNote(metric())).toBeNull();
  });
});

describe('goalCardModel', () => {
  it('sin meta: pide definirla', () => {
    const m = goalCardModel(progress({ goal: null, kwh: null, status: 'insufficient_data', data_source: 'none' }));
    expect(m.kind).toBe('no_goal');
  });

  it('en riesgo: actual vs meta, proyección PROYECTADO y estado', () => {
    const m = goalCardModel(progress());
    if (m.kind !== 'progress') throw new Error('kind');
    expect(m.status.label).toBe('En riesgo');
    expect(m.month).toBe('oct 2026');
    const [k] = m.metrics;
    expect(k).toMatchObject({
      key: 'kwh', title: 'Consumo', target: '300 kWh', soFar: '120 kWh', soFarQuality: 'REAL',
      projected: '310 kWh', fraction: 0.4, percentText: '40% de la meta',
    });
    expect(k.a11y).toBe('Consumo: 120 kWh de 300 kWh, 40% de la meta. Proyección al cierre: 310 kWh. Estado: En riesgo.');
    expect(m.ctas).toEqual([]);
  });

  it('RD$ con tarifa muestra la nota de la resolución', () => {
    const amount = metric({
      target: '3000.00', unit: 'RD$', basis: 'tariff', tariff: TARIFF, status: 'on_track',
      so_far: { value: '900.00', unit: 'RD$', quality: 'ESTIMATED' }, projected: { value: '2500.00', unit: 'RD$', quality: 'PROJECTED' },
      percent_so_far: '30.00', percent_projected: '83.33',
    });
    const m = goalCardModel(progress({ kwh: null, amount, status: 'on_track' }));
    if (m.kind !== 'progress') throw new Error('kind');
    expect(m.metrics[0]).toMatchObject({ title: 'Monto', target: 'RD$ 3,000.00', soFar: 'RD$ 900.00', soFarQuality: 'ESTIMATED' });
    expect(m.metrics[0].note).toEqual({ text: 'Estimado con tarifa SIE-121-2026-TF', quality: 'ESTIMATED' });
  });

  it('datos insuficientes: motivos locales + CTA registrar lectura y agregar factura', () => {
    const empty = metric({ so_far: null, projected: null, percent_so_far: null, percent_projected: null, status: 'insufficient_data', basis: null, projection_method: null, reasons: ['texto servidor'] });
    const m = goalCardModel(progress({ kwh: empty, status: 'insufficient_data', data_source: 'none' }));
    if (m.kind !== 'progress') throw new Error('kind');
    expect(m.status.label).toBe('Datos insuficientes');
    expect(m.metrics[0].soFar).toBeNull();
    expect(m.metrics[0].reasons).toEqual([
      'No hay lecturas ni facturas que cubran este mes.',
      'Para proyectar el cierre hace falta al menos 1 día de lecturas o 2 facturas.',
    ]);
    expect(JSON.stringify(m)).not.toContain('texto servidor');
    expect(m.ctas).toEqual(['add_reading', 'add_bill']);
  });

  it('RD$ sin tarifa ni facturas con monto: lo explica sin inventar RD$', () => {
    const amount = metric({ unit: 'RD$', target: '3000', so_far: null, projected: null, basis: null, percent_so_far: null, percent_projected: null, status: 'insufficient_data' });
    const m = goalCardModel(progress({ kwh: null, amount, status: 'insufficient_data' }));
    if (m.kind !== 'progress') throw new Error('kind');
    expect(m.metrics[0].reasons).toContain('Sin tarifa vigente ni facturas con monto: no se estima el monto en RD$.');
  });
});

describe('isEndpointUnavailable (API piloto sin Fase 2)', () => {
  it('404/405/501 = función no disponible; otros errores no', () => {
    expect(isEndpointUnavailable(new ApiError(404, 'x'))).toBe(true);
    expect(isEndpointUnavailable(new ApiError(405, 'x'))).toBe(true);
    expect(isEndpointUnavailable(new ApiError(501, 'x'))).toBe(true);
    expect(isEndpointUnavailable(new ApiError(500, 'x'))).toBe(false);
    expect(isEndpointUnavailable(new ApiError(0, 'x'))).toBe(false);
    expect(isEndpointUnavailable(new ContractError())).toBe(false);
    expect(isEndpointUnavailable(new Error('x'))).toBe(false);
  });
});
