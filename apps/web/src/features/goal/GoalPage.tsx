"use client";

import { useState, type FormEvent } from "react";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { GoalProgressSection } from "@/features/goal/GoalProgressCard";
import { goalToForm, validateGoalForm, type GoalFormErrors, type GoalFormValues } from "@/features/goal/form";
import { useGoal, useHomes, usePutGoal, useTariffs } from "@/lib/api/hooks";
import { userMessage } from "@/lib/api/errors";
import type { Goal, Home } from "@/lib/api/schemas";
import { formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { todayRD } from "@/lib/rd-time";

function GoalForm({ homeId, initial }: { homeId: string; initial: Goal | null }) {
  const save = usePutGoal(homeId);
  const [values, setValues] = useState<GoalFormValues>(() => goalToForm(initial));
  const [errors, setErrors] = useState<GoalFormErrors>({});
  const [saved, setSaved] = useState(false);

  const bind = (name: keyof GoalFormValues) => ({
    name,
    value: values[name],
    error: errors[name],
    inputMode: "decimal" as const,
    autoComplete: "off",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setSaved(false);
      setValues((v) => ({ ...v, [name]: e.target.value }));
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const result = validateGoalForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    save.mutate(result.value, { onSuccess: (goal) => { setValues(goalToForm(goal)); setSaved(true); } });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Meta de gasto mensual (RD$)" placeholder="Ej. 3000" hint="Déjalo vacío si no quieres meta en pesos." {...bind("monthly_amount_rd")} />
        <Field label="Meta de consumo mensual (kWh)" placeholder="Ej. 400" hint="Déjalo vacío si no quieres meta en kWh." {...bind("monthly_kwh")} />
      </div>
      {errors.form ? (
        <p role="alert" className="text-sm text-danger">
          {errors.form}
        </p>
      ) : null}
      {save.error ? (
        <p role="alert" className="text-sm text-danger">
          {userMessage(save.error, "goal-save")}
        </p>
      ) : null}
      <p role="status" className="text-sm text-success">
        {saved ? "Meta guardada. El progreso se actualizó." : ""}
      </p>
      <Button type="submit" className="h-11 self-start" disabled={save.isPending}>
        {save.isPending ? "Guardando…" : initial ? "Guardar cambios" : "Guardar meta"}
      </Button>
    </form>
  );
}

/** Pliego vigente para la distribuidora de la vivienda: solo resolución y vigencia (fuente oficial). */
function TariffNote({ home }: { home: Home | undefined }) {
  const tariffs = useTariffs(home?.distributor);
  if (!home) return null;
  if (home.distributor === "Otra") {
    return <CardDescription>No hay tarifa oficial cargada para esta distribuidora: el gasto solo se estimará con tus facturas.</CardDescription>;
  }
  if (tariffs.isLoading) return <CardDescription>Buscando la tarifa vigente…</CardDescription>;
  if (tariffs.error) return <CardDescription>{userMessage(tariffs.error, "load")}</CardDescription>;
  const today = todayRD();
  const current = tariffs.data?.find((t) => t.effective_from <= today && (t.effective_to === null || t.effective_to >= today));
  if (!current) {
    return <CardDescription>No hay una tarifa oficial vigente cargada para {home.distributor}: el gasto se estimará con tus facturas, si las hay.</CardDescription>;
  }
  return (
    <CardDescription>
      El gasto en RD$ se estima con la tarifa {current.tariff_code} de {current.distributor} ({current.source_resolution}), vigente del{" "}
      {formatDate(current.effective_from)} {current.effective_to ? `al ${formatDate(current.effective_to)}` : "en adelante"}. No incluye impuestos ni otros cargos.
    </CardDescription>
  );
}

export default function GoalPage() {
  const { homeId } = useSession();
  const home = homeId ?? "";
  const goal = useGoal(home);
  const homes = useHomes();
  const current = homes.data?.find((h) => h.id === homeId);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Meta mensual</h1>
        <p className="text-pretty text-sm text-muted-foreground">
          Define cuánto quieres gastar o consumir cada mes. Comparamos el mes en curso con tu meta usando tus lecturas o facturas.
        </p>
      </header>
      <Card>
        <CardTitle>Tu meta</CardTitle>
        <TariffNote home={current} />
        <div className="mt-4">
          <QueryState isLoading={goal.isLoading} error={goal.error} errorMessage={goal.error ? userMessage(goal.error, "load") : undefined} onRetry={() => void goal.refetch()}>
            {goal.isSuccess ? <GoalForm key={home} homeId={home} initial={goal.data} /> : null}
          </QueryState>
        </div>
      </Card>
      <GoalProgressSection homeId={home} showEdit={false} />
    </div>
  );
}
