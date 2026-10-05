import { fmtMetric, type Quality } from "@energyrd/core";
import { DataStatusBadge } from "@/components/data-status-badge";
import { cn } from "@/lib/cn";

export interface MetricDelta {
  /** Variación porcentual tal como la envía la API ("50.00", "-12.5"). */
  pct: string | number;
  /** Contra qué se compara, en lenguaje simple: "vs. período anterior". */
  label: string;
  quality?: Quality;
  /**
   * Qué dirección es buena. En energía y dinero, bajar es bueno (por defecto "down");
   * el color comunica el significado, la flecha y el signo comunican la dirección.
   */
  goodWhen?: "down" | "up";
}

interface MetricCardProps {
  label: string;
  /** Valor ya formateado. Si `unit` viene aparte, se escribe a continuación ("420" + "kWh"). */
  value: string;
  unit?: string;
  quality?: Quality;
  delta?: MetricDelta | null;
  /** Explicación corta: qué significa el número (p. ej. qué es un kWh). */
  helper?: string;
  /** Etiquetar también REAL (p. ej. donde conviven REAL y ESTIMADO y conviene distinguirlos). */
  alwaysLabel?: boolean;
  className?: string;
}

function DeltaLine({ pct, label, quality, goodWhen = "down" }: MetricDelta) {
  const n = Number(pct);
  const dir = !Number.isFinite(n) || n === 0 ? "flat" : n > 0 ? "up" : "down";
  const good = dir !== "flat" && dir === goodWhen;
  const tone = dir === "flat" ? "text-muted-foreground" : good ? "text-success" : "text-warning";
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "=";
  const words = dir === "up" ? "Sube" : dir === "down" ? "Baja" : "Sin cambio";
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-medium", tone)}>
      <span aria-hidden>{arrow}</span>
      <span className="sr-only">{words}</span>
      <span className="tabular-nums">{fmtMetric(pct, "%", { signed: true })}</span>
      <span className="font-normal text-muted-foreground">{label}</span>
      {quality ? <DataStatusBadge quality={quality} /> : null}
    </p>
  );
}

/**
 * Tarjeta de una métrica: etiqueta, valor grande con cifras tabulares, calidad del dato
 * (solo si no es REAL), variación opcional con flecha + signo + texto y una ayuda corta.
 */
export function MetricCard({ label, value, unit, quality, delta, helper, alwaysLabel = false, className }: MetricCardProps) {
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-xl border border-border bg-background p-4", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="flex flex-wrap items-center gap-2">
        <span className="text-2xl font-bold tabular-nums tracking-tight">
          {value}
          {unit ? ` ${unit}` : null}
        </span>
        {quality ? <DataStatusBadge quality={quality} always={alwaysLabel} /> : null}
      </p>
      {delta ? <DeltaLine {...delta} /> : null}
      {helper ? <p className="text-pretty text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}
