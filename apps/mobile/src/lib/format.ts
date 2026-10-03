const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function fmtNumber(value: string | number, decimals = 2): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export const fmtKwh = (v: string | number) => `${fmtNumber(v, Number(v) % 1 ? 2 : 0)} kWh`;
export const fmtDop = (v: string | number) => `RD$ ${fmtNumber(v, 2)}`;

export function fmtSigned(value: string | number, suffix = ''): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${fmtNumber(Math.abs(n), 2)}${suffix}`;
}

/** "2026-08-01" -> "1 ago 2026" (sin depender de zona horaria). */
export function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export const fmtPeriod = (start: string, end: string) => `${fmtDate(start)} – ${fmtDate(end)}`;
