"use client";

import { ArrowDown, ArrowUp, Minus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { userMessage } from "@/lib/api/errors";
import { usePutBillItems } from "@/lib/api/hooks";
import type { BillItemsOut } from "@/lib/api/schemas";
import { formatDop } from "@/lib/format";
import { MAX_ITEMS, MAX_LABEL, fromServer, moveItem, newDraft, validateItems, type ItemDraft, type ItemErrors } from "./items";

// ERD-BILL-02 — "Detalle de cargos": conceptos capturados a mano. Total de ítems y diferencia vienen
// de la API tal cual (null = "Sin detalle", nunca 0); el total de la factura NO se recalcula.

const KIND_LABEL = { charge: "Cargo", discount: "Descuento" } as const;
const money = (value: string | null) => (value === null ? "Sin detalle" : formatDop(value));

interface Props {
  homeId: string;
  billId: string;
  query: { data?: BillItemsOut; isLoading: boolean; error: Error | null; refetch: () => unknown };
  unavailable: boolean;
}

export function BillItemsSection({ homeId, billId, query, unavailable }: Props) {
  const put = usePutBillItems(homeId, billId);
  const [drafts, setDrafts] = useState<ItemDraft[] | null>(null);
  const [errors, setErrors] = useState<Record<string, ItemErrors>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const data = query.data;

  const startEditing = () => {
    if (!data) return;
    put.reset(); setSaved(false); setErrors({}); setFormError(undefined);
    setDrafts(fromServer(data.items));
  };
  const update = (key: string, patch: Partial<ItemDraft>) => setDrafts(list => list && list.map(d => (d.key === key ? { ...d, ...patch } : d)));
  const save = () => {
    if (!drafts) return;
    const result = validateItems(drafts);
    setErrors(result.errors); setFormError(result.form);
    if (!result.payload) return;
    put.mutate(result.payload, { onSuccess: () => { setDrafts(null); setSaved(true); } });
  };

  return (
    <Card className="max-w-xl" role="region" aria-labelledby="bill-items-title">
      <h2 id="bill-items-title" className="text-lg font-semibold">Detalle de cargos</h2>
      <p className="mt-1 text-sm text-muted-foreground">Conceptos que copias de tu factura. La diferencia se informa; el total de la factura no se recalcula.</p>
      <div className="mt-4">
        {unavailable ? (
          <p className="rounded-lg border border-dashed border-border bg-muted p-3 text-sm text-muted-foreground">
            El detalle de cargos no está disponible en este entorno: la API local todavía no lo ofrece.
          </p>
        ) : query.isLoading ? (
          <div role="status" aria-label="Cargando detalle"><LoadingSkeleton className="h-24" /></div>
        ) : query.error ? (
          <ErrorState message={userMessage(query.error, "bill-items-load")} onRetry={() => void query.refetch()} />
        ) : data && drafts ? (
          <div className="flex flex-col gap-3">
            {drafts.length === 0 ? <p className="text-sm text-muted-foreground">Sin conceptos. Guardar así deja la factura sin detalle.</p> : null}
            {drafts.map((d, index) => {
              const n = index + 1;
              const e = errors[d.key] ?? {};
              return (
                <fieldset key={d.key} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                  <legend className="px-1 text-sm font-medium">Concepto {n}</legend>
                  <input
                      aria-label={`Concepto ${n}`}
                      value={d.label}
                      maxLength={MAX_LABEL + 50}
                      placeholder="Ej. Cargo por energía"
                      aria-invalid={e.label ? true : undefined}
                      aria-describedby={e.label ? `${d.key}-label-error` : undefined}
                      onChange={ev => update(d.key, { label: ev.target.value })}
                      className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                  {e.label ? <p id={`${d.key}-label-error`} role="alert" className="text-xs text-red-600">{e.label}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <span className="flex flex-col gap-1 text-xs text-muted-foreground"><span aria-hidden>Tipo</span><select
                      aria-label={`Tipo del concepto ${n}`}
                      value={d.kind}
                      onChange={ev => update(d.key, { kind: ev.target.value as ItemDraft["kind"] })}
                      className="h-10 rounded-lg border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <option value="charge">Cargo</option>
                      <option value="discount">Descuento</option>
                    </select></span>
                    <span className="flex flex-col gap-1 text-xs text-muted-foreground"><span aria-hidden>Monto</span><input
                      aria-label={`Monto del concepto ${n} (RD$)`}
                      inputMode="decimal"
                      value={d.amount}
                      placeholder={d.kind === "discount" ? "-150.00" : "1,250.00"}
                      aria-invalid={e.amount ? true : undefined}
                      aria-describedby={e.amount ? `${d.key}-amount-error` : undefined}
                      onChange={ev => update(d.key, { amount: ev.target.value })}
                      className="h-10 w-36 rounded-lg border border-border bg-background px-3 text-right text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    /></span>
                    <div className="ml-auto flex items-end gap-1">
                      <Button type="button" variant="outline" className="h-10 w-10 px-0" aria-label={`Subir concepto ${n}`} disabled={index === 0} onClick={() => setDrafts(list => list && moveItem(list, index, -1))}><ArrowUp className="h-4 w-4" aria-hidden /></Button>
                      <Button type="button" variant="outline" className="h-10 w-10 px-0" aria-label={`Bajar concepto ${n}`} disabled={index === drafts.length - 1} onClick={() => setDrafts(list => list && moveItem(list, index, 1))}><ArrowDown className="h-4 w-4" aria-hidden /></Button>
                      <Button type="button" variant="outline" className="h-10 w-10 px-0" aria-label={`Quitar concepto ${n}`} onClick={() => setDrafts(list => list && list.filter(x => x.key !== d.key))}><Trash2 className="h-4 w-4" aria-hidden /></Button>
                    </div>
                  </div>
                  {e.amount ? <p id={`${d.key}-amount-error`} role="alert" className="text-xs text-red-600">{e.amount}</p> : null}
                </fieldset>
              );
            })}
            <p className="text-xs text-muted-foreground">Cargos en positivo; descuentos en negativo (ej. -150.00). Máximo {MAX_ITEMS} conceptos por factura.</p>
            {formError ? <p role="alert" className="text-sm text-red-600">{formError}</p> : null}
            {put.error ? <p role="alert" className="text-sm text-red-600">{userMessage(put.error, "bill-items-save")}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={drafts.length >= MAX_ITEMS} onClick={() => setDrafts(list => list && [...list, newDraft()])}>
                <Plus className="mr-1 h-4 w-4" aria-hidden /> Añadir concepto
              </Button>
              <Button type="button" disabled={put.isPending} onClick={save}>{put.isPending ? "Guardando…" : "Guardar detalle"}</Button>
              <Button type="button" variant="outline" disabled={put.isPending} onClick={() => setDrafts(null)}>Cancelar</Button>
            </div>
          </div>
        ) : data ? (
          <div className="flex flex-col gap-3">
            {data.items.length ? (
              <ul className="divide-y divide-border">
                {[...data.items].sort((a, b) => a.position - b.position).map(item => (
                  <li key={item.position} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 break-words">
                      <span className="font-medium">{item.label}</span>{" "}
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        {item.kind === "discount" ? <Minus className="h-3 w-3" aria-hidden /> : <Plus className="h-3 w-3" aria-hidden />}
                        {KIND_LABEL[item.kind]}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">{formatDop(item.amount_dop)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Aún no hay conceptos registrados para esta factura.</p>
            )}
            <dl className="border-t border-border pt-2 text-sm">
              <div className="flex justify-between gap-4 py-1"><dt className="text-muted-foreground">Total de la factura</dt><dd className="font-medium tabular-nums">{formatDop(data.bill_amount_dop)}</dd></div>
              <div className="flex justify-between gap-4 py-1"><dt className="text-muted-foreground">Total de ítems</dt><dd className="font-medium tabular-nums">{money(data.items_total_dop)}</dd></div>
              <div className="flex justify-between gap-4 py-1"><dt className="text-muted-foreground">Diferencia con el total de la factura</dt><dd className="font-medium tabular-nums">{money(data.difference_dop)}</dd></div>
            </dl>
            {saved ? <p role="status" className="text-sm text-success">Detalle guardado.</p> : null}
            <div><Button type="button" variant="outline" onClick={startEditing}>Editar detalle</Button></div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
