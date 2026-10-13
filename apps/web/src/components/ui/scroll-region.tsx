import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface ScrollRegionProps extends HTMLAttributes<HTMLDivElement> {
  /** Nombre accesible de la región (obligatorio: un lector de pantalla debe saber qué se desplaza). */
  label: string;
}

/**
 * Contenedor con scroll horizontal para tablas anchas. Un área con scroll debe poder recorrerse con el teclado
 * (WCAG 2.1.1; regla axe `scrollable-region-focusable`), por eso es enfocable y tiene rol y nombre.
 */
export function ScrollRegion({ label, className, ...props }: ScrollRegionProps) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn("overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", className)}
      {...props}
    />
  );
}
