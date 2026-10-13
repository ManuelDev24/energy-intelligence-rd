"use client";

import { fmtNumber } from "@energyrd/core";
import { PiggyBank } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { QualityBadge } from "@/components/quality-badge";
import { QueryState } from "@/components/query-state";
import { Card } from "@/components/ui/card";
import { useDecidedRecommendations, useRecommendations, useUpdateRecommendation } from "@/lib/api/hooks";
import { userMessage } from "@/lib/api/errors";
import { useSession } from "@/lib/session";
import { RecommendationItem } from "./RecommendationItem";

export default function SavingsPage() {
  const { homeId } = useSession();
  const { data, isLoading, error, refetch } = useRecommendations(homeId ?? "");
  const decided = useDecidedRecommendations(homeId ?? "");
  const update = useUpdateRecommendation(homeId ?? "");
  const set = (status: "active" | "applied" | "dismissed") => (r: { id: string }) => update.mutate({ id: r.id, status });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Ahorro</h1>
        <p className="text-pretty text-sm text-muted-foreground">
          Recomendaciones para gastar menos energía, basadas en tus equipos, facturas y meta. Cada una explica por qué se te sugiere y qué se
          supuso; los ahorros son estimaciones, no garantías.
        </p>
      </header>
      {update.isError ? (
        <p role="alert" className="rounded-lg bg-danger-bg p-3 text-sm text-danger">
          No se pudo actualizar la recomendación: {userMessage(update.error, "alert-update")}
        </p>
      ) : null}
      <QueryState isLoading={isLoading} error={error} onRetry={() => void refetch()}>
        {data ? (
          <>
            {data.total_savings_kwh_month ? (
              <Card aria-label="Ahorro potencial" data-testid="savings-total">
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  Ahorro potencial si aplicas lo de equipos <QualityBadge quality="ESTIMATED" always />
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  ≈ {fmtNumber(data.total_savings_kwh_month.value, 0)} kWh al mes
                  {data.total_savings_dop_month ? <span className="text-lg font-semibold text-muted-foreground"> · ≈ RD$ {fmtNumber(data.total_savings_dop_month.value, 0)} al mes</span> : null}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{data.note}</p>
              </Card>
            ) : null}
            {data.items.length === 0 ? (
              <EmptyState
                icon={PiggyBank}
                title="Sin recomendaciones por ahora"
                hint="Declara tus equipos y registra tus facturas: con eso podemos decirte dónde ahorrar."
                action={<Link href="/equipment" className="text-sm font-medium text-primary underline-offset-2 hover:underline">Ir a Equipos</Link>}
              />
            ) : (
              <ul className="flex flex-col gap-3" aria-label="Recomendaciones vigentes">
                {data.items.map(r => (
                  <RecommendationItem key={r.id} item={r} pending={update.isPending} onApply={set("applied")} onDismiss={set("dismissed")} />
                ))}
              </ul>
            )}
          </>
        ) : null}
      </QueryState>
      {decided.data && decided.data.length > 0 ? (
        <details className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer py-1 text-sm font-semibold">Aplicadas y descartadas ({decided.data.length})</summary>
          <ul className="mt-3 flex flex-col gap-3">
            {decided.data.map(r => (
              <RecommendationItem key={r.id} item={r} pending={update.isPending} onRestore={set("active")} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
