"use client";

import { fmtDop, fmtKwh, fmtMonth, fmtNumber, tokens, type ChartBar } from "@energyrd/core";
import { Table2 } from "lucide-react";
import { useId, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { DataStatusBadge } from "@/components/data-status-badge";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const chart = tokens.color.chart;
const q = tokens.color.quality;

interface Point {
  key: string;
  /** Etiqueta corta del eje ("ago 26" o "Próx."). */
  tick: string;
  /** Mes completo para tooltip y tabla ("ago 2026"). */
  month: string;
  kwh: number;
  amountDop: number | null;
  projected: boolean;
}

const toPoint = (b: ChartBar): Point => ({
  key: b.key,
  tick: b.kind === "PROJECTED" ? "Próx." : fmtMonth(b.periodEnd, { short: true }),
  month: fmtMonth(b.periodEnd),
  kwh: b.kwh,
  amountDop: b.amountDop,
  projected: b.kind === "PROJECTED",
});

/** Resumen textual de la gráfica: lo que lee un lector de pantalla en lugar de las barras. */
export function consumptionSummary(series: readonly ChartBar[]): string {
  const parts = series.map(toPoint).map((p) => `${p.month}: ${fmtKwh(p.kwh)}${p.projected ? " (proyectado)" : ""}`);
  return `Consumo mensual por factura, en kWh. ${parts.join("; ")}.`;
}

function ChartTooltip({ active, payload }: TooltipContentProps) {
  const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
  if (!p) return null;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-md">
      <p className="flex items-center gap-2 font-semibold">
        {p.projected ? "Próxima factura" : p.month}
        {p.projected ? <DataStatusBadge quality="PROJECTED" /> : null}
      </p>
      <p className="tabular-nums">{fmtKwh(p.kwh)}</p>
      {p.amountDop !== null ? <p className="tabular-nums text-muted-foreground">{fmtDop(p.amountDop)}</p> : null}
    </div>
  );
}

interface ConsumptionChartProps {
  /** Serie de `monthlySeries` (@energyrd/core): facturas reales + proyección opcional. */
  series: ChartBar[];
  height?: number;
}

/**
 * CH-01: barras de kWh por factura. Real en verde; la proyección, rayada y con borde punteado
 * morado (no solo por color). Accesible: role="img" con resumen y tabla de datos desplegable.
 * No dibuja nada sin datos: la página muestra un EmptyState.
 */
export function ConsumptionChart({ series, height = 220 }: ConsumptionChartProps) {
  const reduced = useReducedMotion();
  const [showTable, setShowTable] = useState(false);
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const hatchId = `hatch-${id}`;
  const tableId = `table-${id}`;
  if (series.length === 0) return null;

  const data = series.map(toPoint);
  const hasProjection = data.some((p) => p.projected);

  return (
    <figure className="flex flex-col gap-3">
      <div role="img" aria-label={consumptionSummary(series)} style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 520, height }}>
          <BarChart data={data} margin={{ top: 20, right: 4, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <defs>
              <pattern id={hatchId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="8" height="8" fill={q.projectedBg} />
                <line x1="0" y1="0" x2="0" y2="8" stroke={chart.projected} strokeWidth="2.5" />
              </pattern>
            </defs>
            <CartesianGrid vertical={false} stroke={chart.grid} />
            <XAxis
              dataKey="tick"
              tickLine={false}
              axisLine={{ stroke: chart.grid }}
              tick={{ fill: chart.axis, fontSize: 12 }}
              interval={0}
            />
            <YAxis
              width={44}
              tickLine={false}
              axisLine={false}
              tick={{ fill: chart.axis, fontSize: 12 }}
              tickFormatter={(v: number) => fmtNumber(v, 0)}
            />
            <Tooltip content={ChartTooltip} cursor={{ fill: chart.grid, fillOpacity: 0.5 }} isAnimationActive={!reduced} />
            <Bar dataKey="kwh" name="Consumo" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={!reduced}>
              {data.map((p) => (
                <Cell
                  key={p.key}
                  fill={p.projected ? `url(#${hatchId})` : chart.real}
                  stroke={p.projected ? chart.projected : undefined}
                  strokeWidth={p.projected ? 1.5 : 0}
                  strokeDasharray={p.projected ? "4 3" : undefined}
                />
              ))}
              <LabelList
                dataKey="kwh"
                position="top"
                fill={chart.axis}
                fontSize={11}
                formatter={(v: unknown) => fmtNumber(Number(v), 0)}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="flex flex-col gap-2 text-xs text-muted-foreground">
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-3 rounded-sm bg-chart-real" />
            Factura registrada (kWh)
          </span>
          {hasProjection ? (
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-3 w-3 rounded-sm border border-dashed border-chart-projected"
                style={{
                  background: `repeating-linear-gradient(45deg, ${q.projectedBg} 0 3px, ${chart.projected} 3px 4.5px)`,
                }}
              />
              Próxima factura <DataStatusBadge quality="PROJECTED" />
            </span>
          ) : null}
        </span>
        <span className="text-pretty">
          Un kWh es la energía que mide tu factura: a más kWh, más pagas. Los meses sin factura no se rellenan.
        </span>
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
            <caption className="sr-only">Consumo y monto por mes</caption>
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-medium">Mes</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Consumo</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Monto</th>
                <th scope="col" className="py-2 font-medium">Dato</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.key} className="border-b border-border last:border-0">
                  <th scope="row" className="py-2 pr-4 font-medium">
                    {p.projected ? `Próxima (${p.month})` : p.month}
                  </th>
                  <td className="py-2 pr-4 text-right tabular-nums">{fmtKwh(p.kwh)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{p.amountDop !== null ? fmtDop(p.amountDop) : "—"}</td>
                  <td className="py-2">
                    <DataStatusBadge quality={p.projected ? "PROJECTED" : "REAL"} always />
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
