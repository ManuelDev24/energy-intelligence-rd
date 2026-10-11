"use client";

import {
  formatDuration, formatMonthKey, OUTAGE_CAUSE_ORDER, OUTAGE_CAUSES, outageSummaryLine, outageToForm, validateOutageForm,
  type OutageCause, type OutageFormErrors, type OutageFormValues,
} from "@energyrd/core";
import { Pencil, PlugZap, Trash2, Zap } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { EmptyState } from "@/components/empty-state";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { useCreateOutage, useDeleteOutage, useOutages, useOutageSummary, useUpdateOutage } from "@/lib/api/hooks";
import { userMessage } from "@/lib/api/errors";
import type { Outage } from "@/lib/api/schemas";
import { formatReadAt, nowTimeRD, todayRD } from "@/lib/rd-time";
import { useSession } from "@/lib/session";
import { useFocusFirstInvalid } from "@/lib/use-focus-first-invalid";

const selectClass = "h-10 rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const emptyForm = (): OutageFormValues => ({ startDate: todayRD(), startTime: nowTimeRD(), ongoing: false, endDate: todayRD(), endTime: nowTimeRD(), cause: "unknown", note: "" });

/** Alta y edición de un apagón. `editing` precarga los valores y el envío reemplaza el registro. */
function OutageForm({ homeId, editing, onDone }: { homeId: string; editing?: Outage; onDone?: () => void }) {
  const create = useCreateOutage(homeId);
  const update = useUpdateOutage(homeId);
  const mutation = editing ? update : create;
  const [values, setValues] = useState<OutageFormValues>(() => (editing ? outageToForm(editing) : emptyForm()));
  const [errors, setErrors] = useState<OutageFormErrors>({});
  const [saved, setSaved] = useState<string | null>(null);
  const { formRef, flagInvalid } = useFocusFirstInvalid();
  const prefix = editing ? `outage-${editing.id.slice(0, 8)}` : "outage";

  const set = <K extends keyof OutageFormValues>(name: K, value: OutageFormValues[K]) => { setSaved(null); setValues((v) => ({ ...v, [name]: value })); };
  const bind = (name: "startDate" | "startTime" | "endDate" | "endTime" | "note") => ({
    name, id: `${prefix}-${name}`, value: values[name], error: errors[name], onChange: (e: ChangeEvent<HTMLInputElement>) => set(name, e.target.value),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const result = validateOutageForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      flagInvalid();
      return;
    }
    setErrors({});
    const done = () => {
      setSaved(editing ? "Apagón actualizado." : "Apagón guardado.");
      if (!editing) setValues(emptyForm());
      onDone?.();
    };
    if (editing) update.mutate({ id: editing.id, input: result.value }, { onSuccess: done });
    else create.mutate(result.value, { onSuccess: done });
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label={editing ? "Editar apagón" : "Registrar apagón"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Día en que se fue la luz" type="date" max={todayRD()} {...bind("startDate")} />
        <Field label="Hora en que se fue" type="time" hint="Hora de República Dominicana." {...bind("startTime")} />
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={values.ongoing} onChange={(e) => set("ongoing", e.target.checked)} className="h-5 w-5" />
        Todavía sin luz
      </label>
      {!values.ongoing ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Día en que volvió" type="date" max={todayRD()} {...bind("endDate")} />
          <Field label="Hora en que volvió" type="time" {...bind("endTime")} />
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${prefix}-cause`} className="text-sm font-medium">Causa</label>
          <select id={`${prefix}-cause`} value={values.cause} onChange={(e) => set("cause", e.target.value as OutageCause)} className={selectClass}>
            {OUTAGE_CAUSE_ORDER.map((c) => <option key={c} value={c}>{OUTAGE_CAUSES[c]}</option>)}
          </select>
        </div>
        <Field label="Nota (opcional)" maxLength={255} autoComplete="off" {...bind("note")} />
      </div>
      {mutation.error ? <p role="alert" className="text-sm text-danger">{userMessage(mutation.error, "outage-save")}</p> : null}
      <p role="status" className="text-sm text-success">{saved ?? ""}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="h-11" disabled={mutation.isPending}>{mutation.isPending ? "Guardando…" : editing ? "Guardar cambios" : "Guardar apagón"}</Button>
        {editing ? <Button type="button" variant="outline" className="h-11" onClick={onDone}>Cancelar</Button> : null}
      </div>
    </form>
  );
}

function OutageItem({ outage, homeId }: { outage: Outage; homeId: string }) {
  const remove = useDeleteOutage(homeId);
  const update = useUpdateOutage(homeId);
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const when = formatReadAt(outage.started_at);
  const until = outage.ended_at ? formatReadAt(outage.ended_at) : null;

  const restore = () => update.mutate({
    id: outage.id, input: { started_at: outage.started_at, ended_at: new Date().toISOString(), cause: outage.cause, note: outage.note },
  });

  return (
    <li data-testid="outage" className="flex flex-col gap-2 rounded-lg border border-border p-4">
      {mode === "edit" ? (
        <OutageForm homeId={homeId} editing={outage} onDone={() => setMode("view")} />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold">{when}{until ? ` → ${until}` : " → sigue sin luz"}</p>
            <p className="text-sm tabular-nums" data-testid="outage-summary">{outageSummaryLine(outage)}</p>
          </div>
          {outage.note ? <p className="text-sm text-muted-foreground">{outage.note}</p> : null}
          {mode === "confirm" ? (
            <div role="group" aria-label={`Confirmar eliminación del apagón del ${when}`} className="flex flex-wrap items-center gap-2">
              <span className="text-sm">¿Eliminar este apagón?</span>
              <Button autoFocus type="button" variant="outline" className="h-11 border-danger-border text-danger" disabled={remove.isPending}
                onClick={() => remove.mutate(outage.id, { onSettled: () => setMode("view") })}>
                {remove.isPending ? "Eliminando…" : "Sí, eliminar"}
              </Button>
              <Button type="button" variant="outline" className="h-11" onClick={() => setMode("view")}>Cancelar</Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {outage.ongoing ? (
                <Button type="button" className="h-11" disabled={update.isPending} onClick={restore} aria-label={`Ya volvió la luz (apagón del ${when})`}>Ya volvió la luz</Button>
              ) : null}
              <Button type="button" variant="outline" className="h-11" onClick={() => setMode("edit")} aria-label={`Editar el apagón del ${when}`}><Pencil className="mr-1 h-4 w-4" aria-hidden /> Editar</Button>
              <Button type="button" variant="outline" className="h-11" onClick={() => setMode("confirm")} aria-label={`Eliminar el apagón del ${when}`}><Trash2 className="mr-1 h-4 w-4" aria-hidden /> Eliminar</Button>
            </div>
          )}
          {(remove.error || update.error) ? <p role="alert" className="text-sm text-danger">{userMessage(remove.error ?? update.error, "outage-save")}</p> : null}
        </>
      )}
    </li>
  );
}

function MonthlySummary({ homeId }: { homeId: string }) {
  const { data, isLoading, error, refetch } = useOutageSummary(homeId, 12);
  return (
    <Card className="p-0">
      <QueryState isLoading={isLoading} error={error} onRetry={() => void refetch()}>
        {data ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="outage-months">
              <caption className="px-4 pt-4 text-left text-base font-semibold sm:px-6">
                Resumen por mes · {data.totals.count === 0 ? "sin apagones registrados" : `${data.totals.count} ${data.totals.count === 1 ? "apagón" : "apagones"}, ${formatDuration(data.totals.total_minutes)} sin luz`}
              </caption>
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium sm:px-6">Mes</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium sm:px-6">Apagones</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium sm:px-6">Tiempo sin luz</th>
                  <th scope="col" className="hidden px-4 py-3 text-right font-medium sm:table-cell sm:px-6">El más largo</th>
                  <th scope="col" className="hidden px-4 py-3 text-right font-medium sm:table-cell sm:px-6">Promedio</th>
                </tr>
              </thead>
              <tbody>
                {[...data.months].reverse().map((m) => (
                  <tr key={m.month} className="border-b border-border last:border-0">
                    <th scope="row" className="px-4 py-2 font-medium sm:px-6">{formatMonthKey(m.month)}</th>
                    <td className="px-4 py-2 text-right tabular-nums sm:px-6">{m.count}</td>
                    <td className="px-4 py-2 text-right tabular-nums sm:px-6">{m.count === 0 ? "—" : formatDuration(m.total_minutes)}{m.ongoing > 0 ? " (sigue abierto)" : ""}</td>
                    <td className="hidden px-4 py-2 text-right tabular-nums sm:table-cell sm:px-6">{m.count === 0 ? "—" : formatDuration(m.longest_minutes)}</td>
                    <td className="hidden px-4 py-2 text-right tabular-nums sm:table-cell sm:px-6">{m.average_minutes === null ? "—" : formatDuration(m.average_minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 pb-4 pt-2 text-xs text-muted-foreground sm:px-6">{data.note}</p>
          </div>
        ) : null}
      </QueryState>
    </Card>
  );
}

export default function OutagesPage() {
  const { homeId } = useSession();
  const home = homeId ?? "";
  const outages = useOutages(home);
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Apagones</h1>
        <p className="text-pretty text-sm text-muted-foreground">
          Anota cuándo se va y cuándo vuelve la luz para ver con qué frecuencia te afecta. Son datos que registras tú a mano: no se verifican con la distribuidora.
        </p>
      </header>
      <Card>
        <CardTitle>Registrar un apagón</CardTitle>
        <CardDescription>El apagón no puede estar en el futuro, ni solaparse con otro, ni durar más de 30 días.</CardDescription>
        <div className="mt-4"><OutageForm homeId={home} /></div>
      </Card>
      <QueryState isLoading={outages.isLoading} error={outages.error} onRetry={() => void outages.refetch()}>
        {outages.data && outages.data.length === 0 ? (
          <EmptyState icon={Zap} title="Aún no hay apagones registrados" hint="Cuando se vaya la luz, regístralo arriba. Con el tiempo verás cuántos apagones tienes por mes." />
        ) : outages.data ? (
          <section aria-labelledby="outage-history" className="flex flex-col gap-3">
            <h2 id="outage-history" className="flex items-center gap-2 text-lg font-semibold"><PlugZap className="h-5 w-5" aria-hidden /> Historial</h2>
            <ul className="flex flex-col gap-3" aria-label="Historial de apagones">
              {outages.data.map((o) => <OutageItem key={o.id} outage={o} homeId={home} />)}
            </ul>
          </section>
        ) : null}
      </QueryState>
      <MonthlySummary homeId={home} />
    </div>
  );
}
