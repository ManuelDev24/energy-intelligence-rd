"use client";

import { fmtKwh, fmtMonth, tokens, type BillLike } from "@energyrd/core";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { useReducedMotion } from "@/lib/use-reduced-motion";

interface KwhTrendChartProps {
  /** Facturas de la API (cualquier orden). Con menos de 2 no hay tendencia y no se dibuja nada. */
  bills: readonly BillLike[];
  height?: number;
}

/**
 * CH-14: mini-línea de kWh por factura (todas REAL). El texto con el primer y el último
 * valor es la información; la línea solo muestra la forma de la tendencia.
 */
export function KwhTrendChart({ bills, height = 64 }: KwhTrendChartProps) {
  const reduced = useReducedMotion();
  if (bills.length < 2) return null;
  const data = [...bills]
    .sort((a, b) => a.period_end.localeCompare(b.period_end))
    .map((b) => ({ key: b.id, month: fmtMonth(b.period_end), kwh: Number(b.kwh) }));
  const first = data[0];
  const last = data[data.length - 1];
  const summary = `${first.month}: ${fmtKwh(first.kwh)} → ${last.month}: ${fmtKwh(last.kwh)}`;

  return (
    <figure className="flex flex-col gap-2 rounded-xl border border-border bg-background p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">Tendencia de consumo</span>
        <span className="tabular-nums text-muted-foreground">{summary}</span>
      </figcaption>
      <div
        role="img"
        aria-label={`Tendencia de consumo en ${data.length} facturas. ${data.map((d) => `${d.month}: ${fmtKwh(d.kwh)}`).join("; ")}.`}
        style={{ height }}
      >
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height }}>
          <LineChart data={data} margin={{ top: 6, right: 6, bottom: 6, left: 6 }} accessibilityLayer={false}>
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Line
              type="monotone"
              dataKey="kwh"
              stroke={tokens.color.chart.real}
              strokeWidth={2}
              dot={{ r: 3, fill: tokens.color.chart.real, strokeWidth: 0 }}
              isAnimationActive={!reduced}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
