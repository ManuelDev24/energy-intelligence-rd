// ERD-SAVE-01 (móvil): lógica pura de la pantalla de ahorro + estructura (no hay render de React Native en vitest).
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Recommendation } from '../../api/types';
import { recommendationRow, savingsAction } from './savingsModel';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rec = (over: Partial<Recommendation> = {}): Recommendation => ({
  id: '00000000-0000-0000-0000-0000000000a1', home_id: '00000000-0000-0000-0000-000000000001', equipment_id: null, anomaly_id: null,
  rule_id: 'ac-one-hour', rule_version: 1, ruleset_version: 1, difficulty: 'easy', impact: 'high', category: 'equipment', title: 'Una hora menos de aire (Sala)',
  summary: 'Sala usa unas 6 h al día.', action: 'Sube el termostato.', confidence: 'medium', status: 'active', savings_kwh_month: '45.00',
  savings_dop_month: '585.00', assumptions: ['Potencia nominal.'], evidence: {}, created_at: '2026-10-11T12:00:00Z',
  last_seen_at: '2026-10-11T12:00:00Z', status_changed_at: '2026-10-11T12:00:00Z', ...over,
});

describe('savingsModel', () => {
  it('la etiqueta accesible incluye el ahorro estimado y la confianza', () => {
    const row = recommendationRow(rec());
    expect(row.accessibilityLabel).toBe('Una hora menos de aire (Sala). Ahorro estimado ≈ 45 kWh al mes · ≈ RD$ 585.00 al mes. Confianza media');
    expect(row.tone).toBe('savings');
  });

  it('sin ahorro no se anuncia ningún ahorro', () => {
    const row = recommendationRow(rec({ category: 'goal', savings_kwh_month: null, savings_dop_month: null }));
    expect(row.view.savings).toBeNull();
    expect(row.accessibilityLabel).not.toMatch(/Ahorro estimado/);
    expect(row.tone).toBe('info');
  });

  it('cada categoría navega a su pantalla', () => {
    const nav = { onEquipment: vi.fn(), onGoal: vi.fn(), onAlerts: vi.fn() };
    savingsAction(recommendationRow(rec()).target, nav)?.();
    savingsAction(recommendationRow(rec({ category: 'data' })).target, nav)?.();
    savingsAction(recommendationRow(rec({ category: 'goal' })).target, nav)?.();
    savingsAction(recommendationRow(rec({ category: 'anomaly' })).target, nav)?.();
    expect(nav.onEquipment).toHaveBeenCalledTimes(2);
    expect(nav.onGoal).toHaveBeenCalledTimes(1);
    expect(nav.onAlerts).toHaveBeenCalledTimes(1);
    expect(savingsAction(recommendationRow(rec()).target, {})).toBeUndefined();
  });

  it('la pantalla etiqueta el ahorro como ESTIMADO, explica el porqué y permite aplicar, descartar y reactivar', () => {
    const screen = read('./SavingsScreen.tsx');
    expect(screen).toContain("ESTIMADO");
    expect(screen).toContain('quality="ESTIMATED"');
    expect(screen).toContain("'¿Por qué se recomienda?'");
    for (const id of ['reco-apply-', 'reco-dismiss-', 'reco-restore-', 'reco-why-', 'reco-explain-', 'savings-total', 'reco-update-error']) expect(screen).toContain(id);
    expect(screen).toContain('accessibilityLabel={`Marcar como aplicada: ${view.title}`}');
    expect(screen).toContain('accessibilityLabel={`Descartar: ${view.title}`}');
  });

  it('está en la navegación y se abre desde el panel', () => {
    const nav = read('../../navigation/AppNavigator.tsx');
    expect(nav).toContain("name=\"Savings\"");
    expect(nav).toContain("onOpenSavings={() => navigation.navigate('Savings')}");
    const dashboard = read('../dashboard/DashboardScreen.tsx');
    expect(dashboard).toContain('testID="open-savings"');
    expect(dashboard).toContain('<RecommendationCard text={recommendation} onPress={onOpenSavings} />');
  });

  it('«Aplicar objetivo» pide confirmación nativa y usa la propuesta del servidor (ERD-SAVE-01-CLOSE)', () => {
    const screen = read('./SavingsScreen.tsx');
    expect(screen).toContain('goalProposalView(proposal.data)');
    expect(screen).toContain("Alert.alert('Aplicar objetivo'");
    expect(screen).toContain('testID="goal-proposal-apply"');
    expect(screen).toContain('view.difficulty, view.impact');
    expect(read('../../api/hooks.ts')).toContain('api.applyGoalProposal(homeId)');
  });
});
