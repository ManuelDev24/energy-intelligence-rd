import type { Goal } from "@/lib/api/schemas";

const DECIMAL = /^\d{1,10}(\.\d{1,2})?$/;

export interface GoalFormValues {
  monthly_amount_rd: string;
  monthly_kwh: string;
}
export type GoalFormErrors = Partial<Record<keyof GoalFormValues | "form", string>>;
export type GoalFormResult =
  | { ok: true; value: { monthly_amount_rd: string | null; monthly_kwh: string | null } }
  | { ok: false; errors: GoalFormErrors };

function field(raw: string): { value: string | null; error?: string } {
  const v = raw.trim();
  if (v === "") return { value: null };
  if (v.startsWith("-")) return { value: null, error: "Debe ser mayor que 0." };
  if (!DECIMAL.test(v)) return { value: null, error: "Número con hasta 2 decimales." };
  if (Number(v) <= 0) return { value: null, error: "Debe ser mayor que 0." };
  return { value: v };
}

/** Espejo de la API (PUT /goal): reemplazo completo; un campo vacío elimina esa meta. */
export function validateGoalForm(values: GoalFormValues): GoalFormResult {
  const amount = field(values.monthly_amount_rd);
  const kwh = field(values.monthly_kwh);
  const errors: GoalFormErrors = {};
  if (amount.error) errors.monthly_amount_rd = amount.error;
  if (kwh.error) errors.monthly_kwh = kwh.error;
  if (Object.keys(errors).length) return { ok: false, errors };
  if (amount.value === null && kwh.value === null) return { ok: false, errors: { form: "Define al menos una meta: en RD$, en kWh o ambas." } };
  return { ok: true, value: { monthly_amount_rd: amount.value, monthly_kwh: kwh.value } };
}

export const goalToForm = (goal: Goal | null): GoalFormValues => ({
  monthly_amount_rd: goal?.monthly_amount_rd ?? "",
  monthly_kwh: goal?.monthly_kwh ?? "",
});
