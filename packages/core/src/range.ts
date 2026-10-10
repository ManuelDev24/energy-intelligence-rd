// Rangos de fechas de Consumo, compartidos por web y móvil (antes duplicados). Aritmética de calendario sobre texto
// ISO AAAA-MM-DD, sin zona horaria: el llamador pasa "hoy" en hora de RD (UTC−4 fijo).

/** Límite de la API para `GET /consumption` (rango inclusivo). */
export const MAX_RANGE_DAYS = 366;
export type RangePreset = '7d' | '30d' | '12m';
export type RangeGranularity = 'day' | 'week' | 'month';

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Fecha válida AAAA-MM-DD (rechaza 2026-02-30). */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const time = ms(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** Días del rango con ambos extremos incluidos (como la API). */
export const rangeDays = (from: string, to: string) => Math.round((ms(to) - ms(from)) / DAY_MS) + 1;

const addDays = (iso: string, days: number) => new Date(ms(iso) + days * DAY_MS).toISOString().slice(0, 10);

/** Mismas reglas que la API: fechas válidas, desde ≤ hasta y como máximo 366 días. null = válido. */
export function validateRange(from: string, to: string): string | null {
  if (!isIsoDate(from) || !isIsoDate(to)) return 'Elige las dos fechas del rango.';
  if (from > to) return 'La fecha inicial debe ser igual o anterior a la final.';
  if (rangeDays(from, to) > MAX_RANGE_DAYS) return `El rango no puede superar ${MAX_RANGE_DAYS} días.`;
  return null;
}

/** Rango de un atajo, terminando hoy. 12 meses empieza el día 1 del mes de hace 11 meses (meses completos). */
export function presetRange(preset: RangePreset, today: string): { from: string; to: string; granularity: RangeGranularity } {
  if (preset === '7d') return { from: addDays(today, -6), to: today, granularity: 'day' };
  if (preset === '30d') return { from: addDays(today, -29), to: today, granularity: 'day' };
  const [year, month] = today.split('-').map(Number);
  const index = year * 12 + (month - 1) - 11;
  const from = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
  return { from, to: today, granularity: 'month' };
}
