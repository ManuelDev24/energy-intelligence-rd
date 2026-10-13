// Hora de República Dominicana (UTC−4 fijo). La aritmética vive en @energyrd/core (rdTime/range); aquí solo
// quedan los nombres que usa la web y lo que es propio de ella.
import { addDays, fmtDate, rangeDays, rdParts } from "@energyrd/core";

export { RD_OFFSET, isIsoDate, localToIso, nowTimeRD, todayRD } from "@energyrd/core";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isTime = (value: string) => TIME.test(value);

export const addDaysIso = addDays;

/** Días del rango, ambos extremos incluidos (como la API). */
export const inclusiveDays = rangeDays;

/** Instante ISO (cualquier zona) → fecha y hora locales de RD. Lanza RangeError si el texto no es un instante. */
export function isoToRD(iso: string): { date: string; time: string } {
  const parts = rdParts(iso);
  if (!parts) throw new RangeError("Invalid time value");
  return parts;
}

/** "2026-10-04T00:00:00Z" → "3 oct 2026, 20:00" (hora de RD). */
export function formatReadAt(iso: string): string {
  const { date, time } = isoToRD(iso);
  return `${fmtDate(date)}, ${time}`;
}
