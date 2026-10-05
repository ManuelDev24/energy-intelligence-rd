import { describe, expect, it } from 'vitest';

import type { BillItemsOut } from '@energyrd/api-contracts';

import { detailView } from './detailModel';

const base: BillItemsOut = {
  home_id: '00000000-0000-4000-8000-000000000001', bill_id: '00000000-0000-4000-8000-000000000002',
  items: [], items_total_dop: null, bill_amount_dop: '3100.00', difference_dop: null,
};

describe('vista del detalle de factura', () => {
  it('sin ítems: total y diferencia "Sin detalle", nunca 0', () => {
    const v = detailView(base);
    expect(v.rows).toEqual([]);
    expect(v.totalText).toBe('Sin detalle');
    expect(v.difference).toMatchObject({ text: 'Sin detalle', tone: 'neutral' });
    expect(JSON.stringify(v)).not.toMatch(/RD\$ 0\.00/);
    expect(v.billAmountText).toBe('RD$ 3,100.00');
  });

  it('lista cargos y descuentos con tipo en texto y monto con signo', () => {
    const v = detailView({ ...base, items: [
      { position: 0, label: 'Energía', kind: 'charge', amount_dop: '3200.00' },
      { position: 1, label: 'Subsidio', kind: 'discount', amount_dop: '-100.00' },
    ], items_total_dop: '3100.00', difference_dop: '0.00' });
    expect(v.rows).toEqual([
      { key: 'item-0', label: 'Energía', kindLabel: 'Cargo', amountText: 'RD$ 3,200.00' },
      { key: 'item-1', label: 'Subsidio', kindLabel: 'Descuento', amountText: '−RD$ 100.00' },
    ]);
    expect(v.totalText).toBe('RD$ 3,100.00');
    expect(v.difference).toMatchObject({ tone: 'success', text: 'Los ítems cuadran con el total de la factura.' });
  });

  it('diferencia positiva/negativa se informa, sin recalcular la factura', () => {
    const more = detailView({ ...base, items: [{ position: 0, label: 'A', kind: 'charge', amount_dop: '3150.50' }], items_total_dop: '3150.50', difference_dop: '50.50' });
    expect(more.difference).toMatchObject({ tone: 'warning', text: 'Los ítems suman RD$ 50.50 más que el total de la factura.' });
    expect(more.billAmountText).toBe('RD$ 3,100.00');
    const less = detailView({ ...base, items: [{ position: 0, label: 'A', kind: 'charge', amount_dop: '3000' }], items_total_dop: '3000', difference_dop: '-100' });
    expect(less.difference).toMatchObject({ tone: 'warning', text: 'Los ítems suman RD$ 100.00 menos que el total de la factura.' });
  });
});
