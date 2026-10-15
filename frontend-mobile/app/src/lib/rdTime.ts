// Hora local de República Dominicana: UTC−4 fijo todo el año (sin horario de verano).
// La API agrupa el consumo en America/Santo_Domingo; la app envía las lecturas con desfase explícito.
import { fmtDate, localToIso, nowTimeRD, rdParts, todayRD } from '@energyrd/core';

import { parseDate } from './billForm';

export { RD_OFFSET, todayRD } from '@energyrd/core';

const pad = (n: number) => String(n).padStart(2, '0');

const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Fecha y hora local RD (minutos) para precargar el formulario de lectura. */
export function nowRD(now: Date = new Date()) {
  return { date: todayRD(now), time: nowTimeRD(now) };
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
  return localToIso(date, t);
}

/** Instante ISO (la API devuelve UTC) -> partes locales RD y etiqueta "1 oct 2026, 08:30". */
export function localParts(iso: string): { date: string; time: string; label: string } | null {
  const parts = rdParts(iso);
  return parts ? { ...parts, label: `${fmtDate(parts.date)}, ${parts.time}` } : null;
}
