// Vista del detalle de factura (ERD-BILL-02). Puro: muestra lo que la API devuelve; nunca inventa
// un total (null = "Sin detalle", no 0) ni recalcula el total de la factura a partir de los ítems.
import type { BillItemsOut } from '@energyrd/api-contracts';

import { fmtDop } from '../../../lib/format';

export const NO_DETAIL = 'Sin detalle';
export type DetailTone = 'success' | 'warning' | 'neutral';
export interface DetailRow { key: string; label: string; kindLabel: string; amountText: string }
export interface DetailView {
  rows: DetailRow[];
  totalText: string;
  billAmountText: string;
  difference: { text: string; tone: DetailTone; icon: string };
}

const isZero = (s: string) => /^[-+]?0*(\.0*)?$/.test(s.trim());
const magnitude = (s: string) => s.trim().replace(/^[-+]/, '');

function differenceOf(diff: string | null): DetailView['difference'] {
  if (diff === null) return { text: NO_DETAIL, tone: 'neutral', icon: 'remove-circle-outline' };
  if (isZero(diff)) return { text: 'Los ítems cuadran con el total de la factura.', tone: 'success', icon: 'checkmark-circle' };
  const side = diff.trim().startsWith('-') ? 'menos' : 'más';
  return { text: `Los ítems suman ${fmtDop(magnitude(diff))} ${side} que el total de la factura.`, tone: 'warning', icon: 'warning' };
}

export function detailView(out: BillItemsOut): DetailView {
  return {
    rows: out.items.map((it) => ({
      key: `item-${it.position}`, label: it.label, kindLabel: it.kind === 'charge' ? 'Cargo' : 'Descuento', amountText: fmtDop(it.amount_dop),
    })),
    totalText: out.items_total_dop === null ? NO_DETAIL : fmtDop(out.items_total_dop),
    billAmountText: fmtDop(out.bill_amount_dop),
    difference: differenceOf(out.difference_dop),
  };
}
