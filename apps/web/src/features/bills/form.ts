import { z } from "zod";
import type { BillInput } from "@/lib/api/schemas";

// Validación de ENTRADA del formulario (espejo de las reglas de la API para dar
// feedback inmediato). No calcula nada: `days` lo escribe quien registra la factura.

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const MONEY_MSG = "Número mayor o igual a 0, con hasta 2 decimales";

const money = z.string().trim().regex(MONEY, MONEY_MSG);
const optionalMoney = z
  .string()
  .trim()
  .refine((v) => v === "" || MONEY.test(v), MONEY_MSG)
  .transform((v) => (v === "" ? null : v));
const date = z.string().date("Fecha inválida (AAAA-MM-DD)");

export const billFormSchema = z
  .object({
    period_start: date,
    period_end: date,
    kwh: money,
    amount_dop: money,
    days: z
      .string()
      .trim()
      .regex(/^\d{1,3}$/, "Entero entre 0 y 366")
      .transform(Number)
      .refine((n) => n <= 366, "Entero entre 0 y 366"),
    reading_previous: optionalMoney,
    reading_current: optionalMoney,
  })
  .superRefine((v, ctx) => {
    if ((Date.parse(v.period_end) - Date.parse(v.period_start)) / 86400000 > 366) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["period_end"], message: "El período no puede exceder 366 días" });
    }
    if (v.period_end < v.period_start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["period_end"],
        message: "La fecha final debe ser igual o posterior a la inicial",
      });
    }
    if (
      v.reading_previous !== null &&
      v.reading_current !== null &&
      Number(v.reading_current) < Number(v.reading_previous)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reading_current"],
        message: "La lectura actual debe ser mayor o igual a la anterior",
      });
    }
  });

export type BillFormValues = {
  period_start: string;
  period_end: string;
  kwh: string;
  amount_dop: string;
  days: string;
  reading_previous: string;
  reading_current: string;
};

export const emptyBillForm: BillFormValues = {
  period_start: "",
  period_end: "",
  kwh: "",
  amount_dop: "",
  days: "",
  reading_previous: "",
  reading_current: "",
};

export type BillFormResult =
  | { ok: true; value: BillInput }
  | { ok: false; errors: Partial<Record<keyof BillFormValues, string>> };

export function validateBillForm(values: BillFormValues): BillFormResult {
  const parsed = billFormSchema.safeParse(values);
  if (parsed.success) return { ok: true, value: parsed.data };
  const errors: Partial<Record<keyof BillFormValues, string>> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof BillFormValues | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
