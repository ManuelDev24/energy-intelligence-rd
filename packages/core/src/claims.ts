import type { ClaimEvidence } from '@energyrd/api-contracts';
import { fmtDop, fmtKwh, fmtPct, fmtPeriod } from './format';

/**
 * ERD-CLAIM-01: vocabulario y validación compartidos de las reclamaciones (web y móvil). Reglas de lenguaje: el caso es un registro de la
 * persona; la app nunca dice que la distribuidora «cometió un error» ni «cobró de más».
 */
export type ClaimKind = 'billing_error' | 'consumption_dispute' | 'outage_damage' | 'service_quality' | 'other';
export type ClaimStatus = 'open' | 'in_review' | 'resolved' | 'closed';

export const CLAIM_KINDS: ReadonlyArray<{ key: ClaimKind; label: string; needsBill: boolean; hint: string }> = [
  { key: 'billing_error', label: 'Dudas sobre un cobro', needsBill: true, hint: 'Un monto que no entiendes o no esperabas.' },
  { key: 'consumption_dispute', label: 'Dudas sobre el consumo facturado', needsBill: true, hint: 'Los kWh facturados no coinciden con lo que crees haber consumido.' },
  { key: 'outage_damage', label: 'Daños por apagón o variación de voltaje', needsBill: false, hint: 'Un equipo dañado o una interrupción que te afectó.' },
  { key: 'service_quality', label: 'Calidad del servicio', needsBill: false, hint: 'Interrupciones frecuentes, voltaje bajo, atención.' },
  { key: 'other', label: 'Otro tema', needsBill: false, hint: 'Cualquier otro asunto con tu distribuidora.' },
];
export const CLAIM_KIND_LABEL: Record<ClaimKind, string> = Object.fromEntries(CLAIM_KINDS.map(k => [k.key, k.label])) as Record<ClaimKind, string>;
export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = { open: 'Abierta', in_review: 'En revisión', resolved: 'Resuelta', closed: 'Cerrada' };
export const CLAIM_STATUS_HELP: Record<ClaimStatus, string> = {
  open: 'Tu caso está registrado. La reclamación formal la presentas tú ante tu distribuidora.',
  in_review: 'Estamos revisando tu caso.',
  resolved: 'El caso se marcó como resuelto.',
  closed: 'Cerraste este caso.',
};
export const isClaimFinished = (status: ClaimStatus): boolean => status === 'resolved' || status === 'closed';

export interface ClaimFormInput { kind: ClaimKind | ''; billId: string; subject: string; description: string; amount: string; reference: string }
export type ClaimFormErrors = Partial<Record<keyof ClaimFormInput, string>>;

export const CLAIM_LIMITS = { subjectMin: 3, subjectMax: 120, descriptionMin: 10, descriptionMax: 2000, noteMin: 3, noteMax: 2000, referenceMax: 60 } as const;

/** Misma validación que la API (la API decide; esto solo evita ir y volver con errores obvios). */
export function validateClaimForm(f: ClaimFormInput): { ok: true; value: { kind: ClaimKind; bill_id: string | null; subject: string; description: string; disputed_amount_dop: string | null; reference_number: string | null } } | { ok: false; errors: ClaimFormErrors } {
  const errors: ClaimFormErrors = {};
  const kind = CLAIM_KINDS.find(k => k.key === f.kind);
  if (!kind) errors.kind = 'Elige de qué se trata.';
  if (kind?.needsBill && !f.billId) errors.billId = 'Elige la factura a la que se refiere.';
  const subject = f.subject.trim();
  if (subject.length < CLAIM_LIMITS.subjectMin || subject.length > CLAIM_LIMITS.subjectMax) errors.subject = `Escribe un asunto de ${CLAIM_LIMITS.subjectMin} a ${CLAIM_LIMITS.subjectMax} caracteres.`;
  const description = f.description.trim();
  if (description.length < CLAIM_LIMITS.descriptionMin || description.length > CLAIM_LIMITS.descriptionMax) errors.description = `Cuéntanos qué pasó (${CLAIM_LIMITS.descriptionMin} a ${CLAIM_LIMITS.descriptionMax} caracteres).`;
  const amount = f.amount.trim().replace(/,/g, '');
  if (amount && (!/^\d{1,10}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0)) errors.amount = 'Ingresa un monto mayor que 0 con hasta 2 decimales, o déjalo vacío.';
  const reference = f.reference.trim();
  if (reference.length > CLAIM_LIMITS.referenceMax) errors.reference = `El número de referencia admite hasta ${CLAIM_LIMITS.referenceMax} caracteres.`;
  if (Object.keys(errors).length || !kind) return { ok: false, errors };
  return { ok: true, value: { kind: kind.key, bill_id: f.billId || null, subject, description, disputed_amount_dop: amount || null, reference_number: reference || null } };
}

export interface ClaimEvidenceLine { label: string; value: string }
/** Resumen que acompaña al caso: cifras de la persona con su calidad, sin conclusiones. */
export function claimEvidenceLines(e: ClaimEvidence): ClaimEvidenceLine[] {
  const lines: ClaimEvidenceLine[] = [
    { label: 'Factura', value: fmtPeriod(e.bill.period_start, e.bill.period_end) },
    { label: 'Consumo facturado', value: fmtKwh(e.bill.kwh.value) },
    { label: 'Monto facturado', value: fmtDop(e.bill.amount_dop.value) },
  ];
  if (e.bill.avg_price_per_kwh) lines.push({ label: 'Precio medio (estimado)', value: `${fmtDop(e.bill.avg_price_per_kwh.value)} por kWh` });
  if (e.previous) {
    lines.push({ label: 'Factura anterior', value: `${fmtPeriod(e.previous.period_start, e.previous.period_end)}: ${fmtKwh(e.previous.kwh.value)} · ${fmtDop(e.previous.amount_dop.value)}` });
    if (e.previous.kwh_pct) lines.push({ label: 'Cambio de consumo (estimado)', value: fmtPct(e.previous.kwh_pct.value) });
    if (e.previous.amount_pct) lines.push({ label: 'Cambio de monto (estimado)', value: fmtPct(e.previous.amount_pct.value) });
  } else lines.push({ label: 'Factura anterior', value: 'No hay una factura anterior registrada.' });
  lines.push({ label: 'Lecturas del medidor en el período', value: String(e.readings_in_period) });
  return lines;
}

export const CLAIM_EVENT_LABEL = (kind: 'created' | 'note' | 'status', statusTo: ClaimStatus | null): string =>
  kind === 'created' ? 'Caso creado' : kind === 'note' ? 'Nota' : `Estado: ${statusTo ? CLAIM_STATUS_LABEL[statusTo] : '—'}`;
