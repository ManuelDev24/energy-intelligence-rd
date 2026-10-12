// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleBff } from "./bff";

const config = { enabled: true, apiBase: "http://127.0.0.1:8000", origin: "http://localhost:3000", secure: false };
const HOME = "11111111-1111-4111-8111-111111111111";
const OTHER = "55555555-5555-4555-8555-555555555555";
const ID = "66666666-6666-4666-8666-666666666666";
const EPOCH = "0123456789abcdef0123456789abcdef";
const cookie = `erd-epoch=${EPOCH}; erd-access=${EPOCH}~access-token`;
const row = (over: Record<string, unknown> = {}) => ({
  id: ID, home_id: HOME, started_at: "2026-10-11T18:30:00Z", ended_at: "2026-10-11T20:00:00Z", cause: "utility_fault", note: null, source: "manual",
  created_at: "2026-10-11T21:00:00Z", updated_at: "2026-10-11T21:00:00Z", ongoing: false, duration_minutes: 90, ...over,
});
const summary = (over: Record<string, unknown> = {}) => ({
  home_id: HOME, timezone: "America/Santo_Domingo", from_month: "2026-10", to_month: "2026-10",
  months: [{ month: "2026-10", count: 1, total_minutes: 90, longest_minutes: 90, average_minutes: 90, ongoing: 0 }],
  totals: { count: 1, total_minutes: 90, longest_minutes: 90, average_minutes: 90, ongoing: 0 }, note: "n", ...over,
});
const input = { started_at: "2026-10-11T14:30:00-04:00", ended_at: "2026-10-11T16:00:00-04:00", cause: "utility_fault", note: null };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const base = `http://localhost:3000/api/bff/homes/${HOME}/outages`;
const get = (path = "", headers: Record<string, string> = { cookie }) => new Request(`${base}${path}`, { headers });
const write = (path: string, method: string, body: unknown = {}) => new Request(`${base}${path}`, { method, body: JSON.stringify(body), headers: { origin: config.origin, cookie, "content-type": "application/json" } });

describe("interrupciones por BFF (ERD-INT-01)", () => {
  it("lista el historial con paginación y valida el contrato", async () => {
    const upstream = vi.fn().mockResolvedValue(json([row()]));
    const response = await handleBff(get("?limit=100&offset=0"), config, upstream);
    expect(response.status).toBe(200);
    expect((await response.json())[0].duration_minutes).toBe(90);
    expect(upstream.mock.calls[0][0]).toBe(`http://127.0.0.1:8000/api/v1/homes/${HOME}/outages?limit=100&offset=0`);
    expect(upstream.mock.calls[0][1].headers.Authorization).toBe("Bearer access-token");
    const refused = vi.fn();
    for (const qs of ["?x=1", "?limit=abc", "?offset=-1"]) expect((await handleBff(get(qs), config, refused)).status, qs).toBe(400);
    expect(refused).not.toHaveBeenCalled();
  });

  it("el resumen solo acepta `months` entre 1 y 24", async () => {
    const upstream = vi.fn().mockImplementation(async () => json(summary()));
    expect((await handleBff(get("/summary?months=12"), config, upstream)).status).toBe(200);
    expect((await handleBff(get("/summary"), config, upstream)).status).toBe(200);
    const refused = vi.fn();
    for (const qs of ["?months=0", "?months=25", "?months=x", "?months=1&months=2", "?otro=1"]) expect((await handleBff(get(`/summary${qs}`), config, refused)).status, qs).toBe(400);
    expect(refused).not.toHaveBeenCalled();
  });

  it("crea con POST, corrige con PUT y borra con DELETE; el cuerpo es estricto", async () => {
    const created = vi.fn().mockResolvedValue(json(row(), 201));
    const post = await handleBff(write("", "POST", input), config, created);
    expect(post.status).toBe(201);
    expect(JSON.parse(created.mock.calls[0][1].body)).toEqual(input);
    expect((await handleBff(write(`/${ID}`, "PUT", input), config, vi.fn().mockResolvedValue(json(row())))).status).toBe(200);
    expect((await handleBff(write(`/${ID}`, "DELETE"), config, vi.fn().mockResolvedValue(new Response(null, { status: 204 })))).status).toBe(204);
    const refused = vi.fn();
    for (const bad of [{ ...input, source: "api" }, { ...input, cause: "rayo" }, { ...input, started_at: "ayer" }, { ended_at: null }, { ...input, id: ID }]) {
      expect((await handleBff(write("", "POST", bad), config, refused)).status, JSON.stringify(bad)).toBe(422);
    }
    expect(refused).not.toHaveBeenCalled();
  });

  it("rechaza filas de otra vivienda o de otro id y formas inválidas", async () => {
    for (const [request, body] of [
      [get(), [row({ home_id: OTHER })]], [get(`/${ID}`), row({ id: OTHER })], [get("/summary"), summary({ home_id: OTHER })],
      [get(), [row({ cause: "rayo" })]], [get(), [{ ...row(), secreto: "x", id: undefined }]],
    ] as const) {
      const response = await handleBff(request, config, vi.fn().mockResolvedValue(json(body)));
      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(JSON.stringify(await response.json())).not.toContain("secreto");
    }
  });

  it("no hay más rutas: ids inválidos, PATCH, métodos sobre el resumen", async () => {
    const upstream = vi.fn();
    for (const request of [write("/no-es-uuid", "PUT", input), write(`/${ID}`, "PATCH", input), write("/summary", "POST"), write("/summary", "DELETE"), get(`/${ID}/otra`)]) {
      expect((await handleBff(request, config, upstream)).status).toBe(404);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("traduce el solape (409) y la validación (422) a mensajes locales, sin texto del servidor", async () => {
    const conflict = await handleBff(write("", "POST", input), config, vi.fn().mockResolvedValue(json({ detail: "TEXTO-INTERNO", code: "conflict" }, 409)));
    expect(conflict.status).toBe(409);
    const text = JSON.stringify(await conflict.json());
    expect(text).toContain("se solapa");
    expect(text).not.toContain("TEXTO-INTERNO");
  });

  it("sin sesión no consulta la API", async () => {
    const upstream = vi.fn();
    expect((await handleBff(get("", {}), config, upstream)).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
});
