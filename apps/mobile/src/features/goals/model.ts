// Tarjeta de progreso de la meta mensual (ERD-GOAL-01). Puro: estado con icono + texto + tono,
// actual vs. meta, proyección y notas de origen. Los motivos se redactan aquí, no se copia texto del servidor.
import type { GoalMetric, GoalProgress, GoalStatus } from '@energyrd/api-contracts';
import { ApiError, ContractError } from '@energyrd/api-client';
import { fmtMetric, fmtMonth, type Quality } from '@energyrd/core';

export type GoalTone = 'success' | 'warning' | 'danger' | 'neutral';
export const GOAL_STATUS: Record<GoalStatus, { label: string; icon: string; tone: GoalTone; description: string }> = {
  on_track: { label: 'En camino', icon: 'checkmark-circle', tone: 'success', description: 'Al ritmo actual cerrará el mes dentro de la meta.' },
  at_risk: { label: 'En riesgo', icon: 'warning', tone: 'warning', description: 'La proyección del mes supera la meta.' },
  exceeded: { label: 'Meta excedida', icon: 'alert-circle', tone: 'danger', description: 'Lo acumulado este mes ya superó la meta.' },
  insufficient_data: { label: 'Datos insuficientes', icon: 'help-circle', tone: 'neutral', description: 'Faltan datos para evaluar la meta este mes.' },
};

/** Porcentaje de la API ("40.00") -> fracción 0–1 para la barra; null si no hay dato. */
export function progressFraction(percent: string | null | undefined): number | null {
  if (percent === null || percent === undefined) return null;
  const n = Number(percent);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n / 100)) : null;
}

const RESOLUTION = /^[A-Z0-9][A-Z0-9-]{0,39}$/;
/** De dónde sale el valor cuando no es una lectura directa. Lo derivado de tarifa es ESTIMADO. */
export function sourceNote(m: GoalMetric): { text: string; quality: Quality } | null {
  if (m.basis === 'tariff') {
    const res = m.tariff?.source_resolution;
    return { text: `Estimado con tarifa ${res && RESOLUTION.test(res) ? res : 'oficial SIE'}`, quality: 'ESTIMATED' };
  }
  if (m.basis === 'bill_average_price') return { text: 'Estimado con el precio medio de su última factura', quality: 'ESTIMATED' };
  if (m.basis === 'bills_prorated') return { text: 'Calculado con sus facturas del mes', quality: m.so_far?.quality ?? 'ESTIMATED' };
  return null;
}

function localReasons(m: GoalMetric, p: GoalProgress): string[] {
  if (m.unit === 'RD$' && m.basis === null && p.data_source === 'readings')
    return ['Sin tarifa vigente ni facturas con monto: no se estima el monto en RD$.'];
  const out: string[] = [];
  if (m.so_far === null) out.push('No hay lecturas ni facturas que cubran este mes.');
  if (m.projected === null) out.push('Para proyectar el cierre hace falta al menos 1 día de lecturas o 2 facturas.');
  return out;
}

export interface GoalMetricView {
  key: 'kwh' | 'amount';
  title: string;
  target: string;
  soFar: string | null;
  soFarQuality: Quality | null;
  projected: string | null;
  fraction: number | null;
  percentText: string | null;
  status: (typeof GOAL_STATUS)[GoalStatus];
  note: { text: string; quality: Quality } | null;
  reasons: string[];
  a11y: string;
}

function metricView(key: 'kwh' | 'amount', m: GoalMetric, p: GoalProgress): GoalMetricView {
  const title = key === 'kwh' ? 'Consumo' : 'Monto';
  const target = fmtMetric(m.target, m.unit);
  const soFar = m.so_far ? fmtMetric(m.so_far.value, m.unit) : null;
  const projected = m.projected ? fmtMetric(m.projected.value, m.unit) : null;
  const pct = m.percent_so_far === null ? null : Number(m.percent_so_far);
  const percentText = pct !== null && Number.isFinite(pct) ? `${Math.round(pct)}% de la meta` : null;
  const status = GOAL_STATUS[m.status];
  const a11y = [
    `${title}: ${soFar ?? 'sin dato'} de ${target}${percentText ? `, ${percentText}` : ''}.`,
    `Proyección al cierre: ${projected ?? 'sin dato'}.`,
    `Estado: ${status.label}.`,
  ].join(' ');
  return {
    key, title, target, soFar, soFarQuality: m.so_far?.quality ?? null, projected,
    fraction: progressFraction(m.percent_so_far), percentText, status, note: sourceNote(m),
    reasons: localReasons(m, p), a11y,
  };
}

export type GoalCta = 'add_reading' | 'add_bill';
export type GoalCardModel =
  | { kind: 'no_goal' }
  | { kind: 'progress'; status: (typeof GOAL_STATUS)[GoalStatus]; month: string; metrics: GoalMetricView[]; ctas: GoalCta[] };

export function goalCardModel(p: GoalProgress): GoalCardModel {
  if (!p.goal) return { kind: 'no_goal' };
  const metrics: GoalMetricView[] = [];
  if (p.kwh) metrics.push(metricView('kwh', p.kwh, p));
  if (p.amount) metrics.push(metricView('amount', p.amount, p));
  return {
    kind: 'progress',
    status: GOAL_STATUS[p.status],
    month: fmtMonth(p.month_start),
    metrics,
    ctas: p.status === 'insufficient_data' ? ['add_reading', 'add_bill'] : [],
  };
}

/**
 * La API piloto (sin Fase 2) responde 404 a estas rutas: se trata como "función no disponible"
 * y la pantalla sigue funcionando. Errores de red/servidor sí se muestran como error con reintento.
 */
export const isEndpointUnavailable = (error: unknown) =>
  error instanceof ApiError && !(error instanceof ContractError) && [404, 405, 501].includes(error.status);
