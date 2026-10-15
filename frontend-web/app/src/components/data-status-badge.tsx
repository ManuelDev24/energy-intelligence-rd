import { QUALITY, shouldLabel, type Quality } from "@energyrd/core";
import { cn } from "@/lib/cn";

interface DataStatusBadgeProps {
  quality: Quality;
  /** Mostrar también REAL (leyendas). Por defecto lo REAL no se etiqueta: es el caso normal. */
  always?: boolean;
  className?: string;
}

/**
 * Etiqueta de calidad del dato (REAL / ESTIMADO / PROYECTADO / INFERIDO).
 * Color y texto vienen de `QUALITY` en @energyrd/core (mismos que el móvil). INFERIDO lleva
 * borde punteado para distinguirse sin depender solo del color.
 */
export function DataStatusBadge({ quality, always = false, className }: DataStatusBadgeProps) {
  if (!always && !shouldLabel(quality)) return null;
  const q = QUALITY[quality];
  const inferred = quality === "INFERRED";
  return (
    <span
      title={q.description}
      data-quality={quality}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold tracking-wide",
        inferred ? "border-dashed" : "border-transparent",
        className,
      )}
      style={{ color: q.fg, backgroundColor: q.bg, borderColor: inferred ? q.fg : undefined }}
    >
      {q.label}
    </span>
  );
}
