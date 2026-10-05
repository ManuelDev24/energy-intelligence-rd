"use client";

import {
  fmtNumber,
  previewDailyKwh,
  validateEquipment,
  type EquipmentFormErrors,
  type EquipmentFormValues,
} from "@energyrd/core";
import { Pencil, Plug, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { DataStatusBadge } from "@/components/data-status-badge";
import { EmptyState } from "@/components/empty-state";
import { canShowBreakdown, EquipmentBreakdownChart } from "@/components/equipment-breakdown-chart";
import { MetricCard } from "@/components/metric-card";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { useDeleteEquipment, useEquipment, useEstimate, useSaveEquipment } from "@/lib/api/hooks";
import type { Equipment } from "@/lib/api/schemas";
import { formatMetric } from "@/lib/format";
import { useSession } from "@/lib/session";

const EMPTY: EquipmentFormValues = { name: "", room: "", powerW: "", hoursPerDay: "" };

function EquipmentForm({
  homeId,
  editing,
  onDone,
}: {
  homeId: string;
  editing: Equipment | null;
  onDone: () => void;
}) {
  const [v, setV] = useState<EquipmentFormValues>(
    editing
      ? {
          name: editing.name,
          room: editing.room ?? "",
          powerW: String(Number(editing.power_w)),
          hoursPerDay: String(Number(editing.hours_per_day)),
        }
      : EMPTY,
  );
  const [errors, setErrors] = useState<EquipmentFormErrors>({});
  const save = useSaveEquipment(homeId);
  const preview = previewDailyKwh(v);
  const bind = (k: keyof EquipmentFormValues) => ({
    name: `eq-${k}`,
    value: v[k],
    error: errors[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value })),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const { errors: errs, input } = validateEquipment(v);
    setErrors(errs);
    if (!input) return;
    save.mutate({ id: editing?.id, input }, { onSuccess: onDone });
  }

  return (
    <Card>
      <CardTitle>{editing ? "Editar equipo" : "Nuevo equipo"}</CardTitle>
      <form onSubmit={submit} noValidate className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" placeholder="Nevera" {...bind("name")} />
        <Field label="Habitación (opcional)" placeholder="Cocina" {...bind("room")} />
        <Field label="Potencia (W)" inputMode="decimal" placeholder="150" {...bind("powerW")} />
        <Field label="Horas de uso por día" inputMode="decimal" placeholder="24" {...bind("hoursPerDay")} />
        {preview !== null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
            Vista previa: ≈ {fmtNumber(preview)} kWh/día <DataStatusBadge quality="ESTIMATED" />
          </p>
        ) : null}
        {save.isError ? (
          <p role="alert" className="text-sm text-danger sm:col-span-2">
            {save.error.message}
          </p>
        ) : null}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Guardando…" : "Guardar equipo"}
          </Button>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function EquipmentPage() {
  const { homeId } = useSession();
  const list = useEquipment(homeId ?? "");
  const estimate = useEstimate(homeId ?? "");
  const del = useDeleteEquipment(homeId ?? "");
  const [form, setForm] = useState<{ editing: Equipment | null } | null>(null);
  const byId = new Map((estimate.data?.items ?? []).map((i) => [i.equipment_id, i]));
  const e = estimate.data;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Equipos</h1>
          <p className="text-sm text-muted-foreground">
            Declara tus equipos para estimar qué parte de la factura explica cada uno.
          </p>
        </div>
        {!form ? (
          <Button onClick={() => setForm({ editing: null })}>
            <Plus className="mr-1 h-4 w-4" aria-hidden /> Agregar equipo
          </Button>
        ) : null}
      </header>

      {form && homeId ? (
        <EquipmentForm key={form.editing?.id ?? "new"} homeId={homeId} editing={form.editing} onDone={() => setForm(null)} />
      ) : null}

      <QueryState
        isLoading={list.isLoading || estimate.isLoading}
        error={list.error ?? estimate.error}
        onRetry={() => {
          void list.refetch();
          void estimate.refetch();
        }}
      >
        {list.data && list.data.length === 0 ? (
          <EmptyState
            icon={Plug}
            title="Sin equipos declarados"
            hint="Empieza por los que más consumen: aire acondicionado, nevera, calentador."
          />
        ) : (
          <>
            {e ? (
              <section aria-label="Resumen del estimado" className="grid gap-4 sm:grid-cols-3">
                <MetricCard
                  label="Estimado mensual"
                  value={formatMetric(e.total_monthly_kwh.value, "kWh")}
                  quality={e.total_monthly_kwh.quality}
                  helper="Suma de tus equipos según potencia y horas de uso."
                />
                {e.latest_bill_kwh ? (
                  <MetricCard
                    label="Última factura"
                    value={formatMetric(e.latest_bill_kwh.value, "kWh")}
                    quality={e.latest_bill_kwh.quality}
                    helper="Lo que midió la distribuidora."
                  />
                ) : null}
                {e.bill_coverage_pct ? (
                  <MetricCard
                    label="Explican de la factura"
                    value={formatMetric(e.bill_coverage_pct.value, "%")}
                    quality={e.bill_coverage_pct.quality}
                    helper="Parte de la factura que cubren los equipos declarados."
                  />
                ) : null}
              </section>
            ) : null}
            {e && canShowBreakdown(e.items, e.total_monthly_kwh) ? (
              <Card>
                <CardTitle>¿Qué equipo consume más?</CardTitle>
                <CardDescription>Reparto del consumo mensual estimado, de mayor a menor.</CardDescription>
                <div className="mt-4">
                  <EquipmentBreakdownChart items={e.items} total={e.total_monthly_kwh} />
                </div>
              </Card>
            ) : null}
            <Card className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Equipos declarados y consumo estimado</caption>
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th scope="col" className="px-6 py-3 font-medium">Equipo</th>
                      <th scope="col" className="px-6 py-3 font-medium">Habitación</th>
                      <th scope="col" className="px-6 py-3 text-right font-medium">Potencia</th>
                      <th scope="col" className="px-6 py-3 text-right font-medium">Uso</th>
                      <th scope="col" className="px-6 py-3 text-right font-medium">Estimado/mes</th>
                      <th scope="col" className="px-6 py-3"><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data?.map((it) => {
                      const est = byId.get(it.id);
                      return (
                        <tr key={it.id} className="border-b border-border last:border-0">
                          <th scope="row" className="px-6 py-3 font-medium">{it.name}</th>
                          <td className="px-6 py-3 text-muted-foreground">{it.room ?? "—"}</td>
                          <td className="px-6 py-3 text-right tabular-nums">{fmtNumber(it.power_w, 0)} W</td>
                          <td className="px-6 py-3 text-right tabular-nums">
                            {fmtNumber(it.hours_per_day, Number(it.hours_per_day) % 1 ? 2 : 0)} h/día
                          </td>
                          <td className="px-6 py-3 text-right tabular-nums">
                            {est ? formatMetric(est.monthly_kwh.value, "kWh") : "—"}
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                aria-label={`Editar ${it.name}`}
                                onClick={() => setForm({ editing: it })}
                              >
                                <Pencil className="h-4 w-4" aria-hidden />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                aria-label={`Eliminar ${it.name}`}
                                onClick={() => {
                                  if (window.confirm(`¿Eliminar "${it.name}"?`)) del.mutate(it.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-danger" aria-hidden />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
            {e ? <p className="text-xs text-muted-foreground">{e.note}</p> : null}
          </>
        )}
      </QueryState>
    </div>
  );
}
