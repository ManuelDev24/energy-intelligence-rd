import type { Reading, ReadingInput } from "@/lib/api/schemas";
import { formatNumber } from "@/lib/format";
import { formatReadAt, isIsoDate, isTime, localToIso } from "@/lib/rd-time";

// Validación de ENTRADA (espejo de la API, para dar feedback inmediato). La API sigue siendo la
// autoridad: vuelve a comprobar todo con la vivienda bloqueada.
const DECIMAL = /^\d{1,10}(\.\d{1,2})?$/;
/** La API admite relojes desfasados hasta 5 minutos. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export interface ReadingFormValues {
  date: string;
  time: string;
  reading_kwh: string;
  note: string;
}
export type ReadingFormErrors = Partial<Record<keyof ReadingFormValues, string>>;
export type ReadingFormResult = { ok: true; value: ReadingInput & { note: string | null } } | { ok: false; errors: ReadingFormErrors };

/** Lecturas inmediatamente anterior y siguiente en el tiempo (para la pista de monotonía). */
export function neighbours(readings: readonly Reading[], readAt: string) {
  const at = Date.parse(readAt);
  let previous: Reading | undefined;
  let next: Reading | undefined;
  for (const r of readings) {
    const t = Date.parse(r.read_at);
    if (t < at && (!previous || t > Date.parse(previous.read_at))) previous = r;
    if (t > at && (!next || t < Date.parse(next.read_at))) next = r;
  }
  return { previous, next };
}

const describe = (r: Reading) => `${formatNumber(r.reading_kwh)} kWh, ${formatReadAt(r.read_at)}`;

export function validateReadingForm(values: ReadingFormValues, readings: readonly Reading[], now: Date = new Date()): ReadingFormResult {
  const errors: ReadingFormErrors = {};
  const kwh = values.reading_kwh.trim();
  const note = values.note.trim();
  if (!isIsoDate(values.date)) errors.date = "Elige la fecha de la lectura.";
  if (!isTime(values.time)) errors.time = "Indica la hora (HH:MM).";
  if (kwh === "") errors.reading_kwh = "Escribe el número que marca el medidor.";
  else if (kwh.startsWith("-")) errors.reading_kwh = "La lectura no puede ser negativa.";
  else if (!DECIMAL.test(kwh)) errors.reading_kwh = "Número con hasta 2 decimales (usa punto: 1250.5).";
  if (note.length > 255) errors.note = "Máximo 255 caracteres.";

  if (!errors.date && !errors.time) {
    const readAt = localToIso(values.date, values.time);
    const at = Date.parse(readAt);
    if (at > now.getTime() + FUTURE_TOLERANCE_MS) errors.date = "La lectura no puede estar en el futuro.";
    else if (readings.some((r) => Date.parse(r.read_at) === at)) errors.date = "Ya existe una lectura con esa fecha y hora.";
    else if (!errors.reading_kwh) {
      const { previous, next } = neighbours(readings, readAt);
      if (previous && Number(kwh) < Number(previous.reading_kwh)) {
        errors.reading_kwh = `Debe ser mayor o igual que la lectura anterior (${describe(previous)}). El cambio de medidor aún no está soportado.`;
      } else if (next && Number(kwh) > Number(next.reading_kwh)) {
        errors.reading_kwh = `Debe ser menor o igual que la lectura siguiente (${describe(next)}).`;
      }
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { read_at: localToIso(values.date, values.time), reading_kwh: kwh, note: note || null } };
}
