import { MAX_RANGE_DAYS, fmtDate, fmtMonth, presetRange as corePresetRange, validateRange, type RangePreset } from "@energyrd/core";
import type { Granularity } from "@/lib/api/schemas";

// La aritmética y las reglas del rango viven en @energyrd/core (compartidas con el móvil).
export { MAX_RANGE_DAYS, validateRange };

export type Preset = RangePreset;
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
export const presetRange = (preset: Preset, today: string): RangeQuery => corePresetRange(preset, today);

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
