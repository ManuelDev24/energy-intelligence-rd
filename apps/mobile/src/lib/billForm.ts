import type { BillInput } from '../api/types';

export interface BillFormValues {
  periodStart: string;
  periodEnd: string;
  days: string;
  kwh: string;
  amount: string;
  readingPrevious: string;
  readingCurrent: string;
}

export type BillFormErrors = Partial<Record<keyof BillFormValues, string>>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_PERIOD_DAYS = 366;

export function parseDate(s: string): Date | null {
  if (!DATE_RE.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

/** Acepta "1,250.50" y "1250,50" -> number; null si no es un decimal válido. */
export function parseDecimal(s: string): number | null {
  let t = s.trim().replace(/\s/g, '');
  if (!t) return null;
  if (t.includes(',') && t.includes('.')) t = t.replace(/,/g, '');
  else if (t.includes(',')) t = t.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Días entre fechas, ambos inclusive (1 ene - 31 ene = 31). null si inválido. */
export function inclusiveDays(start: string, end: string): number | null {
  const a = parseDate(start);
  const b = parseDate(end);
  if (!a || !b || b < a) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

export function validateBill(v: BillFormValues): { errors: BillFormErrors; input: BillInput | null } {
  const errors: BillFormErrors = {};
  const start = parseDate(v.periodStart);
  const end = parseDate(v.periodEnd);
  if (!start) errors.periodStart = 'Use el formato AAAA-MM-DD';
  if (!end) errors.periodEnd = 'Use el formato AAAA-MM-DD';
  if (start && end) {
    if (end < start) errors.periodEnd = 'El fin debe ser igual o posterior al inicio';
    else if ((end.getTime() - start.getTime()) / 86400000 > MAX_PERIOD_DAYS)
      errors.periodEnd = `El período no puede exceder ${MAX_PERIOD_DAYS} días`;
  }

  const kwh = parseDecimal(v.kwh);
  if (kwh === null) errors.kwh = 'Ingrese un número';
  else if (kwh < 0) errors.kwh = 'No puede ser negativo';

  const amount = parseDecimal(v.amount);
  if (amount === null) errors.amount = 'Ingrese un número';
  else if (amount < 0) errors.amount = 'No puede ser negativo';

  const days = parseDecimal(v.days);
  if (days === null || !Number.isInteger(days)) errors.days = 'Ingrese un número entero';
  else if (days < 0) errors.days = 'No puede ser negativo';
  else if (days > MAX_PERIOD_DAYS) errors.days = `Máximo ${MAX_PERIOD_DAYS}`;

  let rp: number | null = null;
  let rc: number | null = null;
  if (v.readingPrevious.trim()) {
    rp = parseDecimal(v.readingPrevious);
    if (rp === null) errors.readingPrevious = 'Ingrese un número';
    else if (rp < 0) errors.readingPrevious = 'No puede ser negativo';
  }
  if (v.readingCurrent.trim()) {
    rc = parseDecimal(v.readingCurrent);
    if (rc === null) errors.readingCurrent = 'Ingrese un número';
    else if (rc < 0) errors.readingCurrent = 'No puede ser negativo';
  }
  if (rp !== null && rc !== null && rc < rp && !errors.readingCurrent)
    errors.readingCurrent = 'Debe ser mayor o igual a la lectura anterior';

  if (Object.keys(errors).length > 0) return { errors, input: null };
  return {
    errors,
    input: {
      period_start: v.periodStart,
      period_end: v.periodEnd,
      kwh: String(kwh),
      amount_dop: String(amount),
      days: days as number,
      reading_previous: rp === null ? null : String(rp),
      reading_current: rc === null ? null : String(rc),
    },
  };
}
