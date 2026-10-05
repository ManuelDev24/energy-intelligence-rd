// Hora de República Dominicana: America/Santo_Domingo es UTC−4 fijo (sin horario de verano), la misma
// convención que usa la API para buckets y meses. Todo es aritmética de calendario sobre texto ISO,
// sin depender de la zona horaria del navegador.
import { fmtDate } from "@energyrd/core";

export const RD_OFFSET = "-04:00";
const RD_OFFSET_MS = -4 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Fecha válida AAAA-MM-DD (rechaza 2026-02-30). */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

export const isTime = (value: string) => TIME.test(value);

/** Fecha de hoy en RD (AAAA-MM-DD). */
export function todayRD(now: Date = new Date()): string {
  return new Date(now.getTime() + RD_OFFSET_MS).toISOString().slice(0, 10);
}

/** Hora actual en RD (HH:MM). */
export function nowTimeRD(now: Date = new Date()): string {
  return new Date(now.getTime() + RD_OFFSET_MS).toISOString().slice(11, 16);
}

export function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Días del rango, ambos extremos incluidos (como la API). */
export function inclusiveDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/** Fecha + hora locales de RD → ISO 8601 con zona explícita (lo que exige la API). */
export const localToIso = (date: string, time: string) => `${date}T${time}:00${RD_OFFSET}`;

/** Instante ISO (cualquier zona) → fecha y hora locales de RD. */
export function isoToRD(iso: string): { date: string; time: string } {
  const local = new Date(Date.parse(iso) + RD_OFFSET_MS).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

/** "2026-10-04T00:00:00Z" → "3 oct 2026, 20:00" (hora de RD). */
export function formatReadAt(iso: string): string {
  const { date, time } = isoToRD(iso);
  return `${fmtDate(date)}, ${time}`;
}
