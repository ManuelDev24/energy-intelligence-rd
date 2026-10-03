"use client";

import { QueryState } from "@/components/query-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { useDashboard } from "@/lib/api/hooks";
import type { Metric } from "@/lib/api/schemas";
import { formatMetric, formatPeriod } from "@/lib/format";
import { useSession } from "@/lib/session";

function MetricRow({ label, metric }: { label: string; metric: Metric | null }) {
  if (!metric) return null;
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 font-medium">
        {formatMetric(metric.value, metric.unit)}
        <Badge>{metric.quality}</Badge>
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const { homeId } = useSession();
  const { data, isLoading, error } = useDashboard(homeId ?? "");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <QueryState isLoading={isLoading} error={error}>
        {data ? (
          <>
            <p className="text-sm text-muted-foreground">
              {data.home.name} · {data.home.distributor}
              {data.data_status.is_demo ? " · datos demo" : ""}
            </p>

            {data.alert ? (
              <Card role="alert" className="border-amber-400 bg-amber-50 text-amber-900">
                <CardTitle>
                  {data.alert.severity === "critical" ? "Alerta crítica" : "Aviso"}
                </CardTitle>
                <CardDescription className="text-amber-900">{data.alert.message}</CardDescription>
              </Card>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardTitle>Última factura</CardTitle>
                {data.latest_bill ? (
                  <>
                    <CardDescription>
                      {formatPeriod(data.latest_bill.period_start, data.latest_bill.period_end)} ·{" "}
                      {data.latest_bill.days} días
                    </CardDescription>
                    <div className="mt-3">
                      <MetricRow label="Consumo" metric={data.latest_bill.kwh} />
                      <MetricRow label="Monto" metric={data.latest_bill.amount_dop} />
                      <MetricRow label="Promedio diario" metric={data.latest_bill.avg_daily_kwh} />
                      <MetricRow label="Precio medio" metric={data.latest_bill.avg_price_per_kwh} />
                    </div>
                  </>
                ) : (
                  <CardDescription>Aún no hay facturas registradas.</CardDescription>
                )}
              </Card>

              <Card>
                <CardTitle>Comparación con el período anterior</CardTitle>
                {data.comparison ? (
                  <div className="mt-3">
                    <MetricRow label="Δ consumo" metric={data.comparison.kwh_delta} />
                    <MetricRow label="Δ consumo %" metric={data.comparison.kwh_pct} />
                    <MetricRow label="Δ monto" metric={data.comparison.amount_delta} />
                    <MetricRow label="Δ monto %" metric={data.comparison.amount_pct} />
                  </div>
                ) : (
                  <CardDescription>Sin período anterior para comparar.</CardDescription>
                )}
              </Card>

              <Card>
                <CardTitle>Proyección</CardTitle>
                {data.projection ? (
                  <>
                    <CardDescription>{data.projection.note}</CardDescription>
                    <div className="mt-3">
                      <MetricRow label="Consumo" metric={data.projection.kwh} />
                      <MetricRow label="Monto" metric={data.projection.amount_dop} />
                    </div>
                  </>
                ) : (
                  <CardDescription>Datos insuficientes para proyectar.</CardDescription>
                )}
              </Card>

              <Card>
                <CardTitle>Recomendación</CardTitle>
                <CardDescription>
                  {data.recommendation ?? "Sin recomendaciones por ahora."}
                </CardDescription>
              </Card>
            </div>

            <Card>
              <CardTitle>Estado de los datos</CardTitle>
              <CardDescription>
                {data.data_status.bills_count} facturas · fuente: {data.data_status.data_source} ·
                resolución {data.data_status.resolution}
              </CardDescription>
              {data.data_status.insufficient_reasons.length > 0 ? (
                <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
                  {data.data_status.insufficient_reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : null}
              <dl className="mt-3 grid gap-1 text-xs text-muted-foreground">
                {Object.entries(data.quality_legend).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="font-medium">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </>
        ) : null}
      </QueryState>
    </div>
  );
}
