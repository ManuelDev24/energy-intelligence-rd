// Formato de presentación de la web: adaptador sobre @energyrd/core (el mismo que usa el móvil),
// para que web y móvil muestren los números exactamente igual. Nunca aritmética de negocio.
import { fmtDate, fmtDop, fmtMetric, fmtNumber, fmtPeriod } from "@energyrd/core";

/** Separador de miles; conserva los decimales que envía la API (mínimo 2). */
export function formatNumber(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return fmtNumber(n, Math.max(2, (value.split(".")[1] ?? "").length));
}

/** Valor + unidad de la API con la convención común: "RD$ 5,600.00", "420 kWh", "+50.00%". */
export function formatMetric(value: string, unit: string, opts: { signed?: boolean } = {}): string {
  return Number.isFinite(Number(value)) ? fmtMetric(value, unit, opts) : `${value} ${unit}`;
}

export const formatDop = (value: string) => fmtDop(value);
export const formatDate = (iso: string) => fmtDate(iso);
export const formatPeriod = (start: string, end: string) => fmtPeriod(start, end);
