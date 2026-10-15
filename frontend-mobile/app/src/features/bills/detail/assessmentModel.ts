// Revisión de consistencia de una factura (ERD-BILL-02). Puro y de solo lectura: la API nunca aprueba
// (`approval: 'not_performed'`) y aquí tampoco se sugiere. Todo el texto se redacta localmente a partir
// de códigos y valores validados; nada del servidor se muestra tal cual.
import type { BillAssessment, BillCheck, BillCorrection } from '@energyrd/api-contracts';

import { fmtDate, fmtDop, fmtKwh } from '../../../lib/format';
import { localParts } from '../../../lib/rdTime';
import { cents } from './saveItems';

export const APPROVAL_NOTE = 'Esta revisión no aprueba la factura.';
export const ORIGINAL_RECORDED = 'Original registrado';
export const ORIGIN_UNKNOWN = 'Origen desconocido — dato anterior al registro de originales';
const NO_DETAIL = 'Sin detalle';
const NO_DATA = 'Sin dato';

export type ReviewTone = 'success' | 'warning' | 'neutral';
const STATUS: Record<BillAssessment['status'], { label: string; icon: string; tone: ReviewTone }> = {
  consistent: { label: 'Sin inconsistencias detectadas', icon: 'checkmark-circle', tone: 'success' },
  warnings: { label: 'Con advertencias', icon: 'warning', tone: 'warning' },
  incomplete: { label: 'Revisión incompleta: faltan datos', icon: 'help-circle', tone: 'neutral' },
};
const CHECK_STATUS: Record<BillCheck['status'], { text: string; icon: string; tone: ReviewTone }> = {
  pass: { text: 'Correcto', icon: 'checkmark-circle', tone: 'success' },
  warning: { text: 'Advertencia', icon: 'warning', tone: 'warning' },
  unavailable: { text: 'Sin datos', icon: 'remove-circle-outline', tone: 'neutral' },
};
const CHECK_TITLES: Record<string, string> = {
  period_order: 'Orden del período',
  period_duration: 'Duración del período',
  days_consistency: 'Días facturados',
  readings_kwh: 'Lecturas y consumo',
  items_sum: 'Suma de ítems',
};
const WARNINGS: Record<string, string> = {
  period_order: 'El fin del período es anterior al inicio.',
  period_duration: 'El período supera la duración máxima de 366 días.',
  days_consistency: 'Los días facturados no coinciden con el período.',
  readings_kwh: 'La diferencia de lecturas no coincide con el consumo facturado.',
  items_sum: 'El detalle de ítems no cuadra con el total de la factura.',
  original_unverified: 'No hay original registrado de esta factura para comparar.',
  original_unknown: 'No hay original registrado de esta factura para comparar.',
};
const OTHER_WARNING = 'Otra advertencia de calidad de dato.';

const own = <T,>(table: Record<string, T>, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 100_000;
const DECIMAL = /^-?\d{1,12}(\.\d{1,4})?$/;
const decimal = (v: unknown): string | null => (typeof v === 'string' && DECIMAL.test(v) ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : null);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function checkDetail(c: BillCheck): string | null {
  const o = c.observed ?? {};
  switch (c.code) {
    case 'period_order':
      return c.status === 'pass' ? 'El fin del período no es anterior al inicio.' : c.status === 'warning' ? 'El fin del período es anterior al inicio.' : null;
    case 'period_duration':
      return isInt(o.elapsed_days) ? `Período de ${o.elapsed_days} días (máximo 366).` : null;
    case 'days_consistency':
      return isInt(o.declared_days) && isInt(o.elapsed_days) && isInt(o.inclusive_days)
        ? `Declarados: ${o.declared_days} días · período: ${o.elapsed_days} días (${o.inclusive_days} contando ambos extremos).`
        : null;
    case 'readings_kwh': {
      if (c.status === 'unavailable') return 'Falta una de las lecturas del medidor.';
      const delta = decimal(o.readings_delta_kwh);
      const kwh = decimal(o.kwh);
      return delta && kwh ? `Diferencia de lecturas: ${fmtKwh(delta)} · consumo facturado: ${fmtKwh(kwh)}.` : null;
    }
    case 'items_sum': {
      if (c.status === 'unavailable') return 'Sin detalle de ítems capturado.';
      const total = decimal(o.items_total_dop);
      const bill = decimal(o.bill_amount_dop);
      return total && bill ? `Ítems: ${fmtDop(total)} · factura: ${fmtDop(bill)}.` : null;
    }
    default:
      return null;
  }
}

export interface CheckView { key: string; title: string; statusText: string; icon: string; tone: ReviewTone; detail: string | null }
export interface ChangeView { field: string; before: string; after: string }
export interface CorrectionView { key: string; dateText: string; title: string; changes: ChangeView[] }

const BILL_FIELDS: [string, string, (v: unknown) => string][] = [
  ['period_start', 'Inicio del período', (v) => (typeof v === 'string' && DATE.test(v) ? fmtDate(v) : NO_DATA)],
  ['period_end', 'Fin del período', (v) => (typeof v === 'string' && DATE.test(v) ? fmtDate(v) : NO_DATA)],
  ['days', 'Días', (v) => (isInt(v) ? `${v} días` : NO_DATA)],
  ['kwh', 'Consumo', (v) => { const d = decimal(v); return d ? fmtKwh(d) : NO_DATA; }],
  ['amount_dop', 'Monto total', (v) => { const d = decimal(v); return d ? fmtDop(d) : NO_DATA; }],
  ['reading_previous', 'Lectura anterior', (v) => { const d = decimal(v); return d ? fmtKwh(d) : NO_DATA; }],
  ['reading_current', 'Lectura actual', (v) => { const d = decimal(v); return d ? fmtKwh(d) : NO_DATA; }],
];

function itemsSummary(record: Record<string, unknown> | null): { count: string; total: string } {
  const items = record && Array.isArray(record.items) ? (record.items as unknown[]) : [];
  if (items.length === 0) return { count: '0', total: NO_DETAIL };
  let sum = 0n;
  for (const it of items) {
    const raw = it && typeof it === 'object' ? decimal((it as Record<string, unknown>).amount_dop) : null;
    const c = raw === null ? null : cents(raw);
    if (c === null) return { count: String(items.length), total: NO_DATA };
    sum += c;
  }
  return { count: String(items.length), total: fmtDop(Number(sum) / 100) };
}

function correctionView(c: BillCorrection, index: number): CorrectionView {
  const dateText = localParts(c.created_at)?.label ?? NO_DATA;
  if (c.entity === 'bill_items') {
    const before = itemsSummary(c.before);
    const after = itemsSummary(c.after);
    return { key: String(index), dateText, title: 'Detalle de ítems reemplazado', changes: [
      { field: 'Ítems', before: before.count, after: after.count },
      { field: 'Total de ítems', before: before.total, after: after.total },
    ] };
  }
  const changes: ChangeView[] = [];
  for (const [key, field, fmt] of BILL_FIELDS) {
    const before = fmt(c.before?.[key] ?? null);
    const after = fmt(c.after?.[key] ?? null);
    if (before !== after) changes.push({ field, before, after });
  }
  return { key: String(index), dateText, title: 'Factura corregida', changes };
}

export function assessmentView(a: BillAssessment) {
  const creation = a.provenance.origin === 'creation';
  const captured = creation && a.provenance.captured_at ? localParts(a.provenance.captured_at)?.label ?? null : null;
  return {
    approvalNote: APPROVAL_NOTE,
    status: STATUS[a.status],
    checks: a.checks.map((c, i): CheckView => {
      const s = CHECK_STATUS[c.status];
      return { key: `${i}`, title: own(CHECK_TITLES, c.code) ?? 'Comprobación adicional', statusText: s.text, icon: s.icon, tone: s.tone, detail: checkDetail(c) };
    }),
    warnings: [...new Set(a.warnings.map((w) => own(WARNINGS, w) ?? OTHER_WARNING))],
    provenance: creation
      ? { text: ORIGINAL_RECORDED, tone: 'success' as ReviewTone, icon: 'document-lock-outline', detail: captured ? `Registrado el ${captured}.` : null }
      : { text: ORIGIN_UNKNOWN, tone: 'warning' as ReviewTone, icon: 'help-circle-outline', detail: null },
    corrections: a.corrections.map(correctionView),
    correctionsNote: a.corrections.length === 0
      ? 'Sin correcciones registradas.'
      : a.corrections_has_more ? 'Se muestran las 100 correcciones más recientes.' : null,
  };
}
export type AssessmentView = ReturnType<typeof assessmentView>;
