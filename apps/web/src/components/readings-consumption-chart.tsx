"use client";

import { fmtNumber, tokens } from "@energyrd/core";
import { Table2 } from "lucide-react";
import { useId, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { DataStatusBadge } from "@/components/data-status-badge";
import { Button } from "@/components/ui/button";
import { bucketLabel } from "@/features/consumption/range";
import type { Consumption, ConsumptionBucketItem, Granularity } from "@/lib/api/schemas";
import { formatMetric } from "@/lib/format";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const chart = tokens.color.chart;
const q = tokens.color.quality;

const UNIT: Record<Granularity, string> = { day: "día", week: "semana", month: "mes" };

interface Point {
  key: string;
  label: string;
  /** kWh de la API; null = sin cobertura (hueco), nunca 0. */
  kwh: number | null;
  /** Altura dibujada: el valor, o toda la altura del eje para marcar el hueco. */
  bar: number;
  quality: "REAL" | "ESTIMATED" | "PROJECTED" | null;
  coverage: number;
  reason: string | null;
  /** Texto encima de la barra (también para huecos). */
  tag: string;
  raw: ConsumptionBucketItem;
}

export const coveragePct = (ratio: string) => `${fmtNumber(Number(ratio) * 100, 0)}%`;

export function bucketValueText(b: ConsumptionBucketItem): string {
  return b.kwh === null ? "Sin datos" : formatMetric(b.kwh, "kWh");
}

const qualityWord = (quality: Point["quality"]) => (quality === "REAL" ? "real" : quality === "ESTIMATED" ? "estimado" : "proyectado");

/** Resumen textual de la gráfica para lectores de pantalla (incluye los huecos). */
export function bucketsSummary(data: Consumption): string {
  const parts = data.buckets.map((b) => {
    const label = bucketLabel(b, data.granularity);
    if (b.kwh === null) return `${label}: sin datos`;
    const partial = b.reason_code === "partial_coverage" ? `, cobertura ${coveragePct(b.coverage_ratio)}` : "";
    return `${label}: ${formatMetric(b.kwh, "kWh")} (${qualityWord(b.quality)}${partial})`;
  });
  return `Consumo por ${UNIT[data.granularity]} según lecturas del medidor, en kWh. ${parts.join("; ")}.`;
}

function ChartTooltip({ active, payload }: TooltipContentProps) {
  const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
  if (!p) return null;
  return (
    <div className="flex max-w-60 flex-col gap-1 rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{p.label}</p>
      <p className="flex items-center gap-2 tabular-nums">
        {p.kwh === null ? "Sin datos" : formatMetric(String(p.kwh), "kWh")}
        {p.quality ? <DataStatusBadge quality={p.quality} always /> : null}
      </p>
      <p className="tabular-nums text-muted-foreground">Cobertura {coveragePct(String(p.coverage))}</p>
      {p.reason ? <p className="text-pretty text-muted-foreground">{p.reason}</p> : null}
    </div>
  );
}

/**
 * Barras de kWh por día/semana/mes a partir de lecturas del medidor.
 * REAL: verde sólido. ESTIMADO: rayado azul con borde (no solo color).
 * Sin datos: columna gris punteada a toda la altura con la etiqueta "Sin datos": un hueco visible,
 * nunca una barra en 0. Accesible: role="img" con resumen y tabla de datos desplegable.
 */
export function ReadingsConsumptionChart({ data, height = 240 }: { data: Consumption; height?: number }) {
  const reduced = useReducedMotion();
  const [showTable, setShowTable] = useState(false);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const estId = `est-${id}`;
  const gapId = `gap-${id}`;
  const tableId = `table-${id}`;

  const values = data.buckets.map((b) => (b.kwh === null ? null : Number(b.kwh)));
  const max = Math.max(0, ...values.filter((v): v is number => v !== null));
  const top = max > 0 ? max * 1.1 : 1;
  const points: Point[] = data.buckets.map((b, i) => ({
    key: b.start,
    label: bucketLabel(b, data.granularity),
    kwh: values[i],
    bar: values[i] ?? top,
    quality: b.quality,
    coverage: Number(b.coverage_ratio),
    reason: b.reason,
    tag: values[i] === null ? "Sin datos" : fmtNumber(values[i]!, values[i]! % 1 ? 1 : 0),
    raw: b,
  }));
  const hasGap = points.some((p) => p.kwh === null);
  const hasEstimated = points.some((p) => p.quality === "ESTIMATED");
  const labels = points.length <= 14;
  const byKey = new Map(points.map((p) => [p.key, p]));

  return (
    <figure className="flex flex-col gap-3">
      <div role="img" aria-label={bucketsSummary(data)} style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 520, height }}>
          <BarChart data={points} margin={{ top: 20, right: 4, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <defs>
              <pattern id={estId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="8" height="8" fill={q.estimatedBg} />
                <line x1="0" y1="0" x2="0" y2="8" stroke={chart.estimated} strokeWidth="2.5" />
              </pattern>
              <pattern id={gapId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                <rect width="6" height="6" fill={q.inferredBg} />
                <line x1="0" y1="0" x2="0" y2="6" stroke={chart.grid} strokeWidth="2" />
              </pattern>
            </defs>
            <CartesianGrid vertical={false} stroke={chart.grid} />
            <XAxis
              dataKey="key"
              tickLine={false}
              axisLine={{ stroke: chart.grid }}
              tick={{ fill: chart.axis, fontSize: 12 }}
              tickFormatter={(key: string) => byKey.get(key)?.label ?? key}
              interval="preserveStartEnd"
              minTickGap={12}
            />
            <YAxis
              width={44}
              tickLine={false}
              axisLine={false}
              domain={[0, top]}
              tick={{ fill: chart.axis, fontSize: 12 }}
              tickFormatter={(v: number) => fmtNumber(v, 0)}
            />
            <Tooltip content={ChartTooltip} cursor={{ fill: chart.grid, fillOpacity: 0.5 }} isAnimationActive={!reduced} />
            <Bar dataKey="bar" name="Consumo" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={!reduced}>
              {points.map((p) => (
                <Cell
                  key={p.key}
                  fill={p.kwh === null ? `url(#${gapId})` : p.quality === "ESTIMATED" ? `url(#${estId})` : chart.real}
                  stroke={p.kwh === null ? chart.axis : p.quality === "ESTIMATED" ? chart.estimated : undefined}
                  strokeWidth={p.kwh === null || p.quality === "ESTIMATED" ? 1.5 : 0}
                  strokeDasharray={p.kwh === null ? "4 3" : undefined}
                />
              ))}
              {labels ? (
                <LabelList dataKey="tag" position="top" fill={chart.axis} fontSize={11} />
              ) : null}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-sm bg-chart-real" />
          Entre dos lecturas <DataStatusBadge quality="REAL" always />
        </span>
        {hasEstimated ? (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-3 w-3 rounded-sm border border-chart-estimated"
              style={{ background: `repeating-linear-gradient(45deg, ${q.estimatedBg} 0 3px, ${chart.estimated} 3px 4.5px)` }}
            />
            Repartido por tiempo <DataStatusBadge quality="ESTIMATED" />
          </span>
        ) : null}
        {hasGap ? (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-3 rounded-sm border border-dashed border-chart-axis bg-quality-inferredBg" />
            Sin datos: no hay lecturas que cubran ese período
          </span>
        ) : null}
      </figcaption>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 self-start"
          aria-expanded={showTable}
          aria-controls={tableId}
          onClick={() => setShowTable((v) => !v)}
        >
          <Table2 className="mr-1 h-4 w-4" aria-hidden />
          {showTable ? "Ocultar tabla de datos" : "Ver tabla de datos"}
        </Button>
        <div id={tableId} hidden={!showTable} className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Consumo por período según lecturas</caption>
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-medium">Período</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Consumo</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Cobertura</th>
                <th scope="col" className="py-2 font-medium">Dato</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.key} className="border-b border-border align-top last:border-0">
                  <th scope="row" className="py-2 pr-4 font-medium">{p.label}</th>
                  <td className="py-2 pr-4 text-right tabular-nums">{bucketValueText(p.raw)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{coveragePct(p.raw.coverage_ratio)}</td>
                  <td className="py-2">
                    {p.quality ? <DataStatusBadge quality={p.quality} always /> : null}
                    {p.reason ? <span className="block text-pretty text-xs text-muted-foreground">{p.reason}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </figure>
  );
}
