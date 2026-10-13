import { cn } from "@/lib/cn";

/** Bloque gris que ocupa el sitio del contenido mientras carga. Solo late si el usuario acepta movimiento. */
export function LoadingSkeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rounded-xl bg-muted motion-safe:animate-pulse", className)} />;
}
