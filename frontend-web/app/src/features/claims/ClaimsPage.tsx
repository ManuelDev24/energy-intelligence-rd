"use client";

import { CLAIM_KINDS, CLAIM_KIND_LABEL, CLAIM_STATUS_LABEL, fmtPeriod, validateClaimForm, type ClaimFormErrors, type ClaimFormInput } from "@energyrd/core";
import { MessageSquareWarning, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { EmptyState } from "@/components/empty-state";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { controlClass } from "@/components/ui/control";
import { ApiError } from "@energyrd/api-client";
import { useBills, useClaimMutations, useClaims } from "@/lib/api/hooks";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/cn";

const EMPTY: ClaimFormInput = { kind: "", billId: "", subject: "", description: "", amount: "", reference: "" };

function serverMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 409) return error.code === "claim_limit" ? "Tienes demasiadas reclamaciones abiertas. Cierra alguna antes de crear otra." : "Ya tienes una reclamación abierta de este tipo para esa factura.";
  if (error instanceof ApiError && error.status === 404) return "No se encontró la factura. Actualiza e inténtalo de nuevo.";
  return "No se pudo crear la reclamación. Inténtalo de nuevo.";
}

/** ERD-CLAIM-01: lista de reclamaciones y alta. Lenguaje neutral: es un registro tuyo; la reclamación formal la presentas ante tu distribuidora. */
export default function ClaimsPage() {
  const { homeId } = useSession();
  const home = homeId ?? "";
  const claims = useClaims(home);
  const bills = useBills(home);
  const { create } = useClaimMutations(home);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ClaimFormInput>(EMPTY);
  const [errors, setErrors] = useState<ClaimFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  // Al abrir el formulario se vuelven a leer las facturas: pudieron registrarse desde otra pantalla o dispositivo.
  const refetchBills = bills.refetch;
  useEffect(() => { if (open && home) void refetchBills(); }, [open, home, refetchBills]);
  const needsBill = CLAIM_KINDS.find(k => k.key === form.kind)?.needsBill ?? false;
  const set = <K extends keyof ClaimFormInput>(key: K, value: ClaimFormInput[K]) => { setForm(f => ({ ...f, [key]: value })); setErrors(e => ({ ...e, [key]: undefined })); };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const result = validateClaimForm(form);
    if (!result.ok) { setErrors(result.errors); return; }
    try {
      await create.mutateAsync(result.value);
      setForm(EMPTY); setOpen(false);
    } catch (error) { setMessage(serverMessage(error)); }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><MessageSquareWarning className="h-6 w-6 text-primary" aria-hidden /> Reclamaciones</h1>
        <p className="text-pretty text-sm text-muted-foreground">
          Registra y da seguimiento a un caso con tu distribuidora. Guardamos un resumen de tus datos (consumo, monto y comparación con la factura anterior).
          No afirma que haya un error de la distribuidora: la reclamación formal la presentas tú, y aquí guardas el número de referencia.
        </p>
      </header>
      {!open ? <div><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden /> Nueva reclamación</Button></div> : (
        <form onSubmit={submit} noValidate aria-label="Nueva reclamación" className="flex flex-col gap-3 rounded-xl border border-border p-4">
          {message ? <p role="alert" className="rounded-lg bg-danger-bg p-3 text-sm text-danger">{message}</p> : null}
          <Select label="¿De qué se trata?" value={form.kind} error={errors.kind} width="full" onChange={e => set("kind", e.target.value as ClaimFormInput["kind"])}>
            <option value="">Elige una opción</option>
            {CLAIM_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
          </Select>
          {needsBill ? (
            <Select label="Factura" value={form.billId} error={errors.billId} width="full" onChange={e => set("billId", e.target.value)} hint={bills.isLoading ? "Cargando facturas…" : undefined}>
              <option value="">Elige la factura</option>
              {(bills.data ?? []).map(b => <option key={b.id} value={b.id}>{fmtPeriod(b.period_start, b.period_end)}</option>)}
            </Select>
          ) : null}
          <Field label="Asunto" value={form.subject} maxLength={120} error={errors.subject} width="full" onChange={e => set("subject", e.target.value)} />
          <div className="flex flex-col gap-1">
            <label htmlFor="claim-description" className="text-sm font-medium">Qué pasó</label>
            <textarea id="claim-description" value={form.description} maxLength={2000} rows={5} aria-invalid={errors.description ? true : undefined} aria-describedby={errors.description ? "claim-description-error" : undefined}
              onChange={e => set("description", e.target.value)} className={cn(controlClass, "h-auto min-h-28 resize-y py-2 pointer-coarse:h-auto")} />
            {errors.description ? <p id="claim-description-error" className="text-sm text-danger">{errors.description}</p> : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Field label="Monto en duda (RD$, opcional)" inputMode="decimal" value={form.amount} error={errors.amount} width="md" onChange={e => set("amount", e.target.value)} />
            <Field label="Número de referencia de la distribuidora (opcional)" value={form.reference} maxLength={60} error={errors.reference} width="md" onChange={e => set("reference", e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={create.isPending}>Crear reclamación</Button>
            <Button type="button" variant="outline" disabled={create.isPending} onClick={() => { setOpen(false); setErrors({}); setMessage(null); }}>Cancelar</Button>
          </div>
        </form>
      )}
      <QueryState isLoading={claims.isLoading} error={claims.error} onRetry={() => void claims.refetch()}>
        {claims.data && claims.data.length === 0 ? (
          <EmptyState icon={MessageSquareWarning} title="Aún no tienes reclamaciones" hint="Si tienes dudas sobre un cobro o el servicio, crea un caso para llevar el seguimiento." />
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Reclamaciones">
            {claims.data?.map(c => (
              <li key={c.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <Link href={`/claims/${c.id}`} className="font-semibold text-primary underline-offset-2 hover:underline">{c.subject}</Link>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold" data-testid="claim-status">{CLAIM_STATUS_LABEL[c.status]}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{CLAIM_KIND_LABEL[c.kind]} · creada el {new Date(c.created_at).toLocaleDateString("es-DO", { timeZone: "America/Santo_Domingo" })}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
