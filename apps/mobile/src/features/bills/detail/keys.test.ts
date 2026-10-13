import { describe, expect, it } from 'vitest';

import { billDetailKeys, billItemsSavedInvalidations } from './keys';

/** Igual que React Query: una clave invalida a otra si es su prefijo. */
const matches = (prefix: readonly unknown[], key: readonly unknown[]) => prefix.every((p, i) => Object.is(p, key[i]));

describe('claves de detalle de factura (por cuenta, vivienda y factura)', () => {
  const k = billDetailKeys(['account', 7]);

  it('cuelgan del alcance de la cuenta: el clear() del cierre de sesión y el cambio de época las eliminan', () => {
    expect(k.items('h1', 'b1').slice(0, 2)).toEqual(['account', 7]);
    expect(k.assessment('h1', 'b1').slice(0, 2)).toEqual(['account', 7]);
    expect(billDetailKeys(['pilot']).items('h1', 'b1')[0]).toBe('pilot');
  });

  it('distinguen cuenta, vivienda y factura', () => {
    const other = billDetailKeys(['account', 8]);
    expect(matches(k.items('h1', 'b1'), other.items('h1', 'b1'))).toBe(false);
    expect(matches(k.items('h1', 'b1'), k.items('h2', 'b1'))).toBe(false);
    expect(matches(k.items('h1', 'b1'), k.items('h1', 'b2'))).toBe(false);
    expect(matches(k.items('h1', 'b1'), k.assessment('h1', 'b1'))).toBe(false);
  });

  it('guardar ítems invalida detalle y revisión de ESA factura, nada más', () => {
    const inv = billItemsSavedInvalidations(k, 'h1', 'b1');
    const hit = (key: readonly unknown[]) => inv.some((p) => matches(p, key));
    expect(hit(k.items('h1', 'b1'))).toBe(true);
    expect(hit(k.assessment('h1', 'b1'))).toBe(true);
    expect(hit(k.items('h1', 'b2'))).toBe(false);
    expect(hit(k.assessment('h2', 'b1'))).toBe(false);
    expect(hit(['account', 7, 'bills', 'h1'])).toBe(false);
  });
});
