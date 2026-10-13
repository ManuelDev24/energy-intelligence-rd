// Hora de República Dominicana: America/Santo_Domingo es UTC−4 fijo todo el año (sin horario de verano), la misma
// convención que usa la API para buckets y meses. Es aritmética sobre texto ISO: no depende de la zona del dispositivo.
// Fuente única para web, móvil y las reglas de apagones (antes había tres copias).

export const RD_OFFSET = '-04:00';
export const RD_OFFSET_MS = -4 * 3_600_000;

/** Fecha de hoy en RD (AAAA-MM-DD). */
export function todayRD(now: Date = new Date()): string {
  return new Date(now.getTime() + RD_OFFSET_MS).toISOString().slice(0, 10);
}

/** Hora actual en RD (HH:MM). */
export function nowTimeRD(now: Date = new Date()): string {
  return new Date(now.getTime() + RD_OFFSET_MS).toISOString().slice(11, 16);
}

/** Fecha + hora locales de RD → ISO 8601 con zona explícita (lo que exige la API). */
export const localToIso = (date: string, time: string): string => `${date}T${time}:00${RD_OFFSET}`;

/** Instante ISO (cualquier zona) → fecha y hora locales de RD; `null` si el texto no es un instante válido. */
export function rdParts(iso: string): { date: string; time: string } | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const local = new Date(ms + RD_OFFSET_MS).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}
