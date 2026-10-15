// Formulario de lectura del medidor (ERD-CONS-01). Puro: valida igual que la API para que el
// usuario vea el problema antes de enviar. La API sigue siendo la autoridad (422/409).
import type { ReadingInput } from '@energyrd/api-contracts';
import { ApiError } from '@energyrd/api-client';
import { fmtKwh } from '@energyrd/core';

import { describeError } from '../../api/errors';
import { parseDate } from '../../lib/billForm';
import { localParts, parseTime, toReadingIso, todayRD } from '../../lib/rdTime';

export interface ReadingFormValues {
  date: string;
  time: string;
  kwh: string;
  note: string;
}
export type ReadingFormErrors = Partial<Record<keyof ReadingFormValues, string>>;
export interface ReadingLike {
  read_at: string;
  reading_kwh: string;
}

export const NOTE_MAX = 255;
const INT_DIGITS = 10;

/**
 * "1,250.50" / "1,000" / "1250,5" -> "1250.50" / "1000" / "1250.5" (texto, sin pasar por float).
 * Con coma y punto, la coma es de miles. Solo comas: si separan grupos de 3 cifras son de miles
 * (la app muestra "1,000 kWh"); si no, es coma decimal. null si no es un decimal.
 */
export function normalizeDecimal(value: string): string | null {
  let t = value.trim().replace(/\s/g, '');
  if (!t) return null;
  if (t.includes(',') && t.includes('.')) t = t.replace(/,/g, '');
  else if (/^-?\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, '');
  else if (t.includes(',')) t = t.replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(t) ? t : null;
}

/** Errores de un decimal de la API (≤ 10 enteros, ≤ 2 decimales). */
export function decimalError(normalized: string): string | null {
  const [int, frac = ''] = normalized.replace(/^-/, '').split('.');
  if (frac.length > 2) return 'Use como máximo 2 decimales.';
  if (int.replace(/^0+(?=\d)/, '').length > INT_DIGITS) return 'El valor es demasiado grande.';
  return null;
}

const describe = (r: ReadingLike) => `${fmtKwh(r.reading_kwh)}, ${localParts(r.read_at)?.label ?? r.read_at}`;

export function validateReading(
  v: ReadingFormValues,
  existing: readonly ReadingLike[],
  now: Date = new Date(),
): { errors: ReadingFormErrors; input: ReadingInput | null } {
  const errors: ReadingFormErrors = {};
  if (!parseDate(v.date.trim())) errors.date = 'Use el formato AAAA-MM-DD.';
  if (!parseTime(v.time)) errors.time = 'Use el formato HH:MM (24 h).';

  const kwh = normalizeDecimal(v.kwh);
  if (kwh === null) errors.kwh = 'Ingrese un número.';
  else if (Number(kwh) < 0) errors.kwh = 'La lectura no puede ser negativa.';
  else {
    const e = decimalError(kwh);
    if (e) errors.kwh = e;
  }

  const note = v.note.trim();
  if (Array.from(note).length > NOTE_MAX) errors.note = `Máximo ${NOTE_MAX} caracteres.`;

  const iso = !errors.date && !errors.time ? toReadingIso(v.date.trim(), v.time) : null;
  if (iso) {
    const at = Date.parse(iso);
    if (at > now.getTime()) {
      if (v.date.trim() > todayRD(now)) errors.date = 'La lectura no puede ser futura.';
      else errors.time = 'La lectura no puede ser futura.';
    } else {
      const sorted = [...existing].sort((a, b) => Date.parse(a.read_at) - Date.parse(b.read_at));
      if (sorted.some((r) => Date.parse(r.read_at) === at)) errors.time = 'Ya existe una lectura en esa fecha y hora.';
      else if (kwh !== null && !errors.kwh) {
        const prev = [...sorted].reverse().find((r) => Date.parse(r.read_at) < at);
        const next = sorted.find((r) => Date.parse(r.read_at) > at);
        // Monotonía no decreciente: no hay soporte de cambio de medidor.
        if (prev && Number(kwh) < Number(prev.reading_kwh))
          errors.kwh = `Debe ser mayor o igual a la lectura anterior (${describe(prev)}).`;
        else if (next && Number(kwh) > Number(next.reading_kwh))
          errors.kwh = `Debe ser menor o igual a la lectura siguiente (${describe(next)}).`;
      }
    }
  }

  if (Object.keys(errors).length > 0 || !iso || kwh === null) return { errors, input: null };
  return { errors, input: { read_at: iso, reading_kwh: kwh, note: note || null } };
}

/** Pista bajo el campo kWh: la lectura más reciente (la nueva no puede ser menor). */
export function lastReadingHint(existing: readonly ReadingLike[]): string | null {
  const last = [...existing].sort((a, b) => Date.parse(b.read_at) - Date.parse(a.read_at))[0];
  if (!last) return null;
  return `Última lectura: ${fmtKwh(last.reading_kwh)} el ${localParts(last.read_at)?.label ?? last.read_at}. La nueva debe ser igual o mayor.`;
}

/** Mensaje de error del envío: textos locales propios de lecturas; el resto vía describeError. */
export function readingErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) return 'Ya existe una lectura en esa fecha y hora.';
  if (error instanceof ApiError && error.status === 422 && Object.keys(error.fieldErrors).length === 0)
    return 'La lectura no es válida: debe ser mayor o igual a la anterior, menor o igual a la siguiente y no futura.';
  return describeError(error).message;
}

/** Campos de la API -> campos del formulario (los mensajes ya son locales, ver api/errors.ts). */
export const READING_FIELD_MAP: Record<string, keyof ReadingFormValues> = { read_at: 'date', reading_kwh: 'kwh', note: 'note' };
