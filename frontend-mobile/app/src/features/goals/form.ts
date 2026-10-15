// Formulario de meta mensual (ERD-GOAL-01). Puro. La API exige al menos una meta y ambas > 0.
import type { Goal, GoalInput } from '@energyrd/api-contracts';

import { decimalError, normalizeDecimal } from '../readings/form';

export interface GoalFormValues {
  amount: string;
  kwh: string;
}
export type GoalFormErrors = Partial<Record<keyof GoalFormValues | 'form', string>>;

function field(value: string): { value: string | null; error?: string } {
  if (!value.trim()) return { value: null };
  const n = normalizeDecimal(value);
  if (n === null) return { value: null, error: 'Ingrese un número.' };
  if (!(Number(n) > 0)) return { value: null, error: 'Debe ser mayor que 0.' };
  const e = decimalError(n);
  return e ? { value: null, error: e } : { value: n };
}

export function validateGoal(v: GoalFormValues): { errors: GoalFormErrors; input: GoalInput | null } {
  const errors: GoalFormErrors = {};
  const amount = field(v.amount);
  const kwh = field(v.kwh);
  if (amount.error) errors.amount = amount.error;
  if (kwh.error) errors.kwh = kwh.error;
  if (!v.amount.trim() && !v.kwh.trim()) errors.form = 'Indique al menos una meta: monto (RD$) o consumo (kWh).';
  if (Object.keys(errors).length > 0) return { errors, input: null };
  return { errors, input: { monthly_amount_rd: amount.value, monthly_kwh: kwh.value } };
}

const trimZeros = (v: string | null) => (v === null ? '' : v.replace(/\.00$/, ''));
export const goalToValues = (goal: Goal | null): GoalFormValues =>
  goal ? { amount: trimZeros(goal.monthly_amount_rd), kwh: trimZeros(goal.monthly_kwh) } : { amount: '', kwh: '' };

export const GOAL_FIELD_MAP: Record<string, keyof GoalFormValues> = { monthly_amount_rd: 'amount', monthly_kwh: 'kwh' };
