import { fmtNumber } from "@energyrd/core";
import type { EquipmentEstimateItem, Metric } from "@/lib/api/schemas";
import { DataStatusBadge } from "@/components/data-status-badge";
import { formatMetric } from "@/lib/format";

interface EquipmentBreakdownChartProps {
  /** `items` de GET /equipment/estimate, tal cual. */
  items: readonly EquipmentEstimateItem[];
  /** `total_monthly_kwh` del mismo estimado (base del porcentaje). */
  total: Metric;
}

/**
 * CH-10: qué parte del consumo estimado explica cada equipo, de mayor a menor.
 * Barras horizontales en una lista semántica: el texto (kWh y %) es la información,
 * la barra solo la acompaña. Todo es ESTIMADO (equipos declarados × horas de uso).
 * Necesita al menos 2 equipos con consumo: con uno solo no hay reparto que comparar.
 */
const withConsumption = (items: readonly EquipmentEstimateItem[]) =>
  items
    .filter((i) => Number(i.monthly_kwh.value) > 0)
    .sort((a, b) => Number(b.monthly_kwh.value) - Number(a.monthly_kwh.value));

/** Hay reparto que mostrar: al menos 2 equipos con consumo y un total positivo. */
export const canShowBreakdown = (items: readonly EquipmentEstimateItem[], total: Metric) =>
  withConsumption(items).length >= 2 && Number(total.value) > 0;

export function EquipmentBreakdownChart({ items, total }: EquipmentBreakdownChartProps) {
  if (!canShowBreakdown(items, total)) return null;
  const totalKwh = Number(total.value);
  const rows = withConsumption(items);

  return (
    <figure className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {rows.map((it) => {
          // Proporción solo para presentar el reparto; los kWh vienen de la API.
          const share = (Number(it.monthly_kwh.value) / totalKwh) * 100;
          return (
            <li key={it.equipment_id} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium" title={it.name}>
                  {it.name}
                  {it.room ? <span className="font-normal text-muted-foreground"> · {it.room}</span> : null}
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatMetric(it.monthly_kwh.value, "kWh")}
                  <span className="text-muted-foreground"> · ≈{fmtNumber(share, 0)}%</span>
                </span>
              </div>
              <div aria-hidden className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-chart-estimated" style={{ width: `${Math.max(2, share)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <figcaption className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <DataStatusBadge quality={total.quality} always />
        kWh al mes según potencia y horas de uso declaradas; no es una medición de cada equipo.
      </figcaption>
    </figure>
  );
}
