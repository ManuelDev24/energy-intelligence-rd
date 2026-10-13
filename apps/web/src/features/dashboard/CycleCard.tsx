"use client";

import { currentCycle, fmtDate } from "@energyrd/core";
import Link from "next/link";
import { DataStatusBadge } from "@/components/data-status-badge";
import { Card, CardTitle } from "@/components/ui/card";
import { useConsumption } from "@/lib/api/hooks";
import { formatMetric, formatPeriod } from "@/lib/format";
import { todayRD } from "@/lib/rd-time";

/**
 * ERD-CHARTS-01: ciclo de facturación actual. Las fechas son una ESTIMACIÓN a partir de la última factura; el consumo es
 * lo que ya registran las lecturas del medidor (con su calidad y cobertura). Sin lecturas no se inventa un valor.
 */
export function CycleCard({ homeId, lastBill, today = todayRD() }: {
  homeId: string; lastBill: { period_start: string; period_end: string; days: number }; today?: string;
}) {
  const cycle = currentCycle(lastBill, today);
  const consumption = useConsumption(homeId, cycle.range ? { from: cycle.range.from, to: cycle.range.to, granularity: "day" } : null);
  const total = consumption.data?.totals.kwh ?? null;
  const percent = cycle.state === "upcoming" ? 0 : Math.round((cycle.elapsed / cycle.days) * 100);
  return (
    <Card role="region" aria-label="Ciclo actual">
      <CardTitle>Ciclo actual</CardTitle>
      <p className="mt-1 text-sm text-muted-foreground">
        {formatPeriod(cycle.start, cycle.end)} · fechas estimadas a partir de tu última factura; tu distribuidora puede facturar otro ciclo.
      </p>
      {cycle.state === "upcoming" ? (
        <p className="mt-3 text-sm">El ciclo estimado empieza el {fmtDate(cycle.start)}.</p>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between gap-3 text-sm">
            <span>{cycle.state === "overdue" ? `Los ${cycle.days} días del ciclo estimado ya pasaron: registra la factura.` : `Día ${cycle.elapsed} de ${cycle.days}`}</span>
            <span className="tabular-nums text-muted-foreground">{percent}%</span>
          </div>
          <div role="progressbar" aria-label="Avance del ciclo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-4 text-sm">
            {consumption.isLoading ? <p role="status">Cargando consumo del ciclo…</p> : null}
            {consumption.isError ? <p role="alert" className="text-danger">No se pudo cargar el consumo del ciclo.</p> : null}
            {total ? (
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold tabular-nums">{formatMetric(total.value, total.unit)}</span>
                <DataStatusBadge quality={total.quality} always />
                <span className="text-muted-foreground">según lecturas del medidor, solo en los días cubiertos.</span>
              </p>
            ) : consumption.isSuccess ? (
              <p>
                Aún no hay lecturas que cubran este ciclo.{" "}
                <Link href="/readings" className="text-primary underline underline-offset-2">Registrar lectura</Link>
              </p>
            ) : null}
          </div>
        </>
      )}
    </Card>
  );
}
