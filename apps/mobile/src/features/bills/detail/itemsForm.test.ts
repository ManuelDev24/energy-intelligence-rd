import { describe, expect, it } from 'vitest';

import { MAX_ITEMS, canAddItem, draftsFromItems, newDraft, validateItems, type ItemDraft } from './itemsForm';

const d = (label: string, kind: 'charge' | 'discount', amount: string, id = label): ItemDraft => ({ id, label, kind, amount });

describe('validación de ítems (mismas reglas que PUT /bills/{id}/items)', () => {
  it('lista vacía es válida: borra el detalle (la API devolverá total null, no 0)', () => {
    expect(validateItems([])).toEqual({ errors: {}, listError: null, input: { items: [] } });
  });

  it('cargo con miles "1,000" se envía como 1000.00 (igual que el resto de la app)', () => {
    expect(validateItems([d('Energía', 'charge', '1,000')]).input).toEqual({ items: [{ label: 'Energía', kind: 'charge', amount_dop: '1000.00' }] });
  });

  it('coma decimal "1250,5" y "1,250.50" se normalizan sin pasar por float', () => {
    expect(validateItems([d('A', 'charge', '1250,5')]).input?.items[0].amount_dop).toBe('1250.50');
    expect(validateItems([d('A', 'charge', '1,250.50')]).input?.items[0].amount_dop).toBe('1250.50');
    expect(validateItems([d('A', 'charge', '0012.3')]).input?.items[0].amount_dop).toBe('12.30');
  });

  it('un descuento se escribe sin signo y se envía negativo (descuento <= 0)', () => {
    expect(validateItems([d('Subsidio', 'discount', '150')]).input?.items[0]).toEqual({ label: 'Subsidio', kind: 'discount', amount_dop: '-150.00' });
  });

  it('cero es válido para ambos tipos y nunca se envía "-0.00"', () => {
    expect(validateItems([d('A', 'discount', '0')]).input?.items[0].amount_dop).toBe('0.00');
    expect(validateItems([d('A', 'charge', '0,00')]).input?.items[0].amount_dop).toBe('0.00');
  });

  it('rechaza signo escrito, vacío, texto, más de 2 decimales y más de 10 enteros', () => {
    const cases: [string, RegExp][] = [
      ['-5', /sin signo/], ['+5', /sin signo/], ['', /Ingrese el monto/], ['abc', /número/],
      ['1.234', /2 decimales/], ['12345678901', /demasiado grande/],
    ];
    for (const [amount, msg] of cases) {
      const r = validateItems([d('A', 'charge', amount)]);
      expect(r.input).toBeNull();
      expect(r.errors.A?.amount).toMatch(msg);
    }
    expect(validateItems([d('A', 'charge', '9999999999.99')]).input?.items[0].amount_dop).toBe('9999999999.99');
  });

  it('concepto: obligatorio, no solo espacios, sin NUL, máx. 200 caracteres (puntos de código, como Python)', () => {
    expect(validateItems([d('   ', 'charge', '1', 'x')]).errors.x?.label).toMatch(/concepto/);
    expect(validateItems([d('a\u0000b', 'charge', '1', 'x')]).errors.x?.label).toMatch(/no válidos/);
    expect(validateItems([d('a'.repeat(201), 'charge', '1', 'x')]).errors.x?.label).toMatch(/200/);
    expect(validateItems([d('😀'.repeat(200), 'charge', '1', 'x')]).input).not.toBeNull();
    expect(validateItems([d('  Cargo fijo  ', 'charge', '1', 'x')]).input?.items[0].label).toBe('Cargo fijo');
  });

  it('máximo 100 ítems', () => {
    const many = Array.from({ length: MAX_ITEMS + 1 }, (_, i) => d(`I${i}`, 'charge', '1'));
    const r = validateItems(many);
    expect(r.input).toBeNull();
    expect(r.listError).toMatch(/100/);
    expect(canAddItem(many.slice(0, MAX_ITEMS))).toBe(false);
    expect(canAddItem(many.slice(0, MAX_ITEMS - 1))).toBe(true);
  });

  it('el payload solo lleva label/kind/amount_dop (sin posición ni id local)', () => {
    const item = validateItems([d('A', 'charge', '1')]).input?.items[0];
    expect(Object.keys(item ?? {}).sort()).toEqual(['amount_dop', 'kind', 'label']);
  });
});

describe('borradores desde la API', () => {
  it('un descuento guardado (-150.00) se edita como magnitud y conserva el tipo', () => {
    const drafts = draftsFromItems([
      { position: 0, label: 'Energía', kind: 'charge', amount_dop: '1000.00' },
      { position: 1, label: 'Subsidio', kind: 'discount', amount_dop: '-150.00' },
    ]);
    expect(drafts.map(({ label, kind, amount }) => ({ label, kind, amount }))).toEqual([
      { label: 'Energía', kind: 'charge', amount: '1000.00' },
      { label: 'Subsidio', kind: 'discount', amount: '150.00' },
    ]);
    expect(new Set(drafts.map((x) => x.id)).size).toBe(2);
  });

  it('un ítem nuevo es un cargo vacío con id único', () => {
    const a = newDraft();
    const b = newDraft();
    expect(a).toMatchObject({ label: '', kind: 'charge', amount: '' });
    expect(a.id).not.toBe(b.id);
  });
});
