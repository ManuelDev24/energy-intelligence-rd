// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleBff } from "./bff";

const config = { enabled: true, apiBase: "http://127.0.0.1:8000", origin: "http://localhost:3000", secure: false };
const HOME = "11111111-1111-4111-8111-111111111111";
const EPOCH = "0123456789abcdef0123456789abcdef";
const cookie = `erd-epoch=${EPOCH}; erd-access=${EPOCH}~access-token`;
const field = (value: string | null) => ({ value, confidence: value === null ? "none" : "high" });
const draft = {
  period_start: field("2026-09-01"), period_end: field("2026-09-30"), days: field("30"), kwh: field("320"),
  amount_dop: field("4500.00"), reading_previous: field(null), reading_current: field(null), warnings: [], raw_text_excerpt: "TOTAL",
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

function upload(path = `homes/${HOME}/bills/ocr`, init: { type?: string; size?: number; cookies?: string; extra?: Record<string, string> } = {}) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(init.size ?? 64)], { type: "image/png" }), "factura.png");
  const request = new Request(`http://localhost:3000/api/bff/${path}`, {
    method: "POST", body: form,
    headers: { origin: config.origin, cookie: init.cookies ?? cookie, ...(init.extra ?? {}) },
  });
  if (init.type) request.headers.set("content-type", init.type);
  return request;
}

describe("OCR por BFF (ERD-BILL-LIVE-QA)", () => {
  it("reenvía la foto multipart con bearer y devuelve el borrador validado", async () => {
    const upstream = vi.fn().mockResolvedValue(json(draft));
    const response = await handleBff(upload(), config, upstream);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(draft);
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe(`http://127.0.0.1:8000/api/v1/homes/${HOME}/bills/ocr`);
    expect(init.headers.Authorization).toBe("Bearer access-token");
    expect(init.headers["Content-Type"]).toMatch(/^multipart\/form-data; boundary=/);
    expect(init.signal).toBeDefined();
    expect(response.headers.get("cache-control")).toBe("no-store, private");
  });

  it("sin sesión no consulta la API", async () => {
    const upstream = vi.fn();
    expect((await handleBff(upload(undefined, { cookies: "" }), config, upstream)).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("exige el mismo origen", async () => {
    const upstream = vi.fn();
    const request = upload(undefined, { extra: { origin: "https://evil.example" } });
    request.headers.set("origin", "https://evil.example");
    expect((await handleBff(request, config, upstream)).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    ["JSON en la ruta de OCR", { type: "application/json" }],
    ["texto plano", { type: "text/plain" }],
    ["multipart sin boundary", { type: "multipart/form-data" }],
  ])("rechaza %s con 415 sin tocar la API", async (_name, init) => {
    const upstream = vi.fn();
    expect((await handleBff(upload(undefined, init), config, upstream)).status).toBe(415);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rechaza archivos de más de 10 MB con 413 sin tocar la API", async () => {
    const upstream = vi.fn();
    expect((await handleBff(upload(undefined, { size: 10 * 1024 * 1024 + 8192 }), config, upstream)).status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    ["otra ruta de facturas", `homes/${HOME}/bills`],
    ["id de vivienda inválido", "homes/not-a-uuid/bills/ocr"],
    ["ruta con prefijo extra", `homes/${HOME}/bills/ocr/x`],
    ["equipos", `homes/${HOME}/equipment`],
  ])("multipart no se admite en %s", async (_name, path) => {
    const upstream = vi.fn();
    expect([404, 415]).toContain((await handleBff(upload(path), config, upstream)).status);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rechaza parámetros de consulta", async () => {
    const upstream = vi.fn();
    expect((await handleBff(upload(`homes/${HOME}/bills/ocr?url=https://evil.example`), config, upstream)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("una respuesta que no cumple el contrato no se devuelve", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ ...draft, kwh: "320" }));
    expect((await handleBff(upload(), config, upstream)).status).toBe(502);
  });

  it("los errores de la API no filtran detalle y conservan el estado", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ detail: "secreto <script>", code: "invalid_input" }, 422));
    const response = await handleBff(upload(), config, upstream);
    expect(response.status).toBe(422);
    expect(JSON.stringify(await response.json())).not.toContain("secreto");
  });
});
