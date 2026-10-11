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
  id: ID, home_id: HOME, equipment_id: null, anomaly_id: null, rule_id: "ac-one-hour", rule_version: 1, ruleset_version: 1, category: "equipment",
  title: "t", summary: "s", action: "a", confidence: "medium", status: "active", savings_kwh_month: "45.00", savings_dop_month: null,
  assumptions: ["x"], evidence: { power_w: "1500" }, created_at: "2026-10-11T12:00:00Z", last_seen_at: "2026-10-11T12:00:00Z",
  status_changed_at: "2026-10-11T12:00:00Z", ...over,
});
const list = (over: Record<string, unknown> = {}) => ({ home_id: HOME, ruleset_version: 1, items: [row()], total_savings_kwh_month: null, total_savings_dop_month: null, note: "n", ...over });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const base = `http://localhost:3000/api/bff/homes/${HOME}/recommendations`;
const write = (url: string, method: string, body: unknown) => new Request(url, { method, body: JSON.stringify(body), headers: { origin: config.origin, cookie, "content-type": "application/json" } });
const get = (qs = "", headers: Record<string, string> = { cookie }) => new Request(`${base}${qs}`, { headers });

describe("recomendaciones por BFF (ERD-SAVE-01)", () => {
  it("lista con bearer, valida el contrato y no filtra campos desconocidos", async () => {
    const upstream = vi.fn().mockResolvedValue(json(list()));
    const response = await handleBff(get(), config, upstream);
    expect(response.status).toBe(200);
    expect((await response.json()).items[0].rule_id).toBe("ac-one-hour");
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe(`http://127.0.0.1:8000/api/v1/homes/${HOME}/recommendations`);
    expect(init.headers.Authorization).toBe("Bearer access-token");
  });

  it("solo deja pasar los filtros permitidos con valores válidos", async () => {
    expect((await handleBff(get("?status=all&limit=10"), config, vi.fn().mockResolvedValue(json(list())))).status).toBe(200);
    for (const qs of ["?status=todo", "?limit=0", "?limit=101", "?x=1", "?status=all&status=active"]) {
      const refused = vi.fn();
      expect((await handleBff(get(qs), config, refused)).status, qs).toBe(400);
      expect(refused).not.toHaveBeenCalled();
    }
  });

  it("rechaza respuestas de otra vivienda o con forma inválida", async () => {
    for (const body of [list({ home_id: OTHER }), list({ items: [row({ category: "raro" })] }), list({ items: [{ ...row(), id: undefined, extra_secret: "x" }] })]) {
      const response = await handleBff(get(), config, vi.fn().mockResolvedValue(json(body)));
      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(JSON.stringify(await response.json())).not.toContain("extra_secret");
    }
  });

  it("recalcula con POST de cuerpo vacío y nada más", async () => {
    const upstream = vi.fn().mockResolvedValue(json(list()));
    expect((await handleBff(write(`${base}/refresh`, "POST", {}), config, upstream)).status).toBe(200);
    expect(upstream.mock.calls[0][1].method).toBe("POST");
    const refused = vi.fn();
    expect((await handleBff(write(`${base}/refresh`, "POST", { force: true }), config, refused)).status).toBe(422);
    expect(refused).not.toHaveBeenCalled();
  });

  it("cambia el estado con PATCH y exige que la respuesta sea esa recomendación", async () => {
    const ok = vi.fn().mockResolvedValue(json(row({ status: "applied" })));
    const response = await handleBff(write(`${base}/${ID}`, "PATCH", { status: "applied" }), config, ok);
    expect(response.status).toBe(200);
    expect(JSON.parse(ok.mock.calls[0][1].body)).toEqual({ status: "applied" });
    const wrong = await handleBff(write(`${base}/${ID}`, "PATCH", { status: "applied" }), config, vi.fn().mockResolvedValue(json(row({ id: OTHER }))));
    expect(wrong.status).toBeGreaterThanOrEqual(500);
  });

  it.each([
    ["estado no permitido (resolved)", { status: "resolved" }],
    ["campo de más", { status: "applied", title: "hack" }],
    ["sin estado", {}],
  ])("PATCH con %s no llega a la API", async (_n, body) => {
    const upstream = vi.fn();
    expect((await handleBff(write(`${base}/${ID}`, "PATCH", body), config, upstream)).status).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("no hay más rutas: ni borrado, ni creación, ni ids inválidos", async () => {
    const upstream = vi.fn();
    for (const request of [write(`${base}/${ID}`, "DELETE", {}), write(base, "POST", { title: "x" }), write(`${base}/no-es-uuid`, "PATCH", { status: "applied" })]) {
      expect((await handleBff(request, config, upstream)).status).toBe(404);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("sin sesión no consulta la API; el error del servidor se traduce a un mensaje local", async () => {
    const none = vi.fn();
    expect((await handleBff(get("", {}), config, none)).status).toBe(401);
    expect(none).not.toHaveBeenCalled();
    const response = await handleBff(write(`${base}/${ID}`, "PATCH", { status: "applied" }), config, vi.fn().mockResolvedValue(json({ detail: "TEXTO-INTERNO", code: "conflict" }, 409)));
    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).not.toContain("TEXTO-INTERNO");
  });
});
