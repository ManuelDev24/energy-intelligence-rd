import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@energyrd/api-client';
import type { BillItemsOut, BillItemsReplace } from '@energyrd/api-contracts';

import { BillItemsNotConfirmedError, ScopeChangedError, itemsMatch, saveBillItemsVerified, saveItemsErrorMessage } from './saveItems';

const out = (items: BillItemsOut['items']): BillItemsOut => ({
  home_id: '00000000-0000-4000-8000-000000000001', bill_id: '00000000-0000-4000-8000-000000000002',
  items, items_total_dop: items.length ? '1' : null, bill_amount_dop: '1.00', difference_dop: items.length ? '0' : null,
});
const sent: BillItemsReplace = { items: [{ label: 'Energía', kind: 'charge', amount_dop: '1000.00' }, { label: 'Subsidio', kind: 'discount', amount_dop: '-150.00' }] };
const stored = out([
  { position: 0, label: 'Energía', kind: 'charge', amount_dop: '1000' },
  { position: 1, label: 'Subsidio', kind: 'discount', amount_dop: '-150.0' },
]);

describe('lectura de confirmación', () => {
  it('compara concepto, tipo, orden y monto decimal (1000 == 1000.00)', () => {
    expect(itemsMatch(sent, stored)).toBe(true);
    // El orden lo define `position` (el servidor lo asigna por índice), no el orden del arreglo.
    expect(itemsMatch(sent, out([...stored.items].reverse()))).toBe(true);
    expect(itemsMatch(sent, out([...stored.items].reverse().map((it, position) => ({ ...it, position }))))).toBe(false);
    expect(itemsMatch(sent, out([stored.items[0], { ...stored.items[1], amount_dop: '-150.01' }]))).toBe(false);
    expect(itemsMatch(sent, out([stored.items[0]]))).toBe(false);
    expect(itemsMatch({ items: [] }, out([]))).toBe(true);
  });
});

describe('guardar ítems con confirmación (PUT y luego GET)', () => {
  it('solo publica éxito tras releer y comprobar lo guardado', async () => {
    const order: string[] = [];
    const result = await saveBillItemsVerified({
      input: sent, check: () => order.push('check'),
      put: async () => { order.push('put'); return stored; },
      get: async () => { order.push('get'); return stored; },
      publish: () => { order.push('publish'); },
    });
    expect(result).toBe(stored);
    expect(order).toEqual(['check', 'put', 'check', 'get', 'check', 'publish']);
  });

  it('si la relectura no coincide, no publica y falla con error propio', async () => {
    const publish = vi.fn();
    await expect(saveBillItemsVerified({ input: sent, check: () => undefined, put: async () => stored, get: async () => out([]), publish }))
      .rejects.toBeInstanceOf(BillItemsNotConfirmedError);
    expect(publish).not.toHaveBeenCalled();
  });

  it.each(['before', 'put', 'get'])('cambio de cuenta/vivienda en %s: no continúa ni publica', async (stage) => {
    let active = stage !== 'before';
    const put = vi.fn(async () => { if (stage === 'put') active = false; return stored; });
    const get = vi.fn(async () => { if (stage === 'get') active = false; return stored; });
    const publish = vi.fn();
    await expect(saveBillItemsVerified({ input: sent, put, get, publish, check: () => { if (!active) throw new ScopeChangedError(); } }))
      .rejects.toBeInstanceOf(ScopeChangedError);
    expect(publish).not.toHaveBeenCalled();
    if (stage === 'before') expect(put).not.toHaveBeenCalled();
    if (stage === 'put') expect(get).not.toHaveBeenCalled();
  });

  // Revisión R2: si el PUT llegó al servidor, la caché de esa factura debe refrescarse aunque falle
  // lo que sigue (GET de confirmación, red ambigua), o el detalle mostraría ítems ya reemplazados.
  it('invalida la factura una vez intentado el PUT aunque falle la confirmación', async () => {
    const settled = vi.fn();
    await expect(saveBillItemsVerified({ input: sent, check: () => undefined, put: async () => stored,
      get: async () => { throw new ApiError(0, 'red'); }, publish: vi.fn(), settled })).rejects.toBeInstanceOf(ApiError);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('invalida también si el PUT termina en error ambiguo', async () => {
    const settled = vi.fn();
    await expect(saveBillItemsVerified({ input: sent, check: () => undefined, put: async () => { throw new ApiError(0, 'red'); },
      get: vi.fn(), publish: vi.fn(), settled })).rejects.toBeInstanceOf(ApiError);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('no invalida nada si se cancela antes de enviar el PUT', async () => {
    const settled = vi.fn();
    await expect(saveBillItemsVerified({ input: sent, check: () => { throw new ScopeChangedError(); }, put: vi.fn(),
      get: vi.fn(), publish: vi.fn(), settled })).rejects.toBeInstanceOf(ScopeChangedError);
    expect(settled).not.toHaveBeenCalled();
  });
});

describe('mensajes de error del guardado (texto local)', () => {
  it('cambio de cuenta/vivienda: nada que mostrar en esta pantalla', () => {
    expect(saveItemsErrorMessage(new ScopeChangedError())).toBeNull();
  });
  it('no confirmado, no disponible, validación y genérico', () => {
    expect(saveItemsErrorMessage(new BillItemsNotConfirmedError())).toMatch(/No se pudo confirmar/);
    expect(saveItemsErrorMessage(new ApiError(404, 'detalle del servidor <script>'))).toMatch(/no está disponible/);
    expect(saveItemsErrorMessage(new ApiError(422, 'server says x'))).toBe('Revise los campos indicados.');
    expect(saveItemsErrorMessage(new Error('boom'))).toBe('Ocurrió un error inesperado');
    expect(saveItemsErrorMessage(new ApiError(500, 'stack trace'))).not.toMatch(/stack/);
  });
});
