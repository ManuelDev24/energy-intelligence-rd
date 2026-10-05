"use client";

import { fmtMonth, fmtNumber } from "@energyrd/core";
import { ExternalLink, NotebookPen, Pencil, Receipt, Target } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { DataStatusBadge } from "@/components/data-status-badge";
import { ErrorState } from "@/components/error-state";
import { GOAL_STATUS, GoalStatusBadge } from "@/components/goal-status";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useGoalProgress } from "@/lib/api/hooks";
import { userMessage } from "@/lib/api/errors";
import type { GoalMetric, GoalProgress } from "@/lib/api/schemas";
import { cn } from "@/lib/cn";
import { formatDate, formatMetric } from "@/lib/format";

export const ctaClass =
  "inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";
export const primaryCta = cn(ctaClass, "bg-primary text-primary-foreground hover:opacity-90");
export const outlineCta = cn(ctaClass, "border border-border bg-background text-foreground hover:bg-muted");

const SOURCE: Record<GoalProgress["data_source"], string> = {
  readings: "lecturas del medidor",
  bills: "facturas",
  none: "sin datos",
};

/** De dónde sale el número: con tarifa oficial, precio medio o prorrateo (todos ESTIMADOS). */
function BasisNote({ metric }: { metric: GoalMetric }) {
  if (metric.tariff) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>Estimado con tarifa {metric.tariff.source_resolution}</span>
        <DataStatusBadge quality="ESTIMATED" />
        <span>({metric.tariff.tariff_code}, sin impuestos ni otros cargos)</span>
        {metric.tariff.source_url ? (
          <a
            href={metric.tariff.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Ver resolución <ExternalLink className="h-3 w-3" aria-hidden />
            <span className="sr-only">(abre en otra pestaña)</span>
          </a>
        ) : null}
      </p>
    );
  }
  if (metric.basis === "bill_average_price") {
    return (
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        Estimado con el precio medio de tu última factura <DataStatusBadge quality="ESTIMATED" />
      </p>
    );
  }
  if (metric.basis === "bills_prorated") {
    return (
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        Prorrateado de tus facturas por días <DataStatusBadge quality="ESTIMATED" />
      </p>
    );
  }
  return null;
}

function MetricProgress({ title, metric }: { title: string; metric: GoalMetric }) {
  const target = formatMetric(metric.target, metric.unit);
  const pct = metric.percent_so_far === null ? null : Number(metric.percent_so_far);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <GoalStatusBadge status={metric.status} />
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="text-xs text-muted-foreground">Llevas este mes</p>
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-2xl font-bold tabular-nums tracking-tight">{metric.so_far ? formatMetric(metric.so_far.value, metric.so_far.unit) : "Sin datos"}</span>
          {metric.so_far ? <DataStatusBadge quality={metric.so_far.quality} always /> : null}
        </p>
        <p className="text-sm text-muted-foreground">
          Meta: <span className="tabular-nums text-foreground">{target}</span>
          {pct !== null ? <span className="tabular-nums"> · {fmtNumber(pct, 2)}% usado</span> : null}
        </p>
      </div>
      {pct !== null ? (
        <div
          role="progressbar"
          aria-label={`${title}: avance frente a la meta`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.max(0, pct))}
          aria-valuetext={`${fmtNumber(pct, 2)}% de la meta`}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn("h-full rounded-full", metric.status === "exceeded" ? "bg-danger" : metric.status === "at_risk" ? "bg-warning" : "bg-primary")}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-0.5">
        <p className="text-xs text-muted-foreground">Cierre de mes proyectado</p>
        {metric.projected ? (
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold tabular-nums">{formatMetric(metric.projected.value, metric.projected.unit)}</span>
            <DataStatusBadge quality={metric.projected.quality} always />
          </p>
        ) : (
          <p className="text-sm">Sin proyección</p>
        )}
        {metric.percent_projected !== null ? (
          <p className="text-xs tabular-nums text-muted-foreground">{fmtNumber(Number(metric.percent_projected), 2)}% de la meta</p>
        ) : null}
      </div>
      <BasisNote metric={metric} />
      {metric.reasons.length ? (
        <ul className="list-disc pl-5 text-xs text-muted-foreground">
          {metric.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Tarjeta de progreso de la meta mensual (GET /goal/progress). */
export function GoalProgressCard({ progress, showEdit = true }: { progress: GoalProgress; showEdit?: boolean }) {
  const status = GOAL_STATUS[progress.status];
  const needsData = progress.status === "insufficient_data";
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 rounded-xl border border-border bg-background p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id={titleId} className="flex items-center gap-2 text-lg font-semibold">
            <Target className="h-5 w-5 text-primary" aria-hidden /> Meta de {fmtMonth(progress.month_start)}
          </h2>
          <p className="text-sm text-muted-foreground">
            Al {formatDate(progress.as_of)} · fuente: {SOURCE[progress.data_source]}
          </p>
        </div>
        <GoalStatusBadge status={progress.status} className="text-sm" />
      </div>
      <p className="text-pretty text-sm">{status.hint}</p>

      {progress.amount || progress.kwh ? (
        <div className="grid gap-4 md:grid-cols-2">
          {progress.amount ? <MetricProgress title="Gasto (RD$)" metric={progress.amount} /> : null}
          {progress.kwh ? <MetricProgress title="Consumo (kWh)" metric={progress.kwh} /> : null}
        </div>
      ) : null}

      {progress.reasons.length ? (
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {progress.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!progress.goal ? (
          <Link href="/goal" className={primaryCta}>
            <Target className="h-4 w-4" aria-hidden /> Definir meta
          </Link>
        ) : null}
        {needsData ? (
          <>
            <Link href="/readings" className={progress.goal ? primaryCta : outlineCta}>
              <NotebookPen className="h-4 w-4" aria-hidden /> Registrar lectura
            </Link>
            <Link href="/bills/new" className={outlineCta}>
              <Receipt className="h-4 w-4" aria-hidden /> Agregar factura
            </Link>
          </>
        ) : null}
        {progress.goal && showEdit ? (
          <Link href="/goal" className={outlineCta}>
            <Pencil className="h-4 w-4" aria-hidden /> Editar meta
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/** Sección autónoma (dashboard): su propia carga/error, sin bloquear el resto de la página. */
export function GoalProgressSection({ homeId, showEdit = true }: { homeId: string; showEdit?: boolean }) {
  const progress = useGoalProgress(homeId);
  if (progress.isLoading) {
    return (
      <div role="status" aria-label="Cargando meta del mes">
        <LoadingSkeleton className="h-48" />
      </div>
    );
  }
  if (progress.error) return <ErrorState title="No se pudo cargar la meta" message={userMessage(progress.error, "load")} onRetry={() => void progress.refetch()} />;
  return progress.data ? <GoalProgressCard progress={progress.data} showEdit={showEdit} /> : null;
}
