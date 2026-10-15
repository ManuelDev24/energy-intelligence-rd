import { describe, expect, it } from 'vitest';
import type { Recommendation } from '@energyrd/api-contracts';
import { formatSavings, recommendationTarget, recommendationView } from './recommendations';

const base: Recommendation = {
  id: '00000000-0000-0000-0000-0000000000a1', home_id: '00000000-0000-0000-0000-000000000001', equipment_id: null, anomaly_id: null,
  rule_id: 'ac-one-hour', rule_version: 1, ruleset_version: 1, category: 'equipment', title: 'Una hora menos de aire (Sala)',
  summary: 'Sala usa unas 6 h al día.', action: 'Sube el termostato a 24–25 °C.', confidence: 'medium', status: 'active',
  savings_kwh_month: '45.00', savings_dop_month: '585.00', assumptions: ['Potencia nominal.'], evidence: { power_w: '1500' },
  created_at: '2026-10-11T12:00:00Z', last_seen_at: '2026-10-11T12:00:00Z', status_changed_at: '2026-10-11T12:00:00Z',
  difficulty: 'easy', impact: 'high',
};

describe('dificultad e impacto en la vista', () => {
  it('traduce las etiquetas y deja el impacto en null si no hay ahorro', () => {
    expect(recommendationView(base)).toMatchObject({ difficulty: 'Fácil de aplicar', impact: 'Impacto alto' });
    expect(recommendationView({ ...base, difficulty: 'hard', impact: null })).toMatchObject({ difficulty: 'Requiere más esfuerzo', impact: null });
  });
});

describe('recomendaciones (ERD-SAVE-01)', () => {
  it('formatea el ahorro como estimado, con y sin pesos', () => {
    expect(formatSavings(base)).toBe('≈ 45 kWh al mes · ≈ RD$ 585.00 al mes');
    expect(formatSavings({ ...base, savings_kwh_month: '3.50', savings_dop_month: null })).toBe('≈ 3.50 kWh al mes');
    expect(formatSavings({ ...base, savings_kwh_month: null, savings_dop_month: null })).toBeNull();
  });

  it('cada categoría lleva a un destino distinto', () => {
    expect(recommendationTarget(base).kind).toBe('equipment');
    expect(recommendationTarget({ category: 'goal', rule_id: 'goal-gap' }).kind).toBe('goal');
    expect(recommendationTarget({ category: 'anomaly', rule_id: 'anomaly-peak' }).kind).toBe('alerts');
    expect(recommendationTarget({ category: 'data', rule_id: 'declare-equipment' }).kind).toBe('new-equipment');
  });

  it('la vista conserva el texto de la API, los supuestos y la regla', () => {
    const v = recommendationView(base);
    expect(v).toMatchObject({ title: base.title, summary: base.summary, action: base.action, assumptions: ['Potencia nominal.'], rule: 'ac-one-hour v1', confidence: 'Confianza media', decided: false });
    expect(recommendationView({ ...base, status: 'dismissed' }).decided).toBe(true);
  });
});


import { goalProposalView } from './recommendations';
describe('propuesta de meta («Aplicar objetivo»)', () => {
  const base = { bills_used: 2, current_goal_kwh: null, reason: null, assumptions: ['a'],
    baseline: { value: '310.00', unit: 'kWh/mes', quality: 'REAL' as const }, potential_savings: { value: '45.00', unit: 'kWh/mes', quality: 'ESTIMATED' as const },
    proposal: { value: '265', unit: 'kWh/mes', quality: 'ESTIMATED' as const } };
  it('explica de dónde sale la cifra y permite aplicar', () => {
    const v = goalProposalView(base);
    expect(v.headline).toBe('Meta sugerida: 265 kWh al mes');
    expect(v.breakdown).toBe('Promedio de tus últimas 2 facturas: 310 kWh − ahorro estimado 45 kWh');
    expect(v).toMatchObject({ canApply: true, replaces: null, reason: null });
  });
  it('avisa si reemplaza una meta distinta y no ofrece aplicar si ya es esa', () => {
    expect(goalProposalView({ ...base, current_goal_kwh: '300.00' }).replaces).toBe('Reemplaza tu meta actual de 300 kWh al mes.');
    expect(goalProposalView({ ...base, current_goal_kwh: '265.00' })).toMatchObject({ canApply: false, replaces: null });
  });
  it('sin propuesta muestra el motivo y no deja aplicar', () => {
    const v = goalProposalView({ ...base, proposal: null, baseline: null, potential_savings: null, bills_used: 0, reason: 'Registra al menos una factura.' });
    expect(v).toMatchObject({ headline: null, breakdown: null, canApply: false, reason: 'Registra al menos una factura.' });
  });
});
