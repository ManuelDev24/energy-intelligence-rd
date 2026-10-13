// Editor de ítems de factura (ERD-BILL-02). Puro: mismas reglas que `BillItemIn`/`BillItemsReplace`
// de la API (concepto 1–200 no vacío y sin NUL, Decimal(12,2), cargo >= 0, descuento <= 0, máx. 100).
// El monto se escribe SIN signo: el tipo (cargo/descuento) define el signo enviado.
import type { BillItemOut, BillItemsReplace } from '@energyrd/api-contracts';

import { decimalError, normalizeDecimal } from '../../readings/form';

export type ItemKind = 'charge' | 'discount';
export interface ItemDraft { id: string; label: string; kind: ItemKind; amount: string }
export type ItemErrors = Record<string, { label?: string; amount?: string }>;

export const MAX_ITEMS = 100;
export const LABEL_MAX = 200;

let seq = 0;
export const newDraft = (): ItemDraft => ({ id: `item-${++seq}`, label: '', kind: 'charge', amount: '' });
export const canAddItem = (drafts: readonly ItemDraft[]) => drafts.length < MAX_ITEMS;

/** "-150.00" (descuento guardado) -> "150.00": en el editor se muestra la magnitud. */
export const draftsFromItems = (items: readonly BillItemOut[]): ItemDraft[] =>
  items.map((it) => ({ ...newDraft(), label: it.label, kind: it.kind, amount: it.amount_dop.replace(/^[-+]/, '') }));

/** "1000" -> "1000.00", "0012.3" -> "12.30" (texto, sin float). */
function twoDecimals(normalized: string): string {
  const [int, frac = ''] = normalized.split('.');
  return `${int.replace(/^0+(?=\d)/, '')}.${frac.padEnd(2, '0')}`;
}

function labelError(label: string): string | undefined {
  if (!label.trim()) return 'Escriba el concepto (p. ej. Cargo fijo).';
  if (label.includes('\u0000')) return 'El concepto tiene caracteres no válidos.';
  if ([...label].length > LABEL_MAX) return `El concepto admite hasta ${LABEL_MAX} caracteres.`;
  return undefined;
}

function amountValue(raw: string): { value?: string; error?: string } {
  const t = raw.trim();
  if (!t) return { error: 'Ingrese el monto.' };
  if (/^[-+]/.test(t)) return { error: 'Escriba el monto sin signo; el tipo define si suma o resta.' };
  const normalized = normalizeDecimal(t);
  if (normalized === null) return { error: 'Ingrese un número (p. ej. 1,250.50).' };
  const error = decimalError(normalized);
  return error ? { error } : { value: twoDecimals(normalized) };
}

export function validateItems(drafts: readonly ItemDraft[]): { errors: ItemErrors; listError: string | null; input: BillItemsReplace | null } {
  const errors: ItemErrors = {};
  const items: BillItemsReplace['items'] = [];
  for (const draft of drafts) {
    const label = draft.label.trim();
    const le = labelError(draft.label);
    const amount = amountValue(draft.amount);
    if (le || amount.error) errors[draft.id] = { ...(le ? { label: le } : {}), ...(amount.error ? { amount: amount.error } : {}) };
    else {
      const zero = /^0\.00$/.test(amount.value as string);
      items.push({ label, kind: draft.kind, amount_dop: draft.kind === 'discount' && !zero ? `-${amount.value}` : (amount.value as string) });
    }
  }
  const listError = drafts.length > MAX_ITEMS ? `Máximo ${MAX_ITEMS} ítems por factura.` : null;
  if (listError || Object.keys(errors).length > 0) return { errors, listError, input: null };
  return { errors, listError, input: { items } };
}
