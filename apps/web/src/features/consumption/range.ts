import { fmtDate, fmtMonth } from "@energyrd/core";
import type { Granularity } from "@/lib/api/schemas";
import { addDaysIso, inclusiveDays, isIsoDate } from "@/lib/rd-time";

/** Límite de la API para /consumption (rango inclusivo). */
export const MAX_RANGE_DAYS = 366;

export type Preset = "7d" | "30d" | "12m";
export const PRESETS: { id: Preset; label: string }[] = [
  { id: "7d", label: "Últimos 7 días" },
  { id: "30d", label: "Últimos 30 días" },
  { id: "12m", label: "Últimos 12 meses" },
];

export const GRANULARITIES: { id: Granularity; label: string }[] = [
  { id: "day", label: "Día" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
];

export interface RangeQuery {
  granularity: Granularity;
  from: string;
  to: string;
}

/** Rango de un atajo, terminando hoy (RD). 12 meses empieza el día 1 para tener meses completos. */
export function presetRange(preset: Preset, today: string): RangeQuery {
  if (preset === "7d") return { from: addDaysIso(today, -6), to: today, granularity: "day" };
  if (preset === "30d") return { from: addDaysIso(today, -29), to: today, granularity: "day" };
  const [y, m] = today.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1 - 11, 1)).toISOString().slice(0, 10);
  return { from: start, to: today, granularity: "month" };
}

/** Mismas reglas que la API: fechas válidas, desde ≤ hasta y como máximo 366 días. */
export function validateRange(from: string, to: string): string | null {
  if (!isIsoDate(from) || !isIsoDate(to)) return "Elige las dos fechas del rango.";
  if (from > to) return "La fecha inicial debe ser igual o anterior a la final.";
  if (inclusiveDays(from, to) > MAX_RANGE_DAYS) return `El rango no puede superar ${MAX_RANGE_DAYS} días.`;
  return null;
}

const dayMonth = (iso: string) => fmtDate(iso).replace(/ \d{4}$/, "");

/** Etiqueta corta de un bucket: "4 oct", "28 sep – 4 oct" u "oct 2026". */
export function bucketLabel(bucket: { start: string; end: string }, granularity: Granularity): string {
  if (granularity === "month") return fmtMonth(bucket.start);
  if (granularity === "week" && bucket.start !== bucket.end) return `${dayMonth(bucket.start)} – ${dayMonth(bucket.end)}`;
  return dayMonth(bucket.start);
}

export interface GapRange {
  key: string;
  label: string;
  /** Cuántos buckets seguidos sin datos agrupa. */
  count: number;
  reason: string | null;
}

/** Agrupa buckets consecutivos sin datos (kWh null) con el mismo motivo: "1–19 sep: <motivo>". */
export function groupGaps(
  buckets: readonly { start: string; end: string; kwh: string | null; reason: string | null }[],
  granularity: Granularity,
): GapRange[] {
  const out: (GapRange & { start: string; end: string })[] = [];
  let open = false;
  for (const b of buckets) {
    const last = out[out.length - 1];
    if (b.kwh !== null) { open = false; continue; }
    if (open && last && last.reason === b.reason) {
      last.end = b.end;
      last.count += 1;
    } else {
      out.push({ key: b.start, start: b.start, end: b.end, label: "", count: 1, reason: b.reason });
      open = true;
    }
  }
  return out.map(({ start, end, ...g }) => ({
    ...g,
    label: g.count === 1 ? bucketLabel({ start, end }, granularity) : `${bucketLabel({ start, end: start }, granularity === "week" ? "day" : granularity)} – ${bucketLabel({ start: end, end }, granularity === "week" ? "day" : granularity)}`,
  }));
}
