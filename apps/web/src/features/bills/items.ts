import type { BillItemOut, BillItemsReplace } from "@/lib/api/schemas";

// ERD-BILL-02 — Detalle de cargos: validación de ENTRADA (espejo del PUT /items de la API) y
// edición de la lista. Sin aritmética: el total de ítems y la diferencia los calcula la API.

export const MAX_ITEMS = 100;
export const MAX_LABEL = 200;
export type ItemKind = "charge" | "discount";
export interface ItemDraft { key: string; label: string; kind: ItemKind; amount: string }
export interface ItemErrors { label?: string; amount?: string }
export interface ItemsValidation { payload?: BillItemsReplace; errors: Record<string, ItemErrors>; form?: string }

let sequence = 0;
export const newDraft = (kind: ItemKind = "charge"): ItemDraft => ({ key: `item-${++sequence}`, label: "", kind, amount: "" });

export const fromServer = (items: BillItemOut[]): ItemDraft[] =>
  [...items].sort((a, b) => a.position - b.position).map(item => ({ key: `item-${++sequence}`, label: item.label, kind: item.kind, amount: item.amount_dop }));

export function moveItem(list: ItemDraft[], index: number, delta: -1 | 1): ItemDraft[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// Hasta 10 enteros y 2 decimales (Numeric(12,2)); admite separador de miles con coma ("1,000.50").
const AMOUNT = /^(-?)(\d{1,10}|\d{1,3}(?:,\d{3}){1,3})(?:\.(\d{1,2}))?$/;

function normalizeAmount(raw: string): { value?: string; negative?: boolean; zero?: boolean } {
  const match = raw.trim().match(AMOUNT);
  if (!match) return {};
  const integer = match[2].replace(/,/g, "").replace(/^0+(?=\d)/, "");
  if (integer.length > 10) return {};
  const decimals = (match[3] ?? "").padEnd(2, "0");
  const zero = /^0+$/.test(integer) && /^0+$/.test(decimals);
  return { value: `${zero ? "" : match[1]}${integer}.${decimals}`, negative: match[1] === "-" && !zero, zero };
}

export function validateItems(list: ItemDraft[]): ItemsValidation {
  const errors: Record<string, ItemErrors> = {};
  const items: BillItemsReplace["items"] = [];
  for (const draft of list) {
    const issue: ItemErrors = {};
    const label = draft.label.trim();
    if (!label) issue.label = "Escribe el concepto.";
    else if (label.length > MAX_LABEL) issue.label = `Máximo ${MAX_LABEL} caracteres.`;
    const amount = normalizeAmount(draft.amount);
    if (!amount.value) issue.amount = "Monto en RD$ con hasta 10 enteros y 2 decimales.";
    else if (draft.kind === "charge" && amount.negative) issue.amount = "Un cargo debe ser 0 o positivo.";
    else if (draft.kind === "discount" && !amount.negative && !amount.zero) issue.amount = "Un descuento debe ser 0 o negativo (ej. -150.00).";
    if (issue.label || issue.amount) errors[draft.key] = issue;
    else items.push({ label, kind: draft.kind, amount_dop: amount.value! });
  }
  const form = list.length > MAX_ITEMS ? `Máximo ${MAX_ITEMS} conceptos por factura.` : undefined;
  return Object.keys(errors).length || form ? { errors, form } : { errors, payload: { items } };
}
