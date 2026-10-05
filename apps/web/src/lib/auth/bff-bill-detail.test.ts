// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleBff } from "./bff";

// ERD-BILL-02: detalle de cargos (GET/PUT /items) y revisión de consistencia (POST /validate,
// solo lectura). Misma frontera estricta: método + patrón + consulta vacía + cuerpo estricto +
// contrato de respuesta con home_id/bill_id coincidentes, siempre antes de contactar la API.
const config = { enabled: true, apiBase: "http://127.0.0.1:8000", origin: "http://localhost:3000", secure: false };
const EPOCH = "0123456789abcdef0123456789abcdef";
const session = `erd-epoch=${EPOCH}; erd-access=${EPOCH}~access-token`;
const HOME = "11111111-1111-4111-8111-111111111111";
const OTHER_HOME = "22222222-2222-4222-8222-222222222222";
const BILL = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_BILL = "aaaaaaaa-0000-4000-8000-000000000002";
const req = (path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost:3000/api/bff/${path}`, {
    method,
    headers: { origin: config.origin, "content-type": "application/json", cookie: session, ...headers },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

const detail = (home = HOME, bill = BILL) => ({
  home_id: home, bill_id: bill,
  items: [{ position: 0, label: "Cargo por energía", kind: "charge", amount_dop: "3000.00" }, { position: 1, label: "Subsidio", kind: "discount", amount_dop: "-100.00" }],
  items_total_dop: "2900.00", bill_amount_dop: "3100.00", difference_dop: "-200.00",
});
const assessment = (home = HOME, bill = BILL) => ({
  home_id: home, bill_id: bill, read_only: true, approval: "not_performed", status: "warnings",
  checks: [{ code: "items_sum", status: "warning", observed: { difference_dop: "-200.00" } }],
  warnings: ["items_sum"],
  provenance: { origin: "creation", original_available: true, data: { amount_dop: "3100.00" }, captured_at: "2026-10-01T12:00:00Z" },
  corrections: [], corrections_has_more: false, detail: detail(home, bill),
});
const items = `homes/${HOME}/bills/${BILL}/items`;
const validate = `homes/${HOME}/bills/${BILL}/validate`;
const replace = { items: [{ label: "Cargo por energía", kind: "charge", amount_dop: "3000.00" }, { label: "Subsidio", kind: "discount", amount_dop: "-100.00" }] };

describe("BFF ERD-BILL-02: rutas permitidas", () => {
  it("GET items llega a la API con el bearer y devuelve el contrato", async () => {
    const upstream = vi.fn().mockResolvedValue(json(detail()));
    const response = await handleBff(req(items), config, upstream);
    expect(response.status).toBe(200);
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe(`${config.apiBase}/api/v1/${items}`);
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer access-token");
    expect((await response.json()).items_total_dop).toBe("2900.00");
  });

  it("GET items vacío conserva null (nunca 0)", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ ...detail(), items: [], items_total_dop: null, difference_dop: null }));
    const body = await (await handleBff(req(items), config, upstream)).json();
    expect(body.items_total_dop).toBeNull();
    expect(body.difference_dop).toBeNull();
  });

  it("PUT items reenvía exactamente el cuerpo validado", async () => {
    const upstream = vi.fn().mockResolvedValue(json(detail()));
    const response = await handleBff(req(items, "PUT", replace), config, upstream);
    expect(response.status).toBe(200);
    const [, init] = upstream.mock.calls[0];
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual(replace);
  });

  it("PUT items acepta la lista vacía (borrar el detalle)", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ ...detail(), items: [], items_total_dop: null, difference_dop: null }));
    expect((await handleBff(req(items, "PUT", { items: [] }), config, upstream)).status).toBe(200);
    expect(JSON.parse(upstream.mock.calls[0][1].body)).toEqual({ items: [] });
  });

  it("POST validate envía {} y devuelve la evaluación de solo lectura", async () => {
    const upstream = vi.fn().mockResolvedValue(json(assessment()));
    const response = await handleBff(req(validate, "POST", {}), config, upstream);
    expect(response.status).toBe(200);
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe(`${config.apiBase}/api/v1/${validate}`);
    expect(init.body).toBe("{}");
    const body = await response.json();
    expect(body.approval).toBe("not_performed");
    expect(body.read_only).toBe(true);
  });
});

describe("BFF ERD-BILL-02: respuestas fuera de contrato → 502", () => {
  it.each([
    ["items de otra factura", items, "GET", undefined, detail(HOME, OTHER_BILL)],
    ["items de otra vivienda", items, "GET", undefined, detail(OTHER_HOME, BILL)],
    ["PUT con respuesta de otra factura", items, "PUT", replace, detail(HOME, OTHER_BILL)],
    ["items con tipo inventado", items, "GET", undefined, { ...detail(), items: [{ position: 0, label: "x", kind: "tax", amount_dop: "1.00" }] }],
    ["validate de otra factura", validate, "POST", {}, assessment(HOME, OTHER_BILL)],
    ["validate de otra vivienda", validate, "POST", {}, assessment(OTHER_HOME, BILL)],
    ["validate con detalle de otra factura", validate, "POST", {}, { ...assessment(), detail: detail(HOME, OTHER_BILL) }],
    ["validate que dice aprobar", validate, "POST", {}, { ...assessment(), approval: "approved" }],
    ["validate con read_only false", validate, "POST", {}, { ...assessment(), read_only: false }],
    ["validate con origen ocr", validate, "POST", {}, { ...assessment(), provenance: { ...assessment().provenance, origin: "ocr" } }],
  ] as const)("%s", async (_label, path, method, body, upstreamBody) => {
    const upstream = vi.fn().mockResolvedValue(json(upstreamBody));
    expect((await handleBff(req(path, method, body), config, upstream)).status).toBe(502);
  });
});

describe("BFF ERD-BILL-02: variantes no listadas nunca llegan a la API", () => {
  it.each([
    ["PATCH items", items, "PATCH", replace],
    ["DELETE items", items, "DELETE", undefined],
    ["POST items", items, "POST", replace],
    ["GET validate", validate, "GET", undefined],
    ["PUT validate", validate, "PUT", {}],
    ["DELETE validate", validate, "DELETE", undefined],
    ["factura no UUID", `homes/${HOME}/bills/not-a-uuid/items`, "GET", undefined],
    ["vivienda no UUID", `homes/abc/bills/${BILL}/items`, "GET", undefined],
    ["subruta de items", `${items}/0`, "GET", undefined],
    ["subruta de validate", `${validate}/approve`, "POST", {}],
    ["approve inventado", `homes/${HOME}/bills/${BILL}/approve`, "POST", {}],
  ] as const)("%s → 404/405", async (_label, path, method, body) => {
    const upstream = vi.fn();
    const response = await handleBff(req(path, method, body), config, upstream);
    expect([404, 405]).toContain(response.status);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    ["items con limit", `${items}?limit=10`, "GET", undefined],
    ["items con parámetro extra", `${items}?home=x`, "GET", undefined],
    ["PUT items con consulta", `${items}?force=true`, "PUT", replace],
    ["validate con consulta", `${validate}?validated=true`, "POST", {}],
  ] as const)("%s → 400", async (_label, path, method, body) => {
    const upstream = vi.fn();
    expect((await handleBff(req(path, method, body), config, upstream)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    ["validated:true", { validated: true }],
    ["approval", { approval: "approved" }],
    ["campo cualquiera", { note: "x" }],
    ["lista", []],
    ["null", null],
  ])("POST validate con cuerpo %s → 422", async (_label, body) => {
    const upstream = vi.fn();
    expect((await handleBff(req(validate, "POST", body), config, upstream)).status).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
  });

  const item = { label: "Cargo", kind: "charge", amount_dop: "10.00" };
  it.each([
    ["sin items", {}],
    ["campo extra en raíz", { ...replace, bill_id: BILL }],
    ["position inyectada", { items: [{ ...item, position: 3 }] }],
    ["source ocr", { items: [{ ...item, source: "ocr" }] }],
    ["etiqueta vacía", { items: [{ ...item, label: "" }] }],
    ["etiqueta en blanco", { items: [{ ...item, label: "   " }] }],
    ["etiqueta de 201", { items: [{ ...item, label: "x".repeat(201) }] }],
    ["tipo inventado", { items: [{ ...item, kind: "tax" }] }],
    ["cargo negativo", { items: [{ ...item, amount_dop: "-1.00" }] }],
    ["descuento positivo", { items: [{ ...item, kind: "discount", amount_dop: "1.00" }] }],
    ["3 decimales", { items: [{ ...item, amount_dop: "1.234" }] }],
    ["número en vez de texto", { items: [{ ...item, amount_dop: 10 }] }],
    ["demasiados enteros", { items: [{ ...item, amount_dop: "12345678901.00" }] }],
    ["NaN", { items: [{ ...item, amount_dop: "NaN" }] }],
    ["101 ítems", { items: Array.from({ length: 101 }, () => item) }],
  ])("PUT items con %s → 422", async (_label, body) => {
    const upstream = vi.fn();
    expect((await handleBff(req(items, "PUT", body), config, upstream)).status).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("PUT items acepta exactamente 100 ítems y 200 caracteres", async () => {
    const upstream = vi.fn().mockResolvedValue(json(detail()));
    const body = { items: Array.from({ length: 100 }, () => ({ ...item, label: "x".repeat(200) })) };
    expect((await handleBff(req(items, "PUT", body), config, upstream)).status).toBe(200);
  });

  it("escrituras exigen el mismo origen", async () => {
    const upstream = vi.fn();
    expect((await handleBff(req(validate, "POST", {}, { origin: "https://evil.test" }), config, upstream)).status).toBe(403);
    expect((await handleBff(req(items, "PUT", replace, { origin: "https://evil.test" }), config, upstream)).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("el texto de error de la API nunca se reenvía", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ detail: "SERVER-SECRET constraint ck_bill_items_sign" }, 422));
    const response = await handleBff(req(items, "PUT", replace), config, upstream);
    expect(response.status).toBe(422);
    expect(JSON.stringify(await response.json())).not.toContain("SERVER-SECRET");
  });
});
