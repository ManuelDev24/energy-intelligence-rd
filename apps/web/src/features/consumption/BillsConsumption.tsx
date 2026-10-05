"use client";

import { monthlySeries } from "@energyrd/core";
import { Receipt } from "lucide-react";
import Link from "next/link";
import { ConsumptionChart } from "@/components/consumption-chart";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { QueryState } from "@/components/query-state";
import { Card, CardTitle } from "@/components/ui/card";
import { useBills, useDashboard } from "@/lib/api/hooks";
import type { Metric } from "@/lib/api/schemas";
import { formatDop, formatMetric, formatPeriod } from "@/lib/format";
import { useSession } from "@/lib/session";

const show = (m: Metric) => formatMetric(m.value, m.unit);

/** Vista "Por factura" (la de siempre): evolución mensual según las facturas registradas. */
export function BillsConsumption() {
  const { homeId } = useSession();
  const { data, isLoading, error, refetch } = useBills(homeId ?? "");
  const dashboard = useDashboard(homeId ?? "");
  const projection = dashboard.data?.projection;
  const latest = dashboard.data?.latest_bill;
  const comparison = dashboard.data?.comparison;
  const series = data
    ? monthlySeries(data, projection ? { kwh: projection.kwh.value, amount_dop: projection.amount_dop.value } : null, 12)
    : [];
  const rows = [...(data ?? [])].sort((a, b) => b.period_end.localeCompare(a.period_end));

  return (
    <div className="flex flex-col gap-6">
      <p className="text-pretty text-sm text-muted-foreground">
        Evolución mensual según tus facturas. Las facturas no permiten conocer el consumo por hora.
      </p>
      <QueryState isLoading={isLoading} error={error} onRetry={() => void refetch()}>
        {data && data.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Aún no hay facturas registradas"
            hint="Registra una factura para ver tu evolución."
            action={
              <Link
                href="/bills/new"
                className="mt-2 inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                Registrar factura
              </Link>
            }
          />
        ) : (
          <>
            {latest ? (
              <section aria-label="Resumen de consumo" className="grid gap-4 sm:grid-cols-3">
                <MetricCard
                  label="Última factura"
                  value={show(latest.kwh)}
                  quality={latest.kwh.quality}
                  delta={
                    comparison?.kwh_pct
                      ? { pct: comparison.kwh_pct.value, label: "vs. período anterior", quality: comparison.kwh_pct.quality }
                      : null
                  }
                  helper={formatPeriod(latest.period_start, latest.period_end)}
                />
                {latest.avg_daily_kwh ? (
                  <MetricCard
                    label="Promedio diario"
                    value={show(latest.avg_daily_kwh)}
                    quality={latest.avg_daily_kwh.quality}
                    helper="kWh de la última factura repartidos entre sus días."
                  />
                ) : null}
                {projection ? (
                  <MetricCard
                    label="Próxima factura"
                    value={show(projection.kwh)}
                    quality={projection.kwh.quality}
                    helper={`≈ ${show(projection.amount_dop)} según la tendencia de tus facturas.`}
                  />
                ) : null}
              </section>
            ) : null}
            <Card>
              <CardTitle>Últimos 12 meses</CardTitle>
              <div className="mt-4">
                <ConsumptionChart series={series} height={240} />
              </div>
            </Card>
            <Card className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Consumo y monto por factura</caption>
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th scope="col" className="px-6 py-3 font-medium">Período</th>
                      <th scope="col" className="px-6 py-3 text-right font-medium">Consumo</th>
                      <th scope="col" className="px-6 py-3 text-right font-medium">Monto</th>
                      <th scope="col" className="px-6 py-3 text-right font-medium">Días</th>
                      <th scope="col" className="px-6 py-3 font-medium">Fuente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((b) => (
                      <tr key={b.id} className="border-b border-border last:border-0">
                        <th scope="row" className="px-6 py-3 font-medium">
                          {formatPeriod(b.period_start, b.period_end)}
                        </th>
                        <td className="px-6 py-3 text-right tabular-nums">{formatMetric(b.kwh, "kWh")}</td>
                        <td className="px-6 py-3 text-right tabular-nums">{formatDop(b.amount_dop)}</td>
                        <td className="px-6 py-3 text-right tabular-nums text-muted-foreground">{b.days} días</td>
                        <td className="px-6 py-3 text-muted-foreground">{b.source === "seed" ? "demo" : "manual"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </QueryState>
    </div>
  );
}
