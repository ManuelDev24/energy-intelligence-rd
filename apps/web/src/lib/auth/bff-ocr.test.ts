// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleBff } from "./bff";

// ERD-BILL-LIVE-QA / auditoría C-02: la única ruta multipart del BFF es `bills/ocr-jobs`. Estas pruebas fijan sus bordes
// (sesión, origen, tipo de contenido, tamaño, consulta, rutas vecinas); el comportamiento completo está en bff-ocr-jobs.test.ts.
const config = { enabled: true, apiBase: "http://127.0.0.1:8000", origin: "http://localhost:3000", secure: false };
const HOME = "11111111-1111-4111-8111-111111111111";
const EPOCH = "0123456789abcdef0123456789abcdef";
const cookie = `erd-epoch=${EPOCH}; erd-access=${EPOCH}~access-token`;

function upload(path = `homes/${HOME}/bills/ocr-jobs`, init: { type?: string; size?: number; cookies?: string; extra?: Record<string, string> } = {}) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(init.size ?? 64)], { type: "image/png" }), "factura.png");
  const request = new Request(`http://localhost:3000/api/bff/${path}`, {
    method: "POST", body: form,
    headers: { origin: config.origin, cookie: init.cookies ?? cookie, ...(init.extra ?? {}) },
  });
  if (init.type) request.headers.set("content-type", init.type);
  return request;
}

describe("subida de facturas por BFF (única ruta multipart)", () => {
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
    ["JSON en la ruta de subida", { type: "application/json" }],
    ["texto plano", { type: "text/plain" }],
    ["multipart sin boundary", { type: "multipart/form-data" }],
  ])("rechaza %s con 415 sin tocar la API", async (_name, init) => {
    const upstream = vi.fn();
    expect((await handleBff(upload(undefined, init), config, upstream)).status).toBe(415);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rechaza archivos de más de 20 MB con 413 sin tocar la API", async () => {
    const upstream = vi.fn();
    expect((await handleBff(upload(undefined, { size: 20 * 1024 * 1024 + 8192 }), config, upstream)).status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    ["otra ruta de facturas", `homes/${HOME}/bills`],
    ["la ruta síncrona retirada", `homes/${HOME}/bills/ocr`],
    ["id de vivienda inválido", "homes/not-a-uuid/bills/ocr-jobs"],
    ["ruta con prefijo extra", `homes/${HOME}/bills/ocr-jobs/x`],
    ["equipos", `homes/${HOME}/equipment`],
  ])("multipart no se admite en %s", async (_name, path) => {
    const upstream = vi.fn();
    expect([404, 415]).toContain((await handleBff(upload(path), config, upstream)).status);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rechaza parámetros de consulta", async () => {
    const upstream = vi.fn();
    expect((await handleBff(upload(`homes/${HOME}/bills/ocr-jobs?url=https://evil.example`), config, upstream)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
});
