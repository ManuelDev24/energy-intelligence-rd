"use client";

import { QUALITY } from "@energyrd/core";
import { NotebookPen } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DataStatusBadge } from "@/components/data-status-badge";
import { DateRangePicker, segmentClass } from "@/components/date-range-picker";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { QueryState } from "@/components/query-state";
import { ReadingsConsumptionChart, bucketValueText, coveragePct } from "@/components/readings-consumption-chart";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import {
  GRANULARITIES,
  PRESETS,
  bucketLabel,
  groupGaps,
  presetRange,
  validateRange,
  type Preset,
  type RangeQuery,
} from "@/features/consumption/range";
import { primaryCta } from "@/features/goal/GoalProgressCard";
import { useConsumption } from "@/lib/api/hooks";
import { userMessage } from "@/lib/api/errors";
import type { Consumption, Granularity } from "@/lib/api/schemas";
import { formatMetric, formatPeriod } from "@/lib/format";
import { todayRD } from "@/lib/rd-time";

const segment = segmentClass;

function Controls({
  preset,
  granularity,
  from,
  to,
  rangeError,
  onPreset,
  onGranularity,
  onFrom,
  onTo,
}: {
  preset: Preset | "custom";
  granularity: Granularity;
  from: string;
  to: string;
  rangeError: string | null;
  onPreset: (p: Preset | "custom") => void;
  onGranularity: (g: Granularity) => void;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  const today = todayRD();
  return (
    <div className="flex flex-col gap-4">
      <DateRangePicker presets={PRESETS} selected={preset} from={from} to={to} today={today} error={rangeError} onPreset={onPreset} onFrom={onFrom} onTo={onTo} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Agrupar por</legend>
        <div className="flex flex-wrap gap-2">
          {GRANULARITIES.map((g) => (
            <button key={g.id} type="button" aria-pressed={granularity === g.id} className={segment(granularity === g.id)} onClick={() => onGranularity(g.id)}>
              {g.label}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function ComparisonKwhDelta({ comparison }: { comparison: NonNullable<Consumption["comparison"]> }) {
  const n = Number(comparison.kwh_delta.value);
  const dir = !Number.isFinite(n) || n === 0 ? "flat" : n > 0 ? "up" : "down";
  const good = dir !== "flat" && dir === "down";
  const tone = dir === "flat" ? "text-muted-foreground" : good ? "text-success" : "text-warning";
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "=";
  const words = dir === "up" ? "Sube" : dir === "down" ? "Baja" : "Sin cambio";
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-medium", tone)}>
      <span aria-hidden>{arrow}</span>
      <span className="sr-only">{words}</span>
      <span className="tabular-nums">{formatMetric(comparison.kwh_delta.value, comparison.kwh_delta.unit, { signed: true })}</span>
      <span className="font-normal text-muted-foreground">
        vs. período anterior ({formatPeriod(comparison.previous_from, comparison.previous_to)}); sin variación % porque fue 0 kWh.
      </span>
    </p>
  );
}

function Summary({ data }: { data: Consumption }) {
  const missing = data.insufficient_reasons[0] ?? "No hay lecturas que cubran este rango.";
  const peak = data.peak_bucket;
  const comparison = data.comparison;
  const totalDelta = comparison?.kwh_pct
    ? { pct: comparison.kwh_pct.value, label: `vs. ${formatPeriod(comparison.previous_from, comparison.previous_to)}`, quality: comparison.kwh_pct.quality, goodWhen: "down" as const }
    : null;
  return (
    <section aria-label="Resumen del rango" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex flex-col gap-1.5">
        <MetricCard
          label="Total del rango"
          value={data.totals.kwh ? formatMetric(data.totals.kwh.value, data.totals.kwh.unit) : "Sin datos"}
          quality={data.totals.kwh?.quality}
          alwaysLabel
          delta={totalDelta}
          helper={data.totals.kwh ? "Solo los períodos cubiertos por lecturas; lo demás no se rellena." : missing}
        />
        {comparison && !comparison.kwh_pct ? <ComparisonKwhDelta comparison={comparison} /> : null}
      </div>
      <MetricCard
        label="Promedio diario"
        value={data.average_daily_kwh ? formatMetric(data.average_daily_kwh.value, data.average_daily_kwh.unit) : "Sin datos"}
        quality={data.average_daily_kwh?.quality}
        alwaysLabel
        helper={data.average_daily_kwh ? "Total entre los días cubiertos por lecturas." : missing}
      />
      <MetricCard
        label="Pico"
        value={peak ? bucketValueText(peak) : "Sin datos"}
        quality={peak?.quality ?? undefined}
        alwaysLabel
        helper={
          peak
            ? `${bucketLabel(peak, data.granularity)}${peak.reason_code === "partial_coverage" ? " · cobertura parcial: puede estar subestimado" : ""}`
            : missing
        }
      />
      <MetricCard
        label="Cobertura"
        value={coveragePct(data.totals.coverage_ratio)}
        helper={`Parte del rango cubierta por lecturas · ${data.readings_used === 1 ? "1 lectura usada" : `${data.readings_used} lecturas usadas`}.`}
      />
      <MetricCard
        label="Costo estimado"
        value={data.estimated_cost ? formatMetric(data.estimated_cost.value, data.estimated_cost.unit) : "Sin datos"}
        quality={data.estimated_cost?.quality}
        alwaysLabel
        helper={data.estimated_cost ? "Estimado con el consumo del rango y la tarifa vigente del distribuidor." : missing}
      />
    </section>
  );
}

function Gaps({ data }: { data: Consumption }) {
  const gaps = groupGaps(data.buckets, data.granularity);
  if (!gaps.length) return null;
  return (
    <section aria-labelledby="gaps-title" className="flex flex-col gap-2 rounded-xl border border-dashed border-border bg-background p-4">
      <h3 id="gaps-title" className="text-sm font-semibold">
        Períodos sin datos
      </h3>
      <ul className="flex flex-col gap-1 text-sm">
        {gaps.map((g) => (
          <li key={g.key}>
            <span className="font-medium">{g.label}</span>
            <span className="text-muted-foreground"> — {g.reason ?? "Sin lecturas que cubran el período."}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Result({ data }: { data: Consumption }) {
  const hasValue = data.buckets.some((b) => b.kwh !== null);
  return (
    <div className="flex flex-col gap-4">
      {hasValue ? (
        <>
          <Summary data={data} />
          <Card>
            <CardTitle>
              {formatPeriod(data.from_date, data.to_date)}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Calculado con lecturas del medidor (hora de República Dominicana). No hay datos por hora.</p>
            <div className="mt-4">
              <ReadingsConsumptionChart data={data} />
            </div>
          </Card>
          <Gaps data={data} />
        </>
      ) : (
        <EmptyState
          icon={NotebookPen}
          title="Sin consumo calculable en este rango"
          hint={data.insufficient_reasons.join(" ") || "Hacen falta al menos 2 lecturas del medidor que cubran el rango."}
          action={
            <Link href="/readings" className={cn(primaryCta, "mt-2")}>
              <NotebookPen className="h-4 w-4" aria-hidden /> Registrar lectura
            </Link>
          }
        />
      )}
      {hasValue && data.insufficient_reasons.length ? (
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {data.insufficient_reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
      {Object.keys(data.quality_legend).length ? (
        <details className="rounded-xl border border-border bg-background p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Qué significa cada etiqueta</summary>
          <dl className="mt-3 grid gap-2 text-xs text-muted-foreground">
            {Object.entries(data.quality_legend).map(([k, v]) => (
              <div key={k} className="flex items-start gap-2">
                <dt className="w-24 shrink-0">{k in QUALITY ? <DataStatusBadge quality={k as keyof typeof QUALITY} always /> : k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </div>
  );
}

/** Vista "Por lecturas": consumo por día/semana/mes a partir de las lecturas del medidor. */
export function ReadingsConsumption({ homeId }: { homeId: string }) {
  const [preset, setPreset] = useState<Preset | "custom">("30d");
  const initial = presetRange("30d", todayRD());
  const [granularity, setGranularity] = useState<Granularity>(initial.granularity);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  const rangeError = preset === "custom" ? validateRange(from, to) : null;
  let query: RangeQuery | null;
  if (preset === "custom") query = rangeError ? null : { granularity, from, to };
  else {
    const range = presetRange(preset, todayRD());
    query = { ...range, granularity };
  }
  const consumption = useConsumption(homeId, query);

  function choosePreset(next: Preset | "custom") {
    if (next !== "custom") {
      const range = presetRange(next, todayRD());
      setGranularity(range.granularity);
      setFrom(range.from);
      setTo(range.to);
    }
    setPreset(next);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <Controls
          preset={preset}
          granularity={granularity}
          from={from}
          to={to}
          rangeError={rangeError}
          onPreset={choosePreset}
          onGranularity={setGranularity}
          onFrom={setFrom}
          onTo={setTo}
        />
        <Link href="/readings" className="inline-flex h-11 shrink-0 items-center gap-2 self-start rounded-lg px-1 text-sm font-medium text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <NotebookPen className="h-4 w-4" aria-hidden /> Gestionar lecturas
        </Link>
      </div>
      <p role="status" className="sr-only">
        {consumption.isFetching ? "Actualizando consumo…" : ""}
      </p>
      {query === null ? null : (
        <QueryState
          isLoading={consumption.isLoading}
          error={consumption.error}
          errorMessage={consumption.error ? userMessage(consumption.error, "consumption") : undefined}
          onRetry={() => void consumption.refetch()}
        >
          {consumption.data ? (
            <div className={cn("transition-opacity", consumption.isPlaceholderData && "opacity-60")} aria-busy={consumption.isPlaceholderData}>
              <Result data={consumption.data} />
            </div>
          ) : null}
        </QueryState>
      )}
    </div>
  );
}
