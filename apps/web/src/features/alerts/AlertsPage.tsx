"use client";

import { fmtNumber, fmtPct } from "@energyrd/core";
import { BellOff, Check, X } from "lucide-react";
import { AlertCard } from "@/components/alert-card";
import { EmptyState } from "@/components/empty-state";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { useAlerts, useSetAlertStatus } from "@/lib/api/hooks";
import { formatPeriod } from "@/lib/format";
import { useSession } from "@/lib/session";

export default function AlertsPage() {
  const { homeId } = useSession();
  const { data, isLoading, error, refetch } = useAlerts(homeId ?? "");
  const setStatus = useSetAlertStatus(homeId ?? "");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Alertas</h1>
        <p className="text-pretty text-sm text-muted-foreground">
          Se generan cuando el consumo de una factura sube por encima del umbral frente a la anterior.
        </p>
      </header>
      {setStatus.isError ? (
        <p role="alert" className="rounded-lg bg-danger-bg p-3 text-sm text-danger">
          No se pudo actualizar la alerta: {setStatus.error.message}
        </p>
      ) : null}
      <QueryState isLoading={isLoading} error={error} onRetry={() => void refetch()}>
        {data && data.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title="Sin alertas"
            hint="Tu consumo está dentro de lo esperado. Te avisaremos si sube de golpe."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {data?.map((a) => {
              const unread = a.status === "unread";
              return (
                <AlertCard
                  key={a.id}
                  as="li"
                  tone={a.severity}
                  meta={
                    <>
                      {unread ? (
                        <span className="rounded-full bg-danger px-2 text-[10px] font-bold uppercase text-white">nueva</span>
                      ) : null}
                      {a.kwh_pct ? (
                        <span className="ml-auto tabular-nums text-foreground">{fmtPct(a.kwh_pct)}</span>
                      ) : null}
                    </>
                  }
                  footer={
                    a.basis_period_start && a.basis_period_end ? (
                      <p>
                        Período base: {formatPeriod(a.basis_period_start, a.basis_period_end)}
                        {a.threshold_pct ? ` · umbral ${fmtNumber(a.threshold_pct, 0)}%` : ""}
                      </p>
                    ) : null
                  }
                  action={
                    <>
                      {unread ? (
                        <Button
                          variant="outline"
                          className="h-11"
                          onClick={() => setStatus.mutate({ id: a.id, status: "read" })}
                        >
                          <Check className="mr-1 h-4 w-4" aria-hidden /> Marcar leída
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        className="h-11"
                        onClick={() => setStatus.mutate({ id: a.id, status: "dismissed" })}
                      >
                        <X className="mr-1 h-4 w-4" aria-hidden /> Descartar
                      </Button>
                    </>
                  }
                >
                  {a.message}
                </AlertCard>
              );
            })}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
