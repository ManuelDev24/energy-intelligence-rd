"use client";

import {
  EMPTY_EQUIPMENT_FORM,
  EQUIPMENT_ICON_LABELS,
  EQUIPMENT_ICONS,
  EQUIPMENT_KIND_LABELS,
  EQUIPMENT_KINDS,
  fmtNumber,
  isEquipmentKind,
  previewDailyKwh,
  validateEquipment,
  type EquipmentFormErrors,
  type EquipmentFormValues,
} from "@energyrd/core";
import { Plug, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { DataStatusBadge } from "@/components/data-status-badge";
import { DeviceCard, LUCIDE_BY_ICON } from "@/components/device-card";
import { EmptyState } from "@/components/empty-state";
import { canShowBreakdown, EquipmentBreakdownChart } from "@/components/equipment-breakdown-chart";
import { MetricCard } from "@/components/metric-card";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/modal";
import { useDeleteEquipment, useEquipment, useEstimate, useSaveEquipment } from "@/lib/api/hooks";
import type { Equipment } from "@/lib/api/schemas";
import { formatMetric } from "@/lib/format";
import { userMessage } from "@/lib/api/errors";
import { useSession } from "@/lib/session";
import { useFocusFirstInvalid } from "@/lib/use-focus-first-invalid";


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
          kind: isEquipmentKind(editing.kind) ? editing.kind : "other",
          brand: editing.brand ?? "",
          model: editing.model ?? "",
          icon: editing.icon ?? "",
          powerW: String(Number(editing.power_w)),
          hoursPerDay: String(Number(editing.hours_per_day)),
        }
      : EMPTY_EQUIPMENT_FORM,
  );
  const [errors, setErrors] = useState<EquipmentFormErrors>({});
  const { formRef, flagInvalid } = useFocusFirstInvalid();
  const save = useSaveEquipment(homeId);
  const preview = previewDailyKwh(v);
  const bind = (k: keyof EquipmentFormValues) => ({
    name: `eq-${k}`,
    value: v[k],
    error: errors[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value })),
  });
  const kindId = "eq-kind";

  function submit(e: FormEvent) {
    e.preventDefault();
    const { errors: errs, input } = validateEquipment(v);
    setErrors(errs);
    if (!input) { flagInvalid(); return; }
    save.mutate({ id: editing?.id, input }, { onSuccess: onDone });
  }

  return (
    <Card>
      <CardTitle>{editing ? "Editar equipo" : "Nuevo equipo"}</CardTitle>
      <form ref={formRef} onSubmit={submit} noValidate className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" placeholder="Nevera" {...bind("name")} />
        <Select id={kindId} name={kindId} label="Tipo de equipo" error={errors.kind}
            value={v.kind}
            onChange={(e) => setV((p) => ({ ...p, kind: e.target.value }))}>
            {EQUIPMENT_KINDS.map((k) => (
              <option key={k} value={k}>{EQUIPMENT_KIND_LABELS[k]}</option>
            ))}
          </Select>
        <Field label="Habitación (opcional)" placeholder="Cocina" {...bind("room")} />
        <Field label="Marca (opcional)" placeholder="Samsung" {...bind("brand")} />
        <Field label="Modelo (opcional)" placeholder="AR12" {...bind("model")} />
        <div role="radiogroup" aria-label="Icono" className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium">Icono</span>
          <div className="flex flex-wrap gap-2">
            {[{ key: "", label: "Por defecto del tipo" }, ...EQUIPMENT_ICONS.map((i) => ({ key: i as string, label: EQUIPMENT_ICON_LABELS[i] }))].map((o) => {
              const selected = v.icon === o.key;
              const Icon = o.key ? LUCIDE_BY_ICON[o.key as keyof typeof LUCIDE_BY_ICON] : null;
              return (
                <button
                  key={o.key || "default"}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`Icono: ${o.label}`}
                  title={o.label}
                  onClick={() => setV((p) => ({ ...p, icon: o.key }))}
                  className={`flex h-10 min-w-10 items-center justify-center rounded-lg border px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? "border-primary bg-muted font-semibold" : "border-border"}`}
                >
                  {Icon ? <Icon className="h-5 w-5" aria-hidden /> : "Auto"}
                </button>
              );
            })}
          </div>
          {errors.icon ? <p role="alert" className="text-xs text-danger">{errors.icon}</p> : null}
        </div>
        <Field label="Potencia (W)" width="sm" inputMode="decimal" placeholder="150" {...bind("powerW")} />
        <Field label="Horas de uso por día" width="sm" inputMode="decimal" placeholder="24" {...bind("hoursPerDay")} />
        {preview !== null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
            Vista previa: ≈ {fmtNumber(preview)} kWh/día <DataStatusBadge quality="ESTIMATED" />
          </p>
        ) : null}
        {save.isError ? (
          <p role="alert" className="text-sm text-danger sm:col-span-2">
            {userMessage(save.error, "equipment-save")}
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
  const [deleting, setDeleting] = useState<Equipment | null>(null);
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

      <ConfirmDialog
        open={deleting !== null}
        title={`¿Eliminar "${deleting?.name ?? ""}"?`}
        message="El equipo deja de contar en la estimación de consumo. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        pendingLabel="Eliminando…"
        destructive
        pending={del.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => { if (deleting) del.mutate(deleting.id, { onSettled: () => setDeleting(null) }); }}
      />

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
            <ul aria-label="Equipos declarados" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.data?.map((it) => (
                <li key={it.id}>
                  <DeviceCard
                    item={it}
                    estimate={byId.get(it.id)}
                    onEdit={() => setForm({ editing: it })}
                    onDelete={() => setDeleting(it)}
                  />
                </li>
              ))}
            </ul>
            {e ? <p className="text-xs text-muted-foreground">{e.note}</p> : null}
          </>
        )}
      </QueryState>
    </div>
  );
}
