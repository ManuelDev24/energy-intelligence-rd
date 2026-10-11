import {
  equipmentIcon, equipmentKindLabel, equipmentMakeModel, fmtNumber, shareWidth, type EquipmentIcon,
} from "@energyrd/core";
import {
  Fan, Flame, Laptop, Lightbulb, Microwave, Pencil, Plug, Refrigerator, Snowflake, Trash2, Tv, WashingMachine, Waves,
  type LucideIcon,
} from "lucide-react";
import { DataStatusBadge } from "@/components/data-status-badge";
import { Button } from "@/components/ui/button";
import type { Equipment, EquipmentEstimateItem } from "@/lib/api/schemas";
import { formatMetric } from "@/lib/format";

/** Icono semántico (catálogo de @energyrd/core) → icono de lucide. */
export const LUCIDE_BY_ICON: Record<EquipmentIcon, LucideIcon> = {
  snowflake: Snowflake,
  refrigerator: Refrigerator,
  flame: Flame,
  "washing-machine": WashingMachine,
  tv: Tv,
  fan: Fan,
  lightbulb: Lightbulb,
  laptop: Laptop,
  microwave: Microwave,
  waves: Waves,
  plug: Plug,
};

/**
 * ERD-DEV-02: equipo en una lista. Icono, nombre, tipo y habitación, marca y modelo, potencia y uso declarados y, si la API
 * ya estimó, kWh/mes y su porcentaje del total de los equipos (calculado en el servidor, no aquí). Lo estimado lleva su
 * etiqueta; la barra acompaña al texto. Las acciones llevan el nombre del equipo.
 */
export function DeviceCard({
  item,
  estimate,
  onEdit,
  onDelete,
}: {
  item: Equipment;
  estimate?: EquipmentEstimateItem;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const Icon = LUCIDE_BY_ICON[equipmentIcon(item)];
  const makeModel = equipmentMakeModel(item);
  const hours = Number(item.hours_per_day);
  const subtitle = [equipmentKindLabel(item.kind), item.room].filter(Boolean).join(" · ");
  const share = estimate ? shareWidth(estimate.share_pct.value) : null;
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-labelledby={`dev-${item.id}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted" aria-hidden>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={`dev-${item.id}`} className="truncate font-semibold" title={item.name}>
            {item.name}
          </h3>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
          {makeModel ? (
            <p className="text-sm text-muted-foreground" data-testid="device-make-model">
              {makeModel}
            </p>
          ) : null}
        </div>
        {estimate ? <DataStatusBadge quality={estimate.monthly_kwh.quality} /> : null}
      </div>
      <p className="text-sm text-muted-foreground">
        {fmtNumber(item.power_w, 0)} W · {fmtNumber(item.hours_per_day, hours % 1 ? 2 : 0)} h/día
      </p>
      {estimate && share !== null ? (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
            <span className="whitespace-nowrap font-medium tabular-nums">≈ {formatMetric(estimate.monthly_kwh.value, "kWh")}/mes</span>
            <span className="tabular-nums text-muted-foreground" data-testid="device-share">
              {formatMetric(estimate.share_pct.value, "%")} del total estimado
            </span>
          </div>
          <div aria-hidden className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-chart-estimated" style={{ width: `${Math.max(2, share)}%` }} />
          </div>
        </div>
      ) : null}
      {onEdit || onDelete ? (
        <div className="flex justify-end gap-1">
          {onEdit ? (
            <Button size="sm" variant="outline" aria-label={`Editar ${item.name}`} onClick={onEdit}>
              <Pencil className="h-4 w-4" aria-hidden />
            </Button>
          ) : null}
          {onDelete ? (
            <Button size="sm" variant="outline" aria-label={`Eliminar ${item.name}`} onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-danger" aria-hidden />
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
