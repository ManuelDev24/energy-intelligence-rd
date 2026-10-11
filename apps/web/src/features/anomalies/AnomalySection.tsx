"use client";

import { canInvestigate } from "@energyrd/core";
import Link from "next/link";
import { AlertCard } from "@/components/alert-card";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import type { Anomaly } from "@/lib/api/schemas";
import { formatAnomaly, investigateHref } from "./anomaly";

const linkClass = "inline-flex h-11 items-center gap-1 rounded-lg px-1 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export function AnomalySection({ anomalies, isLoading = false, onDismiss, pendingId }: {
  anomalies?: Anomaly[]; isLoading?: boolean; onDismiss?: (anomaly: Anomaly) => void; pendingId?: string | null;
}) {
  if (isLoading) return null;
  return (
    <section aria-labelledby="dash-anomalies" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id="dash-anomalies" className="text-lg font-semibold">Desviaciones detectadas</h2>
        <p className="text-sm text-muted-foreground">Comparación con tu historial de lecturas y facturas; no identifica equipos. La confianza indica cuánto respaldan los datos cada hallazgo.</p>
      </div>
      {anomalies?.length ? anomalies.map((anomaly) => {
        const view = formatAnomaly(anomaly);
        return (
          <AlertCard key={anomaly.id} tone={anomaly.severity} title={view.title} meta={view.delta ?? undefined}
            footer={`${view.period} · Observado: ${view.observed} · ${view.baselineLabel}: ${view.baseline} · ${view.confidence}`}
            action={
              <div className="flex flex-wrap items-center gap-x-3">
                {canInvestigate(anomaly) ? (
                  <Link href={investigateHref(anomaly)} aria-label={`Investigar en Consumo la desviación de ${view.period}`} className={linkClass}>
                    Investigar en Consumo
                  </Link>
                ) : null}
                {anomaly.bill_id ? (
                  <Link href={`/bills/${anomaly.bill_id}`} aria-label={`Ver la factura de la desviación de ${view.period}`} className={linkClass}>
                    Ver factura
                  </Link>
                ) : null}
                {onDismiss ? (
                  <Button type="button" variant="outline" disabled={pendingId === anomaly.id} onClick={() => onDismiss(anomaly)}
                    aria-label={`Descartar la desviación de ${view.period}`}>
                    Descartar
                  </Button>
                ) : null}
              </div>
            }>
            <p>{view.explanation}</p>
            <p className="mt-1 text-xs text-muted-foreground">{view.confidenceHelp}</p>
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
