// Hora local de República Dominicana: UTC−4 fijo todo el año (sin horario de verano).
// La API agrupa el consumo en America/Santo_Domingo; la app envía las lecturas con desfase explícito.
import { fmtDate } from '@energyrd/core';

import { parseDate } from './billForm';

export const RD_OFFSET = '-04:00';
const OFFSET_MS = -4 * 3600_000;
const pad = (n: number) => String(n).padStart(2, '0');

const shifted = (ms: number) => new Date(ms + OFFSET_MS);
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Fecha local RD ("AAAA-MM-DD") del instante dado. */
export const todayRD = (now: Date = new Date()) => ymd(shifted(now.getTime()));

/** Fecha y hora local RD (minutos) para precargar el formulario de lectura. */
export function nowRD(now: Date = new Date()) {
  const d = shifted(now.getTime());
  return { date: ymd(d), time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` };
}

/** Suma días de calendario a "AAAA-MM-DD" (sin zona: aritmética en UTC). */
export function addDays(date: string, days: number): string {
  const d = parseDate(date);
  if (!d) throw new Error(`Fecha inválida: ${date}`);
  return ymd(new Date(d.getTime() + days * 86400_000));
}

/** "8:05" -> "08:05"; null si no es una hora de 24 h válida. */
export function parseTime(value: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? `${pad(h)}:${pad(min)}` : null;
}

/** Fecha + hora locales -> ISO 8601 con "-04:00" (lo que exige la API: `read_at` con zona). */
export function toReadingIso(date: string, time: string): string | null {
  const t = parseTime(time);
  if (!parseDate(date) || !t) return null;
  return `${date}T${t}:00${RD_OFFSET}`;
}

/** Instante ISO (la API devuelve UTC) -> partes locales RD y etiqueta "1 oct 2026, 08:30". */
export function localParts(iso: string): { date: string; time: string; label: string } | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = shifted(ms);
  const date = ymd(d);
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return { date, time, label: `${fmtDate(date)}, ${time}` };
}
