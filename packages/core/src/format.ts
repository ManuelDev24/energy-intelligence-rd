// Formato de presentación único para web y móvil. Nunca aritmética de negocio.
// Determinista: no depende de Intl/locale (Hermes no trae todos los locales).
// Convención Energy RD: miles con coma, decimales con punto, moneda con prefijo "RD$ ",
// porcentaje pegado al número ("+50.00%"), fechas "1 ago 2026".

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;
const MINUS = '−'; // U+2212: mismo ancho que "+", se lee mejor en tablas

type Num = string | number;

const toNumber = (v: Num): number => (typeof v === 'number' ? v : Number(v));

/** "5600" -> "5,600.00". `decimals` por defecto 2. Valores no numéricos -> "—". */
export function fmtNumber(value: Num, decimals = 2): string {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return '—';
  const [int, frac] = Math.abs(n).toFixed(decimals).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${n < 0 ? '-' : ''}${grouped}${frac ? `.${frac}` : ''}`;
}

/** Decimales solo si aportan: 400 -> "400", 12.9 -> "12.90". */
export const fmtSmart = (value: Num): string => {
  const n = toNumber(value);
  return fmtNumber(n, Number.isFinite(n) && n % 1 !== 0 ? 2 : 0);
};

export const fmtKwh = (v: Num) => `${fmtSmart(v)} kWh`;
export const fmtDop = (v: Num) => {
  const n = toNumber(v);
  return n < 0 ? `${MINUS}RD$ ${fmtNumber(-n, 2)}` : `RD$ ${fmtNumber(n, 2)}`;
};

/** Con signo explícito: +160 / −10.87 / 0. */
export function fmtSigned(value: Num, decimals = 2): string {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? MINUS : '';
  return `${sign}${fmtNumber(Math.abs(n), decimals)}`;
}

export const fmtPct = (v: Num, { signed = true } = {}) =>
  `${signed ? fmtSigned(v) : fmtNumber(v)}%`;

/**
 * Formatea un valor con la unidad que envía la API (`Metric.unit`).
 * `signed` para deltas (comparaciones).
 */
export function fmtMetric(value: Num, unit: string, { signed = false } = {}): string {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return '—';
  switch (unit) {
    case 'RD$':
      return signed && n > 0 ? `+${fmtDop(n)}` : fmtDop(n);
    case '%':
      return fmtPct(n, { signed });
    case 'kWh':
      return `${signed ? fmtSigned(n, n % 1 ? 2 : 0) : fmtSmart(n)} kWh`;
    case 'RD$/kWh':
      return `RD$ ${fmtNumber(n, 2)}/kWh`;
    case 'kWh/día':
    case 'kWh/mes':
      return `${fmtNumber(n, 2)} ${unit}`;
    default:
      return `${signed ? fmtSigned(n) : fmtNumber(n)} ${unit}`.trim();
  }
}

const parseIso = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? { y: m[1], m: Number(m[2]), d: Number(m[3]) } : null;
};

/** "2026-08-01" -> "1 ago 2026" (sin zona horaria). */
export function fmtDate(iso: string): string {
  const p = parseIso(iso);
  return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : iso;
}

/** "2026-08-01".."2026-08-31" -> "1–31 ago 2026"; cruces de mes/año se escriben completos. */
export function fmtPeriod(start: string, end: string): string {
  const a = parseIso(start);
  const b = parseIso(end);
  if (!a || !b) return `${start} – ${end}`;
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  if (a.y === b.y) return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

/** "2026-08-31" -> "ago 2026" (etiqueta de mes de una factura, por su fecha de fin). */
export function fmtMonth(iso: string, { short = false } = {}): string {
  const p = parseIso(iso);
  if (!p) return iso;
  return short ? `${MONTHS[p.m - 1]} ${p.y.slice(2)}` : `${MONTHS[p.m - 1]} ${p.y}`;
}
