"use client";

import { alertTarget, alertTitle, fmtNumber, fmtPct, SEVERITY_ORDER } from "@energyrd/core";
import { BellOff, Check, X } from "lucide-react";
import Link from "next/link";
import { AlertCard } from "@/components/alert-card";
import { EmptyState } from "@/components/empty-state";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { useAlerts, useSetAlertStatus } from "@/lib/api/hooks";
import { formatPeriod } from "@/lib/format";
import { userMessage } from "@/lib/api/errors";
import { useSession } from "@/lib/session";

const linkClass = "inline-flex h-11 items-center rounded-lg px-2 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export default function AlertsPage() {
  const { homeId } = useSession();
  const { data, isLoading, error, refetch } = useAlerts(homeId ?? "");
  const setStatus = useSetAlertStatus(homeId ?? "");
  // Lo urgente primero; dentro de cada gravedad, lo no leído primero (el orden de la API se conserva en los empates).
  const sorted = data ? [...data].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || Number(b.status === "unread") - Number(a.status === "unread")) : data;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Alertas</h1>
        <p className="text-pretty text-sm text-muted-foreground">
          Avisos de consumo que sube o baja, desviaciones detectadas, facturas por vencer y datos que faltan. Las importantes también
          te llegan por correo o al teléfono, según tus preferencias.
        </p>
      </header>
      {setStatus.isError ? (
        <p role="alert" className="rounded-lg bg-danger-bg p-3 text-sm text-danger">
          No se pudo actualizar la alerta: {userMessage(setStatus.error, "alert-update")}
        </p>
      ) : null}
      <QueryState isLoading={isLoading} error={error} onRetry={() => void refetch()}>
        {sorted && sorted.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title="Sin alertas"
            hint="Tu consumo está dentro de lo esperado. Te avisaremos si sube de golpe o si una factura está por vencer."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {sorted?.map((a) => {
              const unread = a.status === "unread";
              const target = alertTarget(a);
              const href = target === null ? null : target.kind === "bill" ? `/bills/${target.billId}` : target.kind === "new-bill" ? "/bills/new" : target.kind === "new-reading" ? "/readings" : "/dashboard";
              const title = alertTitle(a);
              return (
                <AlertCard
                  key={a.id}
                  as="li"
                  tone={a.severity}
                  title={title}
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
                      {target && href ? (
                        <Link href={href} aria-label={`${target.label}: ${title}`} className={linkClass}>{target.label}</Link>
                      ) : null}
                      {unread ? (
                        <Button
                          variant="outline"
                          onClick={() => setStatus.mutate({ id: a.id, status: "read" })}
                        >
                          <Check className="mr-1 h-4 w-4" aria-hidden /> Marcar leída
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
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
