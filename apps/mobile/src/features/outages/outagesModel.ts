import { formatDuration, formatMonthKey, outageSummaryLine } from '@energyrd/core';
import { ApiError } from '../../api/client';
import { describeError } from '../../api/errors';
import type { Outage, OutageSummary } from '../../api/types';
import { localParts } from '../../lib/rdTime';

/** ERD-INT-01 (móvil): textos del historial y del resumen. Lógica pura. */
export const OVERLAP_MESSAGE = 'Ya hay un apagón registrado que se solapa con ese período. Edítelo o ajuste las horas.';
export const INVALID_MESSAGE = 'Revise las fechas: el apagón no puede estar en el futuro, debe terminar después de empezar y durar como máximo 30 días.';

/** Mensaje para el formulario: solape y fechas inválidas tienen texto propio; lo demás, el mensaje local de siempre. */
export function outageErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) return OVERLAP_MESSAGE;
  if (error instanceof ApiError && error.status === 422) return INVALID_MESSAGE;
  return describeError(error).message;
}

export interface OutageRowView {
  id: string;
  when: string;
  summary: string;
  note: string | null;
  ongoing: boolean;
  accessibilityLabel: string;
  testID: string;
}

export function outageRow(o: Outage): OutageRowView {
  const start = localParts(o.started_at)?.label ?? o.started_at;
  const end = o.ended_at ? (localParts(o.ended_at)?.label ?? o.ended_at) : null;
  const when = end ? `${start} → ${end}` : `${start} → sigue sin luz`;
  const summary = outageSummaryLine(o);
  const p = localParts(o.started_at);
  return {
    id: o.id, when, summary, note: o.note, ongoing: o.ongoing,
    accessibilityLabel: `Apagón del ${when}. ${summary}${o.note ? `. ${o.note}` : ''}`,
    testID: p ? `outage-${p.date}-${p.time.replace(':', '')}` : 'outage-invalid',
  };
}

export interface SummaryRowView { month: string; text: string; accessibilityLabel: string }

/** Una línea por mes, del más reciente al más antiguo; los meses sin apagones lo dicen en vez de mostrar ceros sueltos. */
export function summaryRows(s: OutageSummary): SummaryRowView[] {
  return [...s.months].reverse().map((m) => {
    const label = formatMonthKey(m.month);
    const text = m.count === 0
      ? 'Sin apagones'
      : `${m.count} ${m.count === 1 ? 'apagón' : 'apagones'} · ${formatDuration(m.total_minutes)} sin luz${m.ongoing > 0 ? ' (sigue abierto)' : ''}`;
    return { month: label, text, accessibilityLabel: `${label}: ${text}` };
  });
}

export function summaryHeadline(s: OutageSummary): string {
  return s.totals.count === 0
    ? 'Sin apagones registrados en los últimos meses'
    : `${s.totals.count} ${s.totals.count === 1 ? 'apagón' : 'apagones'}, ${formatDuration(s.totals.total_minutes)} sin luz`;
}
