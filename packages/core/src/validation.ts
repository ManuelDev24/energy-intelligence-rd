// Validaciones de formularios compartidas (mismas reglas que la API: devuelve 422 si no se cumplen).

/** Acepta "1,234.5", "1234,5" o "1234.5". null si no es número. */
export function parseDecimal(s: string): number | null {
  let t = s.trim().replace(/\s/g, '');
  if (!t) return null;
  if (t.includes(',') && t.includes('.')) t = t.replace(/,/g, '');
  else if (t.includes(',')) t = t.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

export interface EquipmentFormValues {
  name: string;
  room: string;
  powerW: string;
  hoursPerDay: string;
}

export interface EquipmentPayload {
  name: string;
  room: string | null;
  power_w: string;
  hours_per_day: string;
}

export type EquipmentFormErrors = Partial<Record<keyof EquipmentFormValues, string>>;

export const MAX_POWER_W = 100_000;
export const MAX_HOURS = 24;

const hasMoreThan2Decimals = (s: string) => /[.,]\d{3,}$/.test(s.trim());

/** Potencia 0–100 000 W, horas 0–24, máx. 2 decimales; nombre 1–120, habitación ≤ 80. */
export function validateEquipment(v: EquipmentFormValues): {
  errors: EquipmentFormErrors;
  input: EquipmentPayload | null;
} {
  const errors: EquipmentFormErrors = {};
  const name = v.name.trim();
  if (!name) errors.name = 'Ingrese un nombre';
  else if (name.length > 120) errors.name = 'Máximo 120 caracteres';
  if (v.room.trim().length > 80) errors.room = 'Máximo 80 caracteres';

  const power = parseDecimal(v.powerW);
  if (power === null) errors.powerW = 'Ingrese un número';
  else if (power < 0) errors.powerW = 'No puede ser negativo';
  else if (power > MAX_POWER_W) errors.powerW = 'Máximo 100,000 W';
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

/** Vista previa local (W × h ÷ 1000). Orientativa: el valor oficial lo calcula la API. */
export function previewDailyKwh(v: Pick<EquipmentFormValues, 'powerW' | 'hoursPerDay'>): number | null {
  const p = parseDecimal(v.powerW);
  const h = parseDecimal(v.hoursPerDay);
  if (p === null || h === null || p < 0 || h < 0 || h > MAX_HOURS) return null;
  return Math.round((p * h) / 10) / 100;
}
