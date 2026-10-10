import { validateRange } from '@energyrd/core';

// ERD-UI-KIT: lógica pura del selector de rango móvil (sin React Native, probada con vitest).
/** Acepta "2026-9-5" y "2026-09-05"; devuelve AAAA-MM-DD o el texto tal cual si no tiene forma de fecha. */
export function normalizeDateInput(value: string): string {
  const match = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(value);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : value.trim();
}

/** Mensaje de error del rango personalizado o null. Reglas de la API + «no posterior a hoy» (como el `max` de la web). */
export function customRangeError(from: string, to: string, today: string): string | null {
  const a = normalizeDateInput(from);
  const b = normalizeDateInput(to);
  const base = validateRange(a, b);
  if (base) return base === 'Elige las dos fechas del rango.' ? 'Escriba las dos fechas con el formato AAAA-MM-DD.' : base;
  if (b > today) return 'La fecha final no puede ser posterior a hoy.';
  return null;
}

export const canApplyRange = (from: string, to: string, today: string) => customRangeError(from, to, today) === null;
export const applyRange = (from: string, to: string) => ({ from: normalizeDateInput(from), to: normalizeDateInput(to) });
