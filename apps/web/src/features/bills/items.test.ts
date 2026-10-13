import { describe, expect, it } from "vitest";
import { MAX_ITEMS, fromServer, moveItem, newDraft, validateItems, type ItemDraft } from "./items";

const draft = (over: Partial<ItemDraft> = {}): ItemDraft => ({ key: "k1", label: "Cargo por energía", kind: "charge", amount: "3000", ...over });

describe("validateItems (espejo del PUT /items)", () => {
  it("normaliza a texto con 2 decimales y conserva el orden", () => {
    const result = validateItems([draft(), draft({ key: "k2", label: "  Subsidio  ", kind: "discount", amount: "-100.5" })]);
    expect(result.payload).toEqual({ items: [
      { label: "Cargo por energía", kind: "charge", amount_dop: "3000.00" },
      { label: "Subsidio", kind: "discount", amount_dop: "-100.50" },
    ] });
    expect(result.errors).toEqual({});
  });

  it("acepta la lista vacía (quitar todo el detalle)", () => {
    expect(validateItems([]).payload).toEqual({ items: [] });
  });

  it("acepta miles con coma (1,000.50) y cero en ambos tipos", () => {
    expect(validateItems([draft({ amount: "1,000.50" })]).payload?.items[0].amount_dop).toBe("1000.50");
    expect(validateItems([draft({ amount: "0" }), draft({ key: "k2", kind: "discount", amount: "0" })]).payload?.items.map(i => i.amount_dop)).toEqual(["0.00", "0.00"]);
  });

  it.each([
    ["etiqueta vacía", { label: "" }, "label"],
    ["etiqueta en blanco", { label: "   " }, "label"],
    ["etiqueta de 201", { label: "x".repeat(201) }, "label"],
    ["monto vacío", { amount: "" }, "amount"],
    ["3 decimales", { amount: "1.234" }, "amount"],
    ["texto", { amount: "abc" }, "amount"],
    ["NaN", { amount: "NaN" }, "amount"],
    ["11 enteros", { amount: "12345678901" }, "amount"],
    ["cargo negativo", { amount: "-5" }, "amount"],
    ["descuento positivo", { kind: "discount" as const, amount: "5" }, "amount"],
  ])("rechaza %s sin payload", (_label, over, field) => {
    const result = validateItems([draft(over)]);
    expect(result.payload).toBeUndefined();
    expect(result.errors.k1).toHaveProperty(field);
  });

  it("el mensaje del signo explica qué hacer", () => {
    expect(validateItems([draft({ kind: "discount", amount: "5" })]).errors.k1.amount).toMatch(/descuento.*0 o negativo/i);
    expect(validateItems([draft({ amount: "-5" })]).errors.k1.amount).toMatch(/cargo.*0 o positivo/i);
  });

  it("acepta 200 caracteres y 100 ítems; rechaza 101", () => {
    expect(validateItems([draft({ label: "x".repeat(200) })]).payload).toBeDefined();
    const many = (n: number) => Array.from({ length: n }, (_, i) => draft({ key: `k${i}` }));
    expect(MAX_ITEMS).toBe(100);
    expect(validateItems(many(100)).payload?.items).toHaveLength(100);
    const over = validateItems(many(101));
    expect(over.payload).toBeUndefined();
    expect(over.form).toMatch(/100/);
  });
});

describe("edición de la lista", () => {
  const list = [draft({ key: "a" }), draft({ key: "b" }), draft({ key: "c" })];
  it("mueve arriba y abajo sin salirse de los bordes", () => {
    expect(moveItem(list, 1, -1).map(i => i.key)).toEqual(["b", "a", "c"]);
    expect(moveItem(list, 1, 1).map(i => i.key)).toEqual(["a", "c", "b"]);
    expect(moveItem(list, 0, -1)).toBe(list);
    expect(moveItem(list, 2, 1)).toBe(list);
  });

  it("fromServer copia los ítems en el orden de position y newDraft crea claves únicas", () => {
    const drafts = fromServer([
      { position: 1, label: "B", kind: "discount", amount_dop: "-1.00" },
      { position: 0, label: "A", kind: "charge", amount_dop: "2.00" },
    ]);
    expect(drafts.map(d => [d.label, d.kind, d.amount])).toEqual([["A", "charge", "2.00"], ["B", "discount", "-1.00"]]);
    expect(new Set([newDraft().key, newDraft().key, ...drafts.map(d => d.key)]).size).toBe(4);
  });
});
