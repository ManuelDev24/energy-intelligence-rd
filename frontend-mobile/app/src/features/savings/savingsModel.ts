import { recommendationTarget, recommendationView, type RecommendationTarget, type RecommendationView } from '@energyrd/core';
import type { Recommendation } from '../../api/types';

/** ERD-SAVE-01: a qué pantalla lleva cada recomendación. Lógica pura (se prueba sin renderizar). */
export interface SavingsNav {
  onEquipment?: () => void;
  onGoal?: () => void;
  onAlerts?: () => void;
}

export function savingsAction(target: RecommendationTarget, nav: SavingsNav): (() => void) | undefined {
  switch (target.kind) {
    case 'equipment':
    case 'new-equipment': return nav.onEquipment;
    case 'goal': return nav.onGoal;
    case 'alerts': return nav.onAlerts;
  }
}

export interface RecommendationRow {
  view: RecommendationView;
  target: RecommendationTarget;
  tone: 'savings' | 'info' | 'warning';
  accessibilityLabel: string;
}

const TONE = { equipment: 'savings', goal: 'info', anomaly: 'warning', data: 'info' } as const;

export function recommendationRow(r: Recommendation): RecommendationRow {
  const view = recommendationView(r);
  return {
    view, target: recommendationTarget(r), tone: TONE[r.category],
    accessibilityLabel: [view.title, view.savings ? `Ahorro estimado ${view.savings}` : null, view.confidence].filter(Boolean).join('. '),
  };
}
