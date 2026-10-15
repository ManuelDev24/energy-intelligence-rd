"use client";

import { recommendationTarget, recommendationView } from "@energyrd/core";
import Link from "next/link";
import { AlertCard } from "@/components/alert-card";
import { QualityBadge } from "@/components/quality-badge";
import { Button } from "@/components/ui/button";
import type { Recommendation } from "@/lib/api/schemas";

const linkClass = "inline-flex h-11 items-center rounded-lg px-1 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const HREF = { equipment: "/equipment", goal: "/goal", alerts: "/alerts", "new-equipment": "/equipment" } as const;
const TONE = { equipment: "savings", goal: "info", anomaly: "warning", data: "info" } as const;

/** ERD-SAVE-01: una recomendación explicable: qué hacer, cuánto se estima ahorrar, por qué y con qué supuestos. */
export function RecommendationItem({ item, pending = false, onApply, onDismiss, onRestore }: {
  item: Recommendation; pending?: boolean; onApply?: (r: Recommendation) => void; onDismiss?: (r: Recommendation) => void; onRestore?: (r: Recommendation) => void;
}) {
  const view = recommendationView(item);
  const target = recommendationTarget(item);
  return (
    <AlertCard
      as="li"
      tone={TONE[item.category]}
      title={view.title}
      data-testid="recommendation"
      meta={view.savings ? (
        <span className="ml-auto flex items-center gap-2 text-foreground">
          <span className="tabular-nums" data-testid="recommendation-savings">{view.savings}</span>
          <QualityBadge quality="ESTIMATED" always />
        </span>
      ) : undefined}
      footer={[view.category, view.confidence, view.difficulty, view.impact].filter(Boolean).join(" · ")}
      action={
        <div className="flex flex-wrap items-center gap-x-3">
          <Link href={HREF[target.kind]} aria-label={`${target.label}: ${view.title}`} className={linkClass}>{target.label}</Link>
          {onApply && item.category === "equipment" ? (
            <Button type="button" variant="outline" disabled={pending} onClick={() => onApply(item)} aria-label={`Ya la apliqué: ${view.title}`}>Ya la apliqué</Button>
          ) : null}
          {onDismiss ? (
            <Button type="button" variant="outline" disabled={pending} onClick={() => onDismiss(item)} aria-label={`Descartar: ${view.title}`}>Descartar</Button>
          ) : null}
          {onRestore ? (
            <Button type="button" variant="outline" disabled={pending} onClick={() => onRestore(item)} aria-label={`Volver a activar: ${view.title}`}>Volver a activar</Button>
          ) : null}
        </div>
      }
    >
      <p>{view.summary}</p>
      <p className="mt-1 font-medium">{view.action}</p>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer py-2 text-sm font-medium text-primary">¿Por qué se recomienda?</summary>
        <p>{view.confidenceHelp}</p>
        {view.assumptions.length ? (
          <ul className="mt-1 list-disc pl-5">{view.assumptions.map(a => <li key={a}>{a}</li>)}</ul>
        ) : null}
        <p className="mt-1">Regla: {view.rule}</p>
      </details>
    </AlertCard>
  );
}
