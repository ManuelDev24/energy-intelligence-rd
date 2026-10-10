"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useFocusFirstInvalid } from "@/lib/use-focus-first-invalid";
import type { BillInput } from "@/lib/api/schemas";
import {
  emptyBillForm,
  validateBillForm,
  type BillFormValues,
} from "@/lib/bill-form";

interface BillFormProps {
  initial?: BillFormValues;
  submitLabel: string;
  pending?: boolean;
  serverError?: string | null;
  onSubmit: (value: BillInput) => void;
  onCancel?: () => void;
}

export function BillForm({
  initial = emptyBillForm,
  submitLabel,
  pending = false,
  serverError,
  onSubmit,
  onCancel,
}: BillFormProps) {
  const [values, setValues] = useState<BillFormValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof BillFormValues, string>>>({});
  const { formRef, flagInvalid } = useFocusFirstInvalid();

  const bind = (name: keyof BillFormValues) => ({
    name,
    value: values[name],
    error: errors[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setValues((v) => ({ ...v, [name]: e.target.value })),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const result = validateBillForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      flagInvalid();
      return;
    }
    setErrors({});
    onSubmit(result.value);
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex max-w-xl flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Inicio del período" type="date" {...bind("period_start")} />
        <Field label="Fin del período" type="date" {...bind("period_end")} />
        <Field label="Consumo facturado (kWh)" inputMode="decimal" {...bind("kwh")} />
        <Field label="Monto (RD$)" inputMode="decimal" {...bind("amount_dop")} />
        <Field
          label="Días facturados"
          inputMode="numeric"
          hint="Tal como aparece en la factura"
          {...bind("days")}
        />
        <div className="hidden sm:block" />
        <Field label="Lectura anterior (opcional)" inputMode="decimal" {...bind("reading_previous")} />
        <Field label="Lectura actual (opcional)" inputMode="decimal" {...bind("reading_current")} />
      </div>
      {serverError ? (
        <p role="alert" className="text-sm text-red-600">
          {serverError}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}
