"use client";

import { CircleCheck, CircleHelp, ClipboardCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { billDetailUnavailable, userMessage } from "@/lib/api/errors";
import { useBillAssessment } from "@/lib/api/hooks";
import type { BillAssessment } from "@/lib/api/schemas";
import { cn } from "@/lib/cn";
import { formatDop, formatNumber } from "@/lib/format";
import { formatReadAt } from "@/lib/rd-time";

// ERD-BILL-02 — "Revisar consistencia": evaluación de SOLO LECTURA (POST /validate no escribe nada).
// Nunca aprueba ni certifica: cada comprobación = ícono + texto + color; la procedencia de una factura
// anterior al registro de originales se nombra como desconocida, jamás como comprobada.

type CheckStatus = BillAssessment["checks"][number]["status"];
const CHECK_STATUS: Record<CheckStatus, { label: string; icon: LucideIcon; className: string }> = {
  pass: { label: "Correcto", icon: CircleCheck, className: "text-success" },
  warning: { label: "Advertencia", icon: TriangleAlert, className: "text-warning" },
  unavailable: { label: "Sin datos suficientes", icon: CircleHelp, className: "text-muted-foreground" },
};
const CHECK_NAME: Record<string, string> = {
  period_order: "Orden del período (fin después del inicio)",
  period_duration: "Duración del período (máximo 366 días)",
  days_consistency: "Días facturados frente al período",
  readings_kwh: "Lecturas del medidor frente a los kWh",
  items_sum: "Suma del detalle frente al total de la factura",
};
const WARNING_TEXT: Record<string, string> = {
  period_order: "El fin del período es anterior al inicio.",
  period_duration: "El período supera los 366 días.",
  days_consistency: "Los días facturados no coinciden con el período (ni contando ni sin contar el día final).",
  readings_kwh: "La diferencia de lecturas no coincide con los kWh facturados.",
  items_sum: "La suma del detalle de cargos no coincide con el total de la factura.",
  original_unverified: "No existe un original registrado: los datos son anteriores al registro de originales.",
  original_unknown: "No se encontró el registro de origen de esta factura.",
};
const OVERALL: Record<BillAssessment["status"], { label: string; icon: LucideIcon; className: string }> = {
  consistent: { label: "Sin advertencias", icon: CircleCheck, className: "border-success-border bg-success-bg text-success" },
  warnings: { label: "Con advertencias", icon: TriangleAlert, className: "border-warning-border bg-warning-bg text-warning" },
  incomplete: { label: "Incompleta: faltan datos", icon: CircleHelp, className: "border-dashed border-muted-foreground bg-muted text-muted-foreground" },
};
const ENTITY = { bills: "Factura", bill_items: "Detalle de cargos" } as const;
const FIELD: Record<string, string> = {
  amount_dop: "Monto", kwh: "Consumo (kWh)", days: "Días facturados", period_start: "Inicio del período", period_end: "Fin del período",
  reading_previous: "Lectura anterior", reading_current: "Lectura actual", account_number: "Número de cuenta", items: "Conceptos",
};

function show(field: string, value: unknown): string {
  if (value === null || value === undefined) return "vacío";
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? "concepto" : "conceptos"}`;
  if (field === "amount_dop" && Number.isFinite(Number(value))) return formatDop(String(value));
  if ((field === "kwh" || field.startsWith("reading_")) && Number.isFinite(Number(value))) return formatNumber(String(value));
  return typeof value === "object" ? "(dato compuesto)" : String(value);
}

function changes(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  return keys
    .filter(k => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]))
    .map(k => ({ field: k, label: FIELD[k] ?? k, before: show(k, before?.[k]), after: show(k, after?.[k]) }));
}

export function BillAssessmentSection({ homeId, billId, authEnabled }: { homeId: string; billId: string; authEnabled: boolean }) {
  const [requested, setRequested] = useState(false);
  const query = useBillAssessment(homeId, billId, requested);
  const data = query.data;
  const unavailable = billDetailUnavailable(query.error, authEnabled);

  return (
    <Card className="max-w-xl" role="region" aria-labelledby="bill-review-title">
      <h2 id="bill-review-title" className="text-lg font-semibold">Revisión de consistencia</h2>
      <p className="mt-2 flex items-start gap-2 rounded-lg border border-border bg-muted p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span><strong>Esta revisión no aprueba la factura.</strong> Solo compara los datos registrados y no cambia nada.</span>
      </p>
      <div className="mt-3">
        <Button type="button" variant="outline" disabled={query.isFetching} onClick={() => (requested ? void query.refetch() : setRequested(true))}>
          <ClipboardCheck className="mr-1 h-4 w-4" aria-hidden /> Revisar consistencia
        </Button>
      </div>
      <div className="mt-4">
        {!requested ? null : unavailable ? (
          <p className="rounded-lg border border-dashed border-border bg-muted p-3 text-sm text-muted-foreground">La revisión no está disponible en este entorno: la API local todavía no la ofrece.</p>
        ) : query.isLoading ? (
          <div role="status" aria-label="Revisando"><LoadingSkeleton className="h-32" /></div>
        ) : query.error ? (
          <ErrorState message={userMessage(query.error, "bill-assess")} onRetry={() => void query.refetch()} />
        ) : data ? (
          <AssessmentResult data={data} />
        ) : null}
      </div>
    </Card>
  );
}

function AssessmentResult({ data }: { data: BillAssessment }) {
  const overall = OVERALL[data.status];
  const OverallIcon = overall.icon;
  const known = data.provenance.origin === "creation";
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className={cn("inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", overall.className)}>
        <OverallIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {overall.label}
      </p>

      <section aria-labelledby="bill-review-checks">
        <h3 id="bill-review-checks" className="font-semibold">Comprobaciones</h3>
        <ul aria-label="Comprobaciones" className="mt-1 divide-y divide-border">
          {data.checks.map((check, index) => {
            const s = CHECK_STATUS[check.status];
            const Icon = s.icon;
            return (
              <li key={`${check.code}-${index}`} className="flex items-start justify-between gap-3 py-2">
                <span>{CHECK_NAME[check.code] ?? `Comprobación adicional (${check.code})`}</span>
                <span className={cn("inline-flex shrink-0 items-center gap-1 font-medium", s.className)}>
                  <Icon className="h-4 w-4" aria-hidden />
                  {s.label}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="bill-review-warnings">
        <h3 id="bill-review-warnings" className="font-semibold">Advertencias</h3>
        {data.warnings.length ? (
          <ul aria-label="Advertencias" className="mt-1 flex flex-col gap-1">
            {data.warnings.map(code => (
              <li key={code} className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                <span>{WARNING_TEXT[code] ?? `Otra advertencia (${code}).`}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-muted-foreground">Sin advertencias.</p>
        )}
      </section>

      <section aria-labelledby="bill-review-origin">
        <h3 id="bill-review-origin" className="font-semibold">Procedencia</h3>
        <p className="mt-1 flex items-start gap-2">
          {known ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> : <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
          <span>{known ? "Original registrado" : "Origen desconocido — dato anterior al registro de originales"}</span>
        </p>
        {known && data.provenance.captured_at ? <p className="text-xs text-muted-foreground">Registrado el {formatReadAt(data.provenance.captured_at)}.</p> : null}
      </section>

      <section aria-labelledby="bill-review-history">
        <h3 id="bill-review-history" className="font-semibold">Historial de correcciones</h3>
        {data.corrections.length ? (
          <ul aria-label="Historial de correcciones" className="mt-1 divide-y divide-border">
            {data.corrections.map((c, index) => {
              const diff = changes(c.before, c.after);
              return (
                <li key={`${c.created_at}-${index}`} className="py-2">
                  <p className="font-medium">{formatReadAt(c.created_at)} · {ENTITY[c.entity]}</p>
                  {diff.length ? (
                    <div className="mt-1 text-muted-foreground">
                      {diff.map(d => <p key={d.field}>{d.label}: antes {d.before} → después {d.after}</p>)}
                    </div>
                  ) : <p className="text-muted-foreground">Sin cambios visibles en los campos.</p>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1 text-muted-foreground">Sin correcciones registradas.</p>
        )}
        {data.corrections_has_more ? <p className="mt-1 text-xs text-muted-foreground">Se muestran las 100 correcciones más recientes.</p> : null}
      </section>
    </div>
  );
}
