"use client";

import { NotebookPen, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { EmptyState } from "@/components/empty-state";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { neighbours, validateReadingForm, type ReadingFormErrors, type ReadingFormValues } from "@/features/readings/form";
import { useCreateReading, useDeleteReading, useReadings } from "@/lib/api/hooks";
import { userMessage } from "@/lib/api/errors";
import type { Reading } from "@/lib/api/schemas";
import { formatNumber } from "@/lib/format";
import { formatReadAt, isIsoDate, isTime, localToIso, nowTimeRD, todayRD } from "@/lib/rd-time";
import { useSession } from "@/lib/session";
import { useFocusFirstInvalid } from "@/lib/use-focus-first-invalid";

const describe = (r: Reading) => `${formatNumber(r.reading_kwh)} kWh (${formatReadAt(r.read_at)})`;

function MonotonicHint({ readings, values }: { readings: readonly Reading[]; values: ReadingFormValues }) {
  if (readings.length === 0) return <p className="text-xs text-muted-foreground">Es tu primera lectura: con la segunda empezamos a calcular consumo.</p>;
  if (!isIsoDate(values.date) || !isTime(values.time)) return null;
  const { previous, next } = neighbours(readings, localToIso(values.date, values.time));
  return (
    <p className="text-pretty text-xs text-muted-foreground">
      {previous ? `Debe ser igual o mayor que la anterior: ${describe(previous)}.` : "No hay lecturas anteriores a esta fecha."}
      {next ? ` Y no mayor que la siguiente: ${describe(next)}.` : ""}
    </p>
  );
}

function ReadingForm({ homeId, readings }: { homeId: string; readings: readonly Reading[] }) {
  const create = useCreateReading(homeId);
  const [values, setValues] = useState<ReadingFormValues>(() => ({ date: todayRD(), time: nowTimeRD(), reading_kwh: "", note: "" }));
  const [errors, setErrors] = useState<ReadingFormErrors>({});
  const { formRef, flagInvalid } = useFocusFirstInvalid();
  const [saved, setSaved] = useState<string | null>(null);

  const bind = (name: keyof ReadingFormValues) => ({
    name,
    id: `reading-${name}`,
    value: values[name],
    error: errors[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setSaved(null);
      setValues((v) => ({ ...v, [name]: e.target.value }));
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const result = validateReadingForm(values, readings);
    if (!result.ok) {
      setErrors(result.errors);
      flagInvalid();
      return;
    }
    setErrors({});
    create.mutate(result.value, {
      onSuccess: (r) => {
        setSaved(`Lectura guardada: ${describe(r)}.`);
        setValues((v) => ({ ...v, reading_kwh: "", note: "" }));
      },
    });
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha" type="date" max={todayRD()} {...bind("date")} />
        <Field label="Hora" type="time" hint="Hora de República Dominicana." {...bind("time")} />
        <Field label="Lectura del medidor (kWh)" inputMode="decimal" autoComplete="off" placeholder="Ej. 1250.5" {...bind("reading_kwh")} />
        <Field label="Nota (opcional)" maxLength={255} autoComplete="off" {...bind("note")} />
      </div>
      <MonotonicHint readings={readings} values={values} />
      {create.error ? (
        <p role="alert" className="text-sm text-danger">
          {userMessage(create.error, "reading-create")}
        </p>
      ) : null}
      <p role="status" className="text-sm text-success">
        {saved ?? ""}
      </p>
      <Button type="submit" className="h-11 self-start" disabled={create.isPending}>
        {create.isPending ? "Guardando…" : "Guardar lectura"}
      </Button>
    </form>
  );
}

function ReadingRow({ reading, homeId }: { reading: Reading; homeId: string }) {
  const remove = useDeleteReading(homeId);
  const [confirming, setConfirming] = useState(false);
  // Al abrir la confirmación el foco va a "Sí, eliminar"; al cancelar vuelve a "Eliminar".
  const actions = useRef<HTMLTableCellElement>(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming || wasConfirming.current) actions.current?.querySelector<HTMLButtonElement>("button")?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);
  const when = formatReadAt(reading.read_at);

  return (
    <tr className="border-b border-border align-top last:border-0">
      <th scope="row" className="px-4 py-3 font-medium sm:px-6">{when}</th>
      <td className="px-4 py-3 text-right tabular-nums sm:px-6">{formatNumber(reading.reading_kwh)} kWh</td>
      <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell sm:px-6">{reading.note ?? "—"}</td>
      <td ref={actions} className="px-4 py-3 sm:px-6">
        {confirming ? (
          <div role="group" aria-label={`Confirmar eliminación de la lectura del ${when}`} className="flex flex-wrap items-center gap-2">
            <span className="text-sm">¿Eliminar?</span>
            <Button
              type="button"
              variant="outline"
              className="h-11 border-danger-border text-danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate(reading.id, { onSettled: () => setConfirming(false) })}
            >
              {remove.isPending ? "Eliminando…" : "Sí, eliminar"}
            </Button>
            <Button type="button" variant="outline" className="h-11" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" className="h-11" aria-label={`Eliminar lectura del ${when}`} onClick={() => setConfirming(true)}>
            <Trash2 className="mr-1 h-4 w-4" aria-hidden /> Eliminar
          </Button>
        )}
        {remove.error ? (
          <p role="alert" className="mt-1 text-sm text-danger">
            {userMessage(remove.error, "reading-delete")}
          </p>
        ) : null}
      </td>
    </tr>
  );
}

export default function ReadingsPage() {
  const { homeId } = useSession();
  const home = homeId ?? "";
  const readings = useReadings(home);
  const rows = [...(readings.data ?? [])].sort((a, b) => Date.parse(b.read_at) - Date.parse(a.read_at));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Lecturas del medidor</h1>
        <p className="text-pretty text-sm text-muted-foreground">
          Anota el número acumulado que marca tu medidor. Entre dos lecturas calculamos tu consumo real; cuantas más registres, más detalle verás en Consumo.
        </p>
      </header>
      <QueryState isLoading={readings.isLoading} error={readings.error} errorMessage={readings.error ? userMessage(readings.error, "load") : undefined} onRetry={() => void readings.refetch()}>
        <Card>
          <CardTitle>Registrar lectura</CardTitle>
          <CardDescription>La lectura no puede ser futura ni menor que una anterior (el cambio de medidor aún no está soportado).</CardDescription>
          <div className="mt-4">
            <ReadingForm homeId={home} readings={rows} />
          </div>
        </Card>
        {readings.data && rows.length === 0 ? (
          <EmptyState icon={NotebookPen} title="Aún no hay lecturas" hint="Registra la primera lectura de tu medidor con el formulario de arriba." />
        ) : rows.length ? (
          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="px-4 pt-4 text-left text-base font-semibold sm:px-6">
                  {rows.length === 1 ? "1 lectura registrada" : `${rows.length} lecturas registradas`}
                </caption>
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-medium sm:px-6">Fecha y hora</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium sm:px-6">Lectura</th>
                    <th scope="col" className="hidden px-4 py-3 font-medium sm:table-cell sm:px-6">Nota</th>
                    <th scope="col" className="px-4 py-3 font-medium sm:px-6"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <ReadingRow key={r.id} reading={r} homeId={home} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}
      </QueryState>
    </div>
  );
}
