import type { GoalProposalOut, Recommendation } from '@energyrd/api-contracts';
import { fmtNumber } from './format';

/**
 * ERD-SAVE-01: presentación de recomendaciones de ahorro. El texto (título, resumen, acción, supuestos) lo redacta la API;
 * aquí solo etiquetas, el formato del ahorro estimado y el destino de cada categoría. Nunca aritmética de negocio.
 */
export const RECOMMENDATION_CONFIDENCE: Record<Recommendation['confidence'], string> = {
  low: 'Confianza baja', medium: 'Confianza media', high: 'Confianza alta',
};
export const RECOMMENDATION_CONFIDENCE_HELP: Record<Recommendation['confidence'], string> = {
  low: 'Es una pauta general con pocos datos tuyos detrás.',
  medium: 'Se apoya en la potencia y las horas que declaraste.',
  high: 'Se apoya directamente en tus datos.',
};
export const RECOMMENDATION_CATEGORY: Record<Recommendation['category'], string> = {
  equipment: 'Equipo', goal: 'Meta', anomaly: 'Desviación', data: 'Datos',
};
export const RECOMMENDATION_STATUS: Record<Recommendation['status'], string> = {
  active: 'Vigente', applied: 'Ya la apliqué', dismissed: 'Descartada', resolved: 'Ya no aplica',
};

export const RECOMMENDATION_DIFFICULTY: Record<Recommendation['difficulty'], string> = { easy: 'Fácil de aplicar', medium: 'Esfuerzo medio', hard: 'Requiere más esfuerzo' };
export const RECOMMENDATION_IMPACT: Record<NonNullable<Recommendation['impact']>, string> = { low: 'Impacto bajo', medium: 'Impacto medio', high: 'Impacto alto' };

export type RecommendationTarget =
  | { kind: 'equipment'; label: string }
  | { kind: 'goal'; label: string }
  | { kind: 'alerts'; label: string }
  | { kind: 'new-equipment'; label: string };

/** A dónde lleva «actuar» cada categoría; cada app lo traduce a su navegación. */
export function recommendationTarget(r: Pick<Recommendation, 'category' | 'rule_id'>): RecommendationTarget {
  switch (r.category) {
    case 'equipment': return { kind: 'equipment', label: 'Ver mis equipos' };
    case 'goal': return { kind: 'goal', label: 'Ver mi meta' };
    case 'anomaly': return { kind: 'alerts', label: 'Ver alertas' };
    case 'data': return { kind: 'new-equipment', label: 'Declarar equipos' };
  }
}

/** «≈ 45 kWh al mes · ≈ RD$ 585.00 al mes», siempre marcado como estimado. null si la recomendación no promete ahorro. */
export function formatSavings(r: Pick<Recommendation, 'savings_kwh_month' | 'savings_dop_month'>): string | null {
  if (r.savings_kwh_month === null) return null;
  const kwh = `≈ ${fmtNumber(r.savings_kwh_month, Number(r.savings_kwh_month) % 1 === 0 ? 0 : 2)} kWh al mes`;
  return r.savings_dop_month === null ? kwh : `${kwh} · ≈ RD$ ${fmtNumber(r.savings_dop_month, 2)} al mes`;
}

export interface RecommendationView {
  id: string;
  title: string;
  category: string;
  savings: string | null;
  confidence: string;
  confidenceHelp: string;
  difficulty: string;
  /** null si la recomendación no promete ahorro (meta, desviación, datos). */
  impact: string | null;
  summary: string;
  action: string;
  assumptions: string[];
  rule: string;
  decided: boolean;
}

export function recommendationView(r: Recommendation): RecommendationView {
  return {
    id: r.id, title: r.title, category: RECOMMENDATION_CATEGORY[r.category], savings: formatSavings(r),
    confidence: RECOMMENDATION_CONFIDENCE[r.confidence], confidenceHelp: RECOMMENDATION_CONFIDENCE_HELP[r.confidence],
    difficulty: RECOMMENDATION_DIFFICULTY[r.difficulty], impact: r.impact ? RECOMMENDATION_IMPACT[r.impact] : null,
    summary: r.summary, action: r.action, assumptions: r.assumptions, rule: `${r.rule_id} v${r.rule_version}`,
    decided: r.status === 'applied' || r.status === 'dismissed',
  };
}

export interface GoalProposalView {
  /** «Meta sugerida: 265 kWh al mes» o null si hoy no se puede proponer. */
  headline: string | null;
  /** Cómo se llegó: «Promedio de tus últimas 2 facturas: 310 kWh − ahorro estimado 45 kWh». */
  breakdown: string | null;
  reason: string | null;
  canApply: boolean;
  /** Aviso cuando ya hay una meta distinta: aplicar la reemplaza. */
  replaces: string | null;
  assumptions: string[];
}

/** Texto de la propuesta de meta (solo presentación: las cifras las calcula la API). */
export function goalProposalView(p: Pick<GoalProposalOut, 'proposal' | 'baseline' | 'potential_savings' | 'bills_used' | 'current_goal_kwh' | 'reason' | 'assumptions'>): GoalProposalView {
  const n = (v: string) => fmtNumber(v, Number(v) % 1 === 0 ? 0 : 2);
  const proposed = p.proposal ? n(p.proposal.value) : null;
  const current = p.current_goal_kwh !== null ? n(p.current_goal_kwh) : null;
  return {
    headline: proposed ? `Meta sugerida: ${proposed} kWh al mes` : null,
    breakdown: p.proposal && p.baseline && p.potential_savings
      ? `Promedio de ${p.bills_used === 1 ? 'tu última factura' : `tus últimas ${p.bills_used} facturas`}: ${n(p.baseline.value)} kWh − ahorro estimado ${n(p.potential_savings.value)} kWh` : null,
    reason: p.proposal ? null : p.reason,
    canApply: p.proposal !== null && current !== proposed,
    replaces: proposed && current && current !== proposed ? `Reemplaza tu meta actual de ${current} kWh al mes.` : null,
    assumptions: p.assumptions,
  };
}
