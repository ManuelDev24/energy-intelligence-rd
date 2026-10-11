"use client";

import { scoreComponentView, scoreCoverageNote } from "@energyrd/core";
import { Gauge } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { EnergyGauge } from "@/components/energy-gauge";
import { QualityBadge } from "@/components/quality-badge";
import { QueryState } from "@/components/query-state";
import { Card } from "@/components/ui/card";
import { useEnergyScore } from "@/lib/api/hooks";

/** ERD-SCORE-01: Energy Score del backend con sus cuatro componentes. Sin puntaje explica qué falta; nunca inventa uno. */
export function EnergyScoreCard({ homeId }: { homeId: string }) {
  const { data, isLoading, error, refetch } = useEnergyScore(homeId);
  return (
    <section aria-labelledby="energy-score-title" className="flex flex-col gap-3" data-testid="energy-score">
      <div className="flex flex-col gap-0.5">
        <h2 id="energy-score-title" className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          Energy Score {data?.score !== null && data ? <QualityBadge quality="INFERRED" always /> : null}
        </h2>
        <p className="text-sm text-muted-foreground">Indicador interno de 0 a 100 con cuatro componentes. Es orientativo, no una medición.</p>
      </div>
      <QueryState isLoading={isLoading} error={error} onRetry={() => void refetch()}>
        {data ? (
          data.score === null ? (
            <EmptyState icon={Gauge} title="Sin puntaje todavía" hint={data.reasons[0] ?? "Se calculará cuando haya datos suficientes."} />
          ) : (
            <Card className="flex flex-col gap-4 md:flex-row md:items-start">
              <EnergyGauge value={data.score} label="Energy Score" helper={scoreCoverageNote(data) ?? "Calculado con todos los componentes."} className="md:w-60 md:shrink-0" />
              <ul className="grid flex-1 gap-3 sm:grid-cols-2" aria-label="Componentes del Energy Score">
                {data.components.map((c) => {
                  const v = scoreComponentView(c);
                  return (
                    <li key={v.key} data-testid={`score-${v.key}`} className="rounded-lg border border-border p-3">
                      <p className="flex items-baseline justify-between gap-2 text-sm font-semibold">
                        <span>{v.label} <span className="text-xs font-normal text-muted-foreground">({v.weightText})</span></span>
                        <span className="tabular-nums" aria-label={v.score === null ? `${v.label}: sin datos` : `${v.label}: ${v.score} de 100`}>{v.scoreText}</span>
                      </p>
                      {v.score !== null ? (
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full rounded-full bg-primary" style={{ width: `${v.score}%` }} /></div>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">{v.score === null ? v.hint : v.detail}</p>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )
        ) : null}
      </QueryState>
      {data && data.score !== null ? (
        <p className="text-xs text-muted-foreground">
          {data.note} <Link href="/savings" className="font-medium text-primary underline-offset-2 hover:underline">Ver cómo mejorarlo en Ahorro</Link>
        </p>
      ) : null}
    </section>
  );
}
