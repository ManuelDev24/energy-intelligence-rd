// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleBff } from "./bff";

const config = { enabled: true, apiBase: "http://127.0.0.1:8000", origin: "http://localhost:3000", secure: false };
const HOME = "11111111-1111-4111-8111-111111111111";
const OTHER = "55555555-5555-4555-8555-555555555555";
const EPOCH = "0123456789abcdef0123456789abcdef";
const cookie = `erd-epoch=${EPOCH}; erd-access=${EPOCH}~access-token`;
const body = (over: Record<string, unknown> = {}) => ({
  home_id: HOME, score_version: 1, as_of: "2026-10-11", status: "ok", score: 72, band: "good", band_label: "Bueno", quality: "INFERRED", coverage_pct: 60,
  components: [{ key: "consumption", label: "Consumo", weight: 35, score: 80, available: true, summary: "s", detail: "d", inputs: { method: "goal" }, reasons: [], next_step: "n" }],
  reasons: [], method: "m", note: "n", ...over,
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const url = `http://localhost:3000/api/bff/homes/${HOME}/energy-score`;
const get = (qs = "", headers: Record<string, string> = { cookie }) => new Request(`${url}${qs}`, { headers });
const write = (method: string) => new Request(url, { method, body: "{}", headers: { origin: config.origin, cookie, "content-type": "application/json" } });

describe("Energy Score por BFF (ERD-SCORE-01)", () => {
  it("lee con bearer y valida el contrato", async () => {
    const upstream = vi.fn().mockResolvedValue(json(body()));
    const response = await handleBff(get(), config, upstream);
    expect(response.status).toBe(200);
    expect((await response.json()).score).toBe(72);
    expect(upstream.mock.calls[0][0]).toBe(`http://127.0.0.1:8000/api/v1/homes/${HOME}/energy-score`);
    expect(upstream.mock.calls[0][1].headers.Authorization).toBe("Bearer access-token");
  });

  it("no acepta parámetros ni métodos de escritura", async () => {
    const upstream = vi.fn();
    expect((await handleBff(get("?on=2026-01-01"), config, upstream)).status).toBe(400);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) expect((await handleBff(write(method), config, upstream)).status, method).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rechaza respuestas de otra vivienda, con puntaje fuera de rango o con forma inválida", async () => {
    for (const bad of [body({ home_id: OTHER }), body({ quality: "REAL" }), body({ band: "excelente" }), { ...body(), components: [{ key: "otro" }], secreto: "x" }]) {
      const response = await handleBff(get(), config, vi.fn().mockResolvedValue(json(bad)));
      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(JSON.stringify(await response.json())).not.toContain("secreto");
    }
  });

  it("sin sesión no consulta la API", async () => {
    const upstream = vi.fn();
    expect((await handleBff(get("", {}), config, upstream)).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
});
