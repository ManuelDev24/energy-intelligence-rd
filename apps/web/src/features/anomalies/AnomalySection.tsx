"use client";

import type { Anomaly } from "@/lib/api/schemas";
import { AlertCard } from "@/components/alert-card";
import { Card, CardTitle } from "@/components/ui/card";
import { formatAnomaly } from "./anomaly";

export function AnomalySection({ anomalies, isLoading = false }: { anomalies?: Anomaly[]; isLoading?: boolean }) {
  if (isLoading) return null;
  return (
    <section aria-labelledby="dash-anomalies" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id="dash-anomalies" className="text-lg font-semibold">Desviaciones detectadas</h2>
        <p className="text-sm text-muted-foreground">Comparación con el historial disponible; no identifica equipos ni usa datos horarios.</p>
      </div>
      {anomalies?.length ? anomalies.map((anomaly) => {
        const view = formatAnomaly(anomaly);
        return (
          <AlertCard key={`${anomaly.period_start}-${anomaly.period_end}-${anomaly.granularity}`} tone={anomaly.severity} title="Consumo fuera de lo habitual" meta={view.delta} footer={`${view.period} · Observado: ${view.observed} · Línea base: ${view.baseline}`}>
            {view.explanation}
          </AlertCard>
        );
      }) : (
        <Card>
          <CardTitle>Sin desviaciones recientes</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">No hay suficiente historial o no se detectaron desviaciones en este período.</p>
        </Card>
      )}
    </section>
  );
}
