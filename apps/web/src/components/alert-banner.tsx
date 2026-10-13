import type { Severity } from "@energyrd/core";
import type { ReactNode } from "react";
import { AlertCard } from "@/components/alert-card";

/**
 * Compatibilidad: aviso urgente de una alerta de la API (crítica/advertencia).
 * Ahora es un AlertCard que se anuncia al aparecer; usa AlertCard directamente en código nuevo.
 */
export function AlertBanner({
  severity,
  message,
  children,
}: {
  severity: Severity;
  message: string;
  children?: ReactNode;
}) {
  return (
    <AlertCard tone={severity} announce action={children}>
      {message}
    </AlertCard>
  );
}
