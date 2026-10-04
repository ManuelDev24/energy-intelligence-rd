import type { EquipmentInput } from '../api/types';
import { parseDecimal } from './billForm';

export interface EquipmentFormValues {
  name: string;
  room: string;
  powerW: string;
  hoursPerDay: string;
}

export type EquipmentFormErrors = Partial<Record<keyof EquipmentFormValues, string>>;

export const MAX_POWER_W = 100_000;
export const MAX_HOURS = 24;

const hasMoreThan2Decimals = (s: string) => /[.,]\d{3,}$/.test(s.trim());

/** Mismas reglas que el backend: potencia 0–100 000 W, horas 0–24, máx. 2 decimales. */
export function validateEquipment(v: EquipmentFormValues): { errors: EquipmentFormErrors; input: EquipmentInput | null } {
  const errors: EquipmentFormErrors = {};
  const name = v.name.trim();
  if (!name) errors.name = 'Ingrese un nombre';
  else if (name.length > 120) errors.name = 'Máximo 120 caracteres';
  if (v.room.trim().length > 80) errors.room = 'Máximo 80 caracteres';

  const power = parseDecimal(v.powerW);
  if (power === null) errors.powerW = 'Ingrese un número';
  else if (power < 0) errors.powerW = 'No puede ser negativo';
  else if (power > MAX_POWER_W) errors.powerW = `Máximo ${MAX_POWER_W.toLocaleString('en-US')} W`;
  else if (hasMoreThan2Decimals(v.powerW)) errors.powerW = 'Máximo 2 decimales';

  const hours = parseDecimal(v.hoursPerDay);
  if (hours === null) errors.hoursPerDay = 'Ingrese un número';
  else if (hours < 0) errors.hoursPerDay = 'No puede ser negativo';
  else if (hours > MAX_HOURS) errors.hoursPerDay = 'Un día tiene 24 horas como máximo';
  else if (hasMoreThan2Decimals(v.hoursPerDay)) errors.hoursPerDay = 'Máximo 2 decimales';

  if (Object.keys(errors).length > 0) return { errors, input: null };
  return {
    errors,
    input: { name, room: v.room.trim() || null, power_w: String(power), hours_per_day: String(hours) },
  };
}

/** Vista previa local (W × h ÷ 1000). Solo orientativa: el valor oficial lo calcula la API. */
export function previewDailyKwh(v: EquipmentFormValues): number | null {
  const p = parseDecimal(v.powerW);
  const h = parseDecimal(v.hoursPerDay);
  if (p === null || h === null || p < 0 || h < 0 || h > MAX_HOURS) return null;
  return Math.round((p * h) / 10) / 100;
}
