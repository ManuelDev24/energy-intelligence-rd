"use client";

import { energyReportView, todayRD } from "@energyrd/core";
import { Download, FileText, Printer } from "lucide-react";
import { useState } from "react";
import { QualityBadge } from "@/components/quality-badge";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { useEnergyReport } from "@/lib/api/hooks";
import { useSession } from "@/lib/session";

const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** ERD-RPT-01: informe energético imprimible. «Imprimir o guardar PDF» usa el diálogo del navegador (sin dependencias nuevas). */
export default function ReportsPage() {
  const { homeId } = useSession();
  const today = todayRD();
  const [from, setFrom] = useState(shift(today, -364));
  const [to, setTo] = useState(today);
  const valid = from <= to && to <= today && shift(from, 366) >= to;
  const { data, isLoading, error, refetch } = useEnergyReport(homeId ?? "", from, to, valid);
  const view = data ? energyReportView(data) : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 print:hidden">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><FileText className="h-6 w-6 text-primary" aria-hidden /> Informes</h1>
        <p className="text-pretty text-sm text-muted-foreground">
          Resumen de tu consumo y gasto en el período que elijas, con la calidad de cada dato. Puedes descargarlo como PDF o imprimirlo.
        </p>
      </header>
      <form className="flex flex-wrap items-end gap-3 print:hidden" aria-label="Período del informe" onSubmit={event => event.preventDefault()}>
        <Field label="Desde" type="date" width="sm" value={from} max={today} onChange={e => setFrom(e.target.value)} />
        <Field label="Hasta" type="date" width="sm" value={to} max={today} onChange={e => setTo(e.target.value)}
          error={valid ? undefined : "Elige un período de hasta 366 días que termine hoy o antes."} />
        {view && homeId ? (
          <a href={`/api/bff/homes/${homeId}/reports/energy.pdf?from=${from}&to=${to}`} download
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Download className="h-4 w-4" aria-hidden /> Descargar PDF
          </a>
        ) : null}
        <Button type="button" variant="outline" onClick={() => window.print()} disabled={!view}><Printer className="h-4 w-4" aria-hidden /> Imprimir</Button>
      </form>
      {valid ? (
        <QueryState isLoading={isLoading} error={error} onRetry={() => void refetch()}>
          {view ? (
            <article aria-label="Informe energético" className="flex flex-col gap-5" data-testid="energy-report">
              <header>
                <h2 className="text-xl font-bold">{view.title}</h2>
                <p className="text-sm text-muted-foreground">{view.subtitle}</p>
              </header>
              {view.sections.map(section => (
                <Card key={section.title} role="region" aria-label={section.title} className="break-inside-avoid">
                  <h3 className="mb-2 text-base font-semibold">{section.title}</h3>
                  {section.lines.length ? (
                    <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
                      {section.lines.map((line, index) => (
                        <div key={`${line.label}-${index}`} className="contents">
                          <dt className="text-muted-foreground">{line.label}</dt>
                          <dd className="flex flex-wrap items-center gap-2 font-medium tabular-nums">{line.value}{line.quality && line.quality !== "REAL" ? <QualityBadge quality={line.quality} always /> : null}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : <p className="text-sm text-muted-foreground">{section.empty ?? "Sin datos."}</p>}
                </Card>
              ))}
              {view.sources.length ? (
                <section aria-label="Fuentes" className="break-inside-avoid text-sm">
                  <h3 className="mb-1 text-base font-semibold">Fuentes</h3>
                  <ul className="list-disc pl-5 text-muted-foreground">{view.sources.map(s => <li key={s}>{s}</li>)}</ul>
                </section>
              ) : null}
              <section aria-label="Notas" className="break-inside-avoid text-sm">
                <h3 className="mb-1 text-base font-semibold">Notas</h3>
                <ul className="list-disc pl-5 text-muted-foreground">{view.notes.map(n => <li key={n}>{n}</li>)}</ul>
              </section>
              <p className="text-xs text-muted-foreground">{view.generated}</p>
            </article>
          ) : null}
        </QueryState>
      ) : null}
    </div>
  );
}
