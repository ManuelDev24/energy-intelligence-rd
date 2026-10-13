// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleBff } from "./bff";

const config = { enabled: true, apiBase: "http://127.0.0.1:8000", origin: "http://localhost:3000", secure: false };
const HOME = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const EPOCH = "0123456789abcdef0123456789abcdef";
const cookie = `erd-epoch=${EPOCH}; erd-access=${EPOCH}~access-token`;
const field = (value: string | null) => ({ value, confidence: value === null ? "none" : "high" });
const draft = {
  period_start: field("2026-09-01"), period_end: field("2026-09-30"), days: field("30"), kwh: field("320"),
  amount_dop: field("4500.00"), reading_previous: field(null), reading_current: field(null), due_date: field(null), warnings: [], raw_text_excerpt: "TOTAL",
};
const job = (over: Record<string, unknown> = {}) => ({
  document_id: DOC, status: "pending", attempts: 0, method: null, pages_read: null, pages_total: null, draft: null,
  error_code: null, error_message: null, created_at: "2026-10-10T12:00:00Z", finished_at: null, ...over,
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const base = `http://localhost:3000/api/bff/homes/${HOME}/bills/ocr-jobs`;

function upload(size = 64, type = "application/pdf", extra: Record<string, string> = {}) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(size)], { type }), "factura.pdf");
  form.append("source", "web");
  return new Request(base, { method: "POST", body: form, headers: { origin: config.origin, cookie, ...extra } });
}
const get = (path = `/${DOC}`, headers: Record<string, string> = {}) => new Request(base + path, { headers: { cookie, ...headers } });
const post = (path: string, body: unknown = {}) => new Request(base + path, {
  method: "POST", body: JSON.stringify(body), headers: { origin: config.origin, cookie, "content-type": "application/json" },
});

describe("OCR asíncrono por BFF (ERD-OCR-PROD)", () => {
  it("reenvía el archivo con bearer, conserva el 202 y valida el estado", async () => {
    const upstream = vi.fn().mockResolvedValue(json(job(), 202));
    const response = await handleBff(upload(), config, upstream);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual(job());
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe(`http://127.0.0.1:8000/api/v1/homes/${HOME}/bills/ocr-jobs`);
    expect(init.headers.Authorization).toBe("Bearer access-token");
    expect(init.headers["Content-Type"]).toMatch(/^multipart\/form-data; boundary=/);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
  });

  it("acepta PDF de hasta 20 MB y rechaza más con 413 sin tocar la API", async () => {
    const upstream = vi.fn().mockResolvedValue(json(job(), 202));
    expect((await handleBff(upload(15 * 1024 * 1024), config, upstream)).status).toBe(202);
    const refused = vi.fn();
    expect((await handleBff(upload(20 * 1024 * 1024 + 8192), config, refused)).status).toBe(413);
    expect(refused).not.toHaveBeenCalled();
  });

  it("la ruta síncrona antigua (/bills/ocr) ya no existe y no llega a la API (auditoría C-02)", async () => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(64)], { type: "image/png" }), "x.png");
    const upstream = vi.fn();
    const multipart = new Request(`http://localhost:3000/api/bff/homes/${HOME}/bills/ocr`, { method: "POST", body: form, headers: { origin: config.origin, cookie } });
    expect([404, 415]).toContain((await handleBff(multipart, config, upstream)).status);
    const json_ = new Request(`http://localhost:3000/api/bff/homes/${HOME}/bills/ocr`, { method: "POST", body: "{}", headers: { origin: config.origin, cookie, "content-type": "application/json" } });
    expect((await handleBff(json_, config, upstream)).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("consulta el estado y entrega el borrador", async () => {
    const done = job({ status: "done", method: "text_layer", pages_read: 2, pages_total: 2, draft });
    const upstream = vi.fn().mockResolvedValue(json(done));
    const response = await handleBff(get(), config, upstream);
    expect(response.status).toBe(200);
    expect((await response.json()).draft.kwh.value).toBe("320");
    expect(upstream.mock.calls[0][0]).toBe(`http://127.0.0.1:8000/api/v1/homes/${HOME}/bills/ocr-jobs/${DOC}`);
  });

  it("no acepta parámetros de consulta en el sondeo", async () => {
    const upstream = vi.fn();
    expect((await handleBff(get(`/${DOC}?x=1`), config, upstream)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rechaza una respuesta de otro documento (no se la entrega al navegador)", async () => {
    const upstream = vi.fn().mockResolvedValue(json(job({ document_id: "33333333-3333-4333-8333-333333333333" })));
    const response = await handleBff(get(), config, upstream);
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(await response.json())).not.toContain("3333");
  });

  it("rechaza respuestas que no cumplen el contrato", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ status: "raro", secret: "x" }));
    const response = await handleBff(get(), config, upstream);
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });

  it("reintenta con cuerpo JSON vacío y estricto", async () => {
    const upstream = vi.fn().mockResolvedValue(json(job(), 202));
    const ok = await handleBff(post(`/${DOC}/retry`), config, upstream);
    expect(ok.status).toBe(202);
    expect(upstream.mock.calls[0][1].method).toBe("POST");
    const refused = vi.fn();
    expect((await handleBff(post(`/${DOC}/retry`, { extra: 1 }), config, refused)).status).toBe(422);
    expect(refused).not.toHaveBeenCalled();
  });

  it("sin sesión o con otro origen no consulta la API", async () => {
    const upstream = vi.fn();
    const noSession = new Request(base + `/${DOC}`, { headers: {} });
    expect((await handleBff(noSession, config, upstream)).status).toBe(401);
    const evil = post(`/${DOC}/retry`);
    evil.headers.set("origin", "https://evil.example");
    expect((await handleBff(evil, config, upstream)).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    ["método no permitido en el estado", () => new Request(base + `/${DOC}`, { method: "DELETE", headers: { origin: config.origin, cookie, "content-type": "application/json" } })],
    ["id inválido", () => get("/no-es-uuid")],
    ["subruta desconocida", () => get(`/${DOC}/extra`)],
    ["GET en el reintento", () => get(`/${DOC}/retry`)],
    ["JSON en el inicio", () => new Request(base, { method: "POST", body: "{}", headers: { origin: config.origin, cookie, "content-type": "application/json" } })],
  ])("%s no llega a la API", async (_name, make) => {
    const upstream = vi.fn();
    expect([404, 415, 405]).toContain((await handleBff(make(), config, upstream)).status);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("traduce los errores con mensajes locales, sin reenviar el texto de la API", async () => {
    const quota = vi.fn().mockResolvedValue(json({ detail: "TEXTO-INTERNO", code: "document_quota_exceeded" }, 409));
    const busy = await (await handleBff(upload(), config, quota)).json();
    expect(busy.code).toBe("document_quota_exceeded");
    expect(JSON.stringify(busy)).toContain("varias facturas");
    expect(JSON.stringify(busy)).not.toContain("TEXTO-INTERNO");
    const down = vi.fn().mockResolvedValue(json({ detail: "boom s3://secreto", code: "storage_unavailable" }, 503));
    const unavailable = await (await handleBff(upload(), config, down)).json();
    expect(JSON.stringify(unavailable)).toContain("manualmente");
    expect(JSON.stringify(unavailable)).not.toContain("secreto");
    const bad = vi.fn().mockResolvedValue(json({ detail: "x", code: "invalid_input" }, 422));
    expect(JSON.stringify(await (await handleBff(upload(), config, bad)).json())).toContain("JPG, PNG, WEBP o HEIC");
  });

  it("al confirmar la factura se permite document_id y nada más", async () => {
    const bill = { period_start: "2026-08-01", period_end: "2026-08-31", days: 31, kwh: "300", amount_dop: "4000", document_id: DOC };
    const created = { id: "44444444-4444-4444-8444-444444444444", home_id: HOME, period_start: "2026-08-01", period_end: "2026-08-31", kwh: "300.00",
      amount_dop: "4000.00", days: 31, reading_previous: null, reading_current: null, due_date: null, paid_at: null, source: "manual", created_at: "2026-10-10T12:00:00Z", updated_at: "2026-10-10T12:00:00Z" };
    const upstream = vi.fn().mockResolvedValue(json(created, 201));
    const request = new Request(`http://localhost:3000/api/bff/homes/${HOME}/bills`, {
      method: "POST", body: JSON.stringify(bill), headers: { origin: config.origin, cookie, "content-type": "application/json" } });
    const response = await handleBff(request, config, upstream);
    expect([200, 201]).toContain(response.status);
    expect(JSON.parse(upstream.mock.calls[0][1].body).document_id).toBe(DOC);
    const strange = new Request(request.url, { method: "POST", body: JSON.stringify({ ...bill, storage_key: "x" }), headers: request.headers });
    const refused = vi.fn();
    expect((await handleBff(strange, config, refused)).status).toBe(422);
    expect(refused).not.toHaveBeenCalled();
  });
});
