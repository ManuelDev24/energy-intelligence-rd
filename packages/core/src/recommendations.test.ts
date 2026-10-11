import { describe, expect, it } from 'vitest';
import type { Recommendation } from '@energyrd/api-contracts';
import { formatSavings, recommendationTarget, recommendationView } from './recommendations';

const base: Recommendation = {
  id: '00000000-0000-0000-0000-0000000000a1', home_id: '00000000-0000-0000-0000-000000000001', equipment_id: null, anomaly_id: null,
  rule_id: 'ac-one-hour', rule_version: 1, ruleset_version: 1, category: 'equipment', title: 'Una hora menos de aire (Sala)',
  summary: 'Sala usa unas 6 h al día.', action: 'Sube el termostato a 24–25 °C.', confidence: 'medium', status: 'active',
  savings_kwh_month: '45.00', savings_dop_month: '585.00', assumptions: ['Potencia nominal.'], evidence: { power_w: '1500' },
  created_at: '2026-10-11T12:00:00Z', last_seen_at: '2026-10-11T12:00:00Z', status_changed_at: '2026-10-11T12:00:00Z',
};

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
