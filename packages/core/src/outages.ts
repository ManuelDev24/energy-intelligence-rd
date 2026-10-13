import type { OutageOut } from '@energyrd/api-contracts';
import { isIsoDate } from './range';
import { localToIso, rdParts } from './rdTime';

/**
 * ERD-INT-01: lógica compartida (web y móvil) del registro manual de interrupciones del servicio eléctrico.
 * Validación de ENTRADA para dar feedback inmediato (la API sigue siendo la autoridad) y textos. La hora es la de
 * República Dominicana (UTC−4 fijo, sin horario de verano), igual que el resto de la app.
 */
export type OutageCause = OutageOut['cause'];
export const OUTAGE_CAUSES: Record<OutageCause, string> = {
  unknown: 'No sé',
  utility_fault: 'Falla de la distribuidora',
  scheduled: 'Mantenimiento programado',
  weather: 'Clima o tormenta',
  home_fault: 'Falla dentro de mi casa',
};
export const OUTAGE_CAUSE_ORDER = Object.keys(OUTAGE_CAUSES) as OutageCause[];
export const MAX_OUTAGE_DAYS = 30;
export const MAX_NOTE = 255;
const FUTURE_TOLERANCE_MS = 5 * 60_000;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface OutageFormValues {
  startDate: string;
  startTime: string;
  /** «Todavía sin luz»: no hay fin. */
  ongoing: boolean;
  endDate: string;
  endTime: string;
  cause: OutageCause;
  note: string;
}
export type OutageFormErrors = Partial<Record<keyof OutageFormValues, string>>;
export interface OutageInput {
  started_at: string;
  ended_at: string | null;
  cause: OutageCause;
  note: string | null;
}
export type OutageFormResult = { ok: true; value: OutageInput } | { ok: false; errors: OutageFormErrors };

/** Fecha y hora de RD de un instante, para precargar el formulario al editar. */
export function outageToForm(o: Pick<OutageOut, 'started_at' | 'ended_at' | 'cause' | 'note'>): OutageFormValues {
  // Los instantes llegan de la API (válidos); `null` solo ocurriría con un contrato roto y se trata como error.
  const parts = (iso: string) => {
    const p = rdParts(iso);
    if (!p) throw new RangeError(`Instante inválido: ${iso}`);
    return p;
  };
  const start = parts(o.started_at);
  const end = o.ended_at ? parts(o.ended_at) : { date: start.date, time: start.time };
  return { startDate: start.date, startTime: start.time, ongoing: o.ended_at === null, endDate: end.date, endTime: end.time, cause: o.cause, note: o.note ?? '' };
}

export function validateOutageForm(v: OutageFormValues, now: Date = new Date()): OutageFormResult {
  const errors: OutageFormErrors = {};
  const limit = now.getTime() + FUTURE_TOLERANCE_MS;
  if (!isIsoDate(v.startDate)) errors.startDate = 'Elige el día en que se fue la luz.';
  if (!TIME.test(v.startTime)) errors.startTime = 'Indica la hora (HH:MM).';
  if (!OUTAGE_CAUSES[v.cause]) errors.cause = 'Elige una causa.';
  const note = v.note.trim();
  if (note.length > MAX_NOTE) errors.note = `Máximo ${MAX_NOTE} caracteres.`;
  let start = NaN;
  if (!errors.startDate && !errors.startTime) {
    start = Date.parse(localToIso(v.startDate, v.startTime));
    if (start > limit) errors.startDate = 'El apagón no puede empezar en el futuro.';
  }
  let end: number | null = null;
  if (!v.ongoing) {
    if (!isIsoDate(v.endDate)) errors.endDate = 'Elige el día en que volvió la luz.';
    if (!TIME.test(v.endTime)) errors.endTime = 'Indica la hora (HH:MM).';
    if (!errors.endDate && !errors.endTime) {
      end = Date.parse(localToIso(v.endDate, v.endTime));
      if (end > limit) errors.endDate = 'La luz no puede haber vuelto en el futuro. Si sigue sin luz, marca «Todavía sin luz».';
      else if (Number.isFinite(start) && end <= start) errors.endTime = 'Debe ser después de la hora en que se fue.';
      else if (Number.isFinite(start) && end - start > MAX_OUTAGE_DAYS * 86_400_000) errors.endDate = `Un apagón no puede durar más de ${MAX_OUTAGE_DAYS} días.`;
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { started_at: localToIso(v.startDate, v.startTime), ended_at: v.ongoing ? null : localToIso(v.endDate, v.endTime), cause: v.cause, note: note === '' ? null : note },
  };
}

/** 45 → «45 min»; 120 → «2 h»; 150 → «2 h 30 min»; 1620 → «1 d 3 h». */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  return mins > 0 ? `${hours} h ${mins} min` : `${hours} h`;
}

/** «2026-10» → «oct 2026». */
export function formatMonthKey(key: string): string {
  const names = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const [year, month] = key.split('-').map(Number);
  return `${names[(month ?? 1) - 1] ?? key} ${year}`;
}

export function outageSummaryLine(o: Pick<OutageOut, 'ongoing' | 'duration_minutes' | 'cause'>): string {
  const how = o.ongoing || o.duration_minutes === null ? 'Todavía sin luz' : formatDuration(o.duration_minutes);
  return `${how} · ${OUTAGE_CAUSES[o.cause]}`;
}
