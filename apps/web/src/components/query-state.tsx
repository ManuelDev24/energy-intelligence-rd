"use client";

import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { userMessage } from "@/lib/api/errors";

interface QueryStateProps {
  isLoading: boolean;
  error: Error | null;
  onRetry?: () => void;
  /** Forma del contenido mientras carga (evita saltos de layout). Por defecto, 3 bloques. */
  skeleton?: ReactNode;
  /** Mensaje local para el error. Si falta, se elige por estado HTTP; el texto de la API nunca se muestra. */
  errorMessage?: string;
  children: ReactNode;
}

// Compatibilidad: estas piezas viven ahora en su propio archivo (ERD-UI-KIT).
export { EmptyState, ErrorState, LoadingSkeleton };
export const Skeleton = LoadingSkeleton;

/** Orquesta los estados de una consulta: cargando → error (con Reintentar) → contenido. */
export function QueryState({ isLoading, error, onRetry, skeleton, errorMessage, children }: QueryStateProps) {
  if (isLoading) {
    return (
      <div role="status" aria-label="Cargando" className="flex flex-col gap-4">
        {skeleton ?? (
          <>
            <LoadingSkeleton className="h-28" />
            <LoadingSkeleton className="h-40" />
            <LoadingSkeleton className="h-24" />
          </>
        )}
        <span className="sr-only">Cargando…</span>
      </div>
    );
  }
  if (error) return <ErrorState message={errorMessage ?? userMessage(error, "load")} onRetry={onRetry} />;
  return <>{children}</>;
}
