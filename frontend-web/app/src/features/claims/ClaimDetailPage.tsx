"use client";

import { CLAIM_EVENT_LABEL, CLAIM_KIND_LABEL, CLAIM_LIMITS, CLAIM_STATUS_HELP, CLAIM_STATUS_LABEL, claimEvidenceLines, fmtDop, isClaimFinished } from "@energyrd/core";
import { ApiError } from "@energyrd/api-client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { controlClass } from "@/components/ui/control";
import { useClaim, useClaimMutations } from "@/lib/api/hooks";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/cn";

const when = (iso: string) => new Date(iso).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "medium", timeStyle: "short" });

export default function ClaimDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { homeId } = useSession();
  const home = homeId ?? "";
  const { data, isLoading, error, refetch } = useClaim(home, id);
  const m = useClaimMutations(home);
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [closing, setClosing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fail = (cause: unknown) => setMessage(cause instanceof ApiError && cause.status === 409 ? "Este caso ya está cerrado o llegó a su límite de anotaciones." : "No se pudo completar la acción. Inténtalo de nuevo.");
  async function addNote(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (note.trim().length < CLAIM_LIMITS.noteMin) { setMessage(`Escribe una nota de al menos ${CLAIM_LIMITS.noteMin} caracteres.`); return; }
    try { await m.note.mutateAsync({ id, note: note.trim() }); setNote(""); await refetch(); } catch (cause) { fail(cause); }
  }
  async function saveReference(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!reference.trim() || reference.trim().length > CLAIM_LIMITS.referenceMax) { setMessage(`El número de referencia debe tener de 1 a ${CLAIM_LIMITS.referenceMax} caracteres.`); return; }
    try { await m.reference.mutateAsync({ id, reference: reference.trim() }); setReference(""); await refetch(); } catch (cause) { fail(cause); }
  }
  async function close() {
    setMessage(null);
    try { await m.close.mutateAsync({ id }); setClosing(false); await refetch(); } catch (cause) { fail(cause); setClosing(false); }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/claims" className="text-sm text-primary underline">← Todas las reclamaciones</Link>
      <QueryState isLoading={isLoading} error={error} onRetry={() => void refetch()}>
        {data ? (
          <>
            <header className="flex flex-col gap-1">
              <h1 className="text-2xl font-bold">{data.subject}</h1>
              <p className="text-sm text-muted-foreground">{CLAIM_KIND_LABEL[data.kind]} · <strong data-testid="claim-status">{CLAIM_STATUS_LABEL[data.status]}</strong></p>
              <p className="text-sm text-muted-foreground">{CLAIM_STATUS_HELP[data.status]}</p>
            </header>
            {message ? <p role="alert" className="rounded-lg bg-danger-bg p-3 text-sm text-danger">{message}</p> : null}
            <Card role="region" aria-label="Lo que cuentas">
              <h2 className="text-base font-semibold">Lo que cuentas</h2>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{data.description}</p>
              {data.disputed_amount_dop ? <p className="mt-2 text-sm text-muted-foreground">Monto en duda: {fmtDop(data.disputed_amount_dop)}</p> : null}
              <p className="mt-2 text-sm text-muted-foreground">Número de referencia de la distribuidora: <strong data-testid="claim-reference">{data.reference_number ?? "aún sin registrar"}</strong></p>
            </Card>
            {data.evidence ? (
              <Card role="region" aria-label="Resumen de tus datos">
                <h2 className="text-base font-semibold">Resumen de tus datos</h2>
                <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
                  {claimEvidenceLines(data.evidence).map(line => (<div key={line.label} className="contents"><dt className="text-muted-foreground">{line.label}</dt><dd className="font-medium tabular-nums">{line.value}</dd></div>))}
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">{data.evidence.note}</p>
                <p className="mt-1 text-xs text-muted-foreground">Captado el {when(data.evidence.captured_at)}. No cambia aunque edites la factura después.</p>
              </Card>
            ) : null}
            <Card role="region" aria-label="Historial">
              <h2 className="text-base font-semibold">Historial</h2>
              <ol className="mt-2 flex flex-col gap-2 text-sm">
                {data.events.map(e => (
                  <li key={e.id}><span className="font-medium">{CLAIM_EVENT_LABEL(e.kind, e.status_to)}</span> <span className="text-xs text-muted-foreground">· {when(e.created_at)}</span>
                    {e.note ? <p className="whitespace-pre-wrap break-words text-muted-foreground">{e.note}</p> : null}</li>
                ))}
              </ol>
            </Card>
            {!isClaimFinished(data.status) ? (
              <div className="flex flex-col gap-4">
                <form onSubmit={addNote} className="flex flex-col gap-2" aria-label="Agregar nota">
                  <label htmlFor="claim-note" className="text-sm font-medium">Agregar una nota</label>
                  <textarea id="claim-note" value={note} rows={3} maxLength={CLAIM_LIMITS.noteMax} onChange={e => setNote(e.target.value)} className={cn(controlClass, "h-auto min-h-20 resize-y py-2 pointer-coarse:h-auto")} />
                  <div><Button type="submit" size="sm" loading={m.note.isPending}>Guardar nota</Button></div>
                </form>
                <form onSubmit={saveReference} className="flex flex-wrap items-end gap-2" aria-label="Número de referencia">
                  <Field label="Número de referencia de la distribuidora" value={reference} maxLength={CLAIM_LIMITS.referenceMax} onChange={e => setReference(e.target.value)} width="md" />
                  <Button type="submit" size="sm" variant="outline" loading={m.reference.isPending}>Guardar número</Button>
                </form>
                {closing ? (
                  <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirmar cierre">
                    <p className="text-sm">¿Cerrar este caso? Ya no podrás agregar notas.</p>
                    <Button size="sm" variant="danger" loading={m.close.isPending} onClick={() => void close()}>Sí, cerrar</Button>
                    <Button size="sm" variant="outline" disabled={m.close.isPending} onClick={() => setClosing(false)}>Cancelar</Button>
                  </div>
                ) : <div><Button variant="outline" size="sm" onClick={() => setClosing(true)}>Cerrar caso</Button></div>}
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">{data.disclaimer}</p>
          </>
        ) : null}
      </QueryState>
    </div>
  );
}
