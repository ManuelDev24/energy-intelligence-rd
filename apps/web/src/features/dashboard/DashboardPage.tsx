"use client";

import { QUALITY, fmtPct, monthlySeries, resolutionLabel, sourceLabel, suggestNextPeriod } from "@energyrd/core";
import { ArrowRight, Plus, Receipt } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AlertCard } from "@/components/alert-card";
import { ConsumptionChart } from "@/components/consumption-chart";
import { DataStatusBadge } from "@/components/data-status-badge";
import { EmptyState } from "@/components/empty-state";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { MetricCard } from "@/components/metric-card";
import { QueryState } from "@/components/query-state";
import { Card, CardTitle } from "@/components/ui/card";
import { GoalProgressSection } from "@/features/goal/GoalProgressCard";
import { AnomalySection } from "@/features/anomalies/AnomalySection";
import { useBills, useDashboard, useAnomalies } from "@/lib/api/hooks";
import type { Dashboard, Metric } from "@/lib/api/schemas";
import { formatMetric, formatPeriod } from "@/lib/format";
import { useSession } from "@/lib/session";

const show = (m: Metric, signed = false) => formatMetric(m.value, m.unit, { signed });

/** MetricCard a partir de una métrica de la API; si la API no la envía (null), no se muestra nada. */
function ApiMetricCard({
  label,
  metric,
  signed = false,
  deltaPct,
  helper,
}: {
  label: string;
  metric: Metric | null;
  signed?: boolean;
  /** Variación % de la API frente al período anterior. */
  deltaPct?: Metric | null;
  helper?: string;
}) {
  if (!metric) return null;
  return (
    <MetricCard
      label={label}
      value={show(metric, signed)}
      quality={metric.quality}
      delta={deltaPct ? { pct: deltaPct.value, label: "vs. período anterior", quality: deltaPct.quality } : null}
      helper={helper}
    />
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {description ? <p className="text-pretty text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Hero({ data }: { data: Dashboard }) {
  const p = data.projection;
  const last = data.latest_bill;
  if (!last) return null;
  // La variación de la proyección frente a la última factura la calcula la API (PROJECTED); aquí solo se muestra.
  const delta = p?.kwh_pct_vs_latest ? Number(p.kwh_pct_vs_latest.value) : null;
  return (
    <section
      aria-label="Resumen"
      className="flex flex-col gap-4 rounded-2xl bg-brand-900 p-6 text-white md:flex-row md:items-end md:justify-between"
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm text-white/70">{p ? "Próxima factura estimada" : "Última factura"}</p>
        <p className="text-4xl font-bold tabular-nums tracking-tight">
          {formatMetric((p ? p.amount_dop : last.amount_dop).value, "RD$")}
        </p>
        <p className="flex flex-wrap items-center gap-2 text-sm text-white/80">
          {formatMetric((p ? p.kwh : last.kwh).value, "kWh")}
          {p ? <DataStatusBadge quality="PROJECTED" /> : null}
          {delta !== null ? (
            <>
              {delta !== 0 ? <span aria-hidden className={delta > 0 ? "text-accent" : "text-white/80"}>{delta > 0 ? "▲" : "▼"}</span> : null}
              <span className={delta > 0 ? "text-accent" : "text-white/80"}>{fmtPct(delta)}</span>
              <span className="text-white/80">vs. la última factura</span>
            </>
          ) : null}
        </p>
      </div>
      <Link
        href="/bills/new"
        className="inline-flex h-11 items-center gap-2 self-start rounded-lg bg-accent px-4 text-sm font-semibold text-brand-900 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:self-auto"
      >
        <Plus className="h-4 w-4" aria-hidden /> Registrar factura
      </Link>
    </section>
  );
}

const DashboardSkeleton = (
  <>
    <LoadingSkeleton className="h-36 rounded-2xl" />
    <LoadingSkeleton className="h-64" />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <LoadingSkeleton className="h-28" />
      <LoadingSkeleton className="h-28" />
      <LoadingSkeleton className="h-28" />
      <LoadingSkeleton className="h-28" />
    </div>
  </>
);

export default function DashboardPage() {
  const { homeId } = useSession();
  return <HomeDashboard key={homeId} homeId={homeId ?? ""} />;
}

function HomeDashboard({ homeId }: { homeId: string }) {
  const [billId, setBillId] = useState("");
  const { data, isLoading, error, refetch } = useDashboard(homeId, billId || undefined);
  const anomalies = useAnomalies(homeId);
  const bills = useBills(homeId);
  const periods = [...(bills.data ?? [])].sort((a, b) =>
    b.period_end.localeCompare(a.period_end) || b.id.localeCompare(a.id));
  const selectedIndex = periods.findIndex((bill) => bill.id === billId);
  const history = billId ? (selectedIndex >= 0 ? periods.slice(selectedIndex) : []) : periods;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Inicio</h1>
        {data ? (
          <p className="text-sm text-muted-foreground">
            {data.home.name} · {data.home.distributor}
          </p>
        ) : null}
      </header>

      <QueryState isLoading={bills.isLoading} error={bills.error} onRetry={() => void bills.refetch()}>
        <label className="flex max-w-md flex-col gap-1 text-sm font-medium">
          Período de facturación
          <select
            value={billId}
            onChange={(event) => setBillId(event.target.value)}
            disabled={!periods.length}
            className="h-11 rounded-lg border border-border bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="">Último período disponible</option>
            {billId && selectedIndex < 0 ? <option value={billId}>Período no disponible</option> : null}
            {periods.map((bill) => (
              <option key={bill.id} value={bill.id}>{formatPeriod(bill.period_start, bill.period_end)}</option>
            ))}
          </select>
        </label>
      </QueryState>

      <QueryState isLoading={isLoading} error={error} onRetry={() => void refetch()} skeleton={DashboardSkeleton}>
        {data ? (
          <>
            {billId ? (
              <AlertCard tone="info" title="Resumen histórico">
                Comparación, alertas y proyección calculadas con las facturas hasta el período seleccionado.
                La proyección estima la factura siguiente a ese período.
              </AlertCard>
            ) : null}
            {data.data_status.is_demo ? (
              <AlertCard tone="info" title="Datos de demostración">
                No son facturas reales del hogar.
              </AlertCard>
            ) : null}

            {!data.latest_bill ? (
              <EmptyState
                icon={Receipt}
                title="Aún no hay facturas"
                hint="Registra tu última factura de luz para ver tu consumo, la proyección y las alertas."
                action={
                  <Link
                    href="/bills/new"
                    className="mt-2 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    <Plus className="h-4 w-4" aria-hidden /> Registrar factura
                  </Link>
                }
              />
            ) : (
              <Hero data={data} />
            )}

            {data.alert ? (
              <AlertCard
                tone={data.alert.severity}
                announce
                action={
                  <Link
                    href="/alerts"
                    className="inline-flex h-11 items-center gap-1 rounded-lg px-1 text-sm font-medium text-foreground underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    Ver alertas <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                }
              >
                {data.alert.message}
              </AlertCard>
            ) : null}

            {!billId ? <AnomalySection anomalies={anomalies.data} isLoading={anomalies.isLoading} /> : null}

            {!billId ? <GoalProgressSection homeId={homeId} /> : null}

            {!bills.isLoading && !bills.error && history.length > 0 ? (
              <Card>
                <CardTitle>Consumo por factura</CardTitle>
                <div className="mt-4">
                  <ConsumptionChart
                    series={monthlySeries(
                      history,
                      data.projection ? {
                        kwh: data.projection.kwh.value,
                        amount_dop: data.projection.amount_dop.value,
                        period_end: suggestNextPeriod(data.latest_bill).period_end,
                      } : null,
                    )}
                  />
                </div>
              </Card>
            ) : null}

            <Section
              id="dash-latest"
              title={billId ? "Factura del período" : "Última factura"}
              description={
                data.latest_bill
                  ? `${formatPeriod(data.latest_bill.period_start, data.latest_bill.period_end)} · ${data.latest_bill.days} días`
                  : "Aún no hay facturas registradas."
              }
            >
              {data.latest_bill ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <ApiMetricCard
                    label="Consumo"
                    metric={data.latest_bill.kwh}
                    helper="kWh: la energía que usó tu hogar en el período."
                  />
                  <ApiMetricCard
                    label="Monto"
                    metric={data.latest_bill.amount_dop}
                    helper="Lo que cobró la distribuidora, en pesos (RD$)."
                  />
                  <ApiMetricCard
                    label="Promedio diario"
                    metric={data.latest_bill.avg_daily_kwh}
                    helper="kWh de la factura repartidos entre sus días."
                  />
                  <ApiMetricCard
                    label="Precio medio"
                    metric={data.latest_bill.avg_price_per_kwh}
                    helper="Cuánto pagaste en promedio por cada kWh."
                  />
                </div>
              ) : null}
            </Section>

            <Section
              id="dash-compare"
              title="Vs. período anterior"
              description={
                data.comparison
                  ? `Comparado con ${formatPeriod(data.comparison.previous_period_start, data.comparison.previous_period_end)}.`
                  : "Sin período anterior para comparar: registra otra factura."
              }
            >
              {data.comparison ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <ApiMetricCard
                    label="Consumo"
                    metric={data.comparison.kwh_delta}
                    signed
                    deltaPct={data.comparison.kwh_pct}
                    helper="Diferencia de energía (kWh) entre las dos facturas."
                  />
                  <ApiMetricCard
                    label="Costo"
                    metric={data.comparison.amount_delta}
                    signed
                    deltaPct={data.comparison.amount_pct}
                    helper="Diferencia del monto (RD$) entre las dos facturas."
                  />
                </div>
              ) : null}
            </Section>

            <Section
              id="dash-projection"
              title="Proyección"
              description={data.projection ? data.projection.note : "Se necesitan al menos 2 facturas para proyectar."}
            >
              {data.projection ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <MetricCard
                    label="Consumo de la próxima factura"
                    value={show(data.projection.kwh)}
                    quality={data.projection.kwh.quality}
                  />
                  <MetricCard
                    label="Monto de la próxima factura"
                    value={show(data.projection.amount_dop)}
                    quality={data.projection.amount_dop.quality}
                  />
                </div>
              ) : null}
            </Section>

            <AlertCard
              tone="savings"
              title="Recomendación"
              action={
                <Link
                  href="/equipment"
                  className="inline-flex h-11 items-center gap-1 rounded-lg px-1 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Ver qué equipos consumen más <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              }
            >
              {data.recommendation ?? "Sin recomendaciones por ahora."}
            </AlertCard>

            <details className="group rounded-xl border border-border bg-background p-4 text-sm">
              <summary className="cursor-pointer list-none font-semibold">
                <h2 className="inline">Estado de los datos</h2>
                <span className="ml-2 font-normal text-muted-foreground">
                  {data.data_status.bills_count} facturas · fuente: {sourceLabel(data.data_status.data_source)} ·
                  resolución {resolutionLabel(data.data_status.resolution)}
                </span>
              </summary>
              {data.data_status.insufficient_reasons.length > 0 ? (
                <ul className="mt-2 list-disc pl-5 text-muted-foreground">
                  {data.data_status.insufficient_reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : null}
              <dl className="mt-3 grid gap-2 text-xs text-muted-foreground">
                {Object.entries(data.quality_legend).map(([k, v]) => (
                  <div key={k} className="flex items-start gap-2">
                    <dt className="w-24 shrink-0">
                      <DataStatusBadge quality={k as keyof typeof QUALITY} always />
                    </dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </>
        ) : null}
      </QueryState>
    </div>
  );
}
