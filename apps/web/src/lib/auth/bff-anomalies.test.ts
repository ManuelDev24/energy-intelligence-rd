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
  id: ID, home_id: HOME, bill_id: null, kind: "peak", source: "readings", granularity: "day", severity: "warning", confidence: "medium",
  status: "open", observed_kwh: "25.00", baseline_kwh: "10.00", delta_pct: "150.00", days: "1.00", period_start: "2026-10-04",
  period_end: "2026-10-04", explanation: "x", detected_at: "2026-10-05T12:00:00Z", last_seen_at: "2026-10-05T12:00:00Z", ...over,
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const get = (qs = "", headers: Record<string, string> = { cookie }) => new Request(`http://localhost:3000/api/bff/homes/${HOME}/anomalies${qs}`, { headers });
const patch = (body: unknown, id = ID) => new Request(`http://localhost:3000/api/bff/homes/${HOME}/anomalies/${id}`, {
  method: "PATCH", body: JSON.stringify(body), headers: { origin: config.origin, cookie, "content-type": "application/json" } });

describe("anomalías por BFF (ERD-ANOM-01-COMPLETE)", () => {
  it("lista las vigentes con bearer y valida el contrato", async () => {
    const upstream = vi.fn().mockResolvedValue(json([row(), row({ id: OTHER, kind: "night", delta_pct: null, severity: "info" })]));
    const response = await handleBff(get(), config, upstream);
    expect(response.status).toBe(200);
    expect((await response.json()).map((r: { kind: string }) => r.kind)).toEqual(["peak", "night"]);
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe(`http://127.0.0.1:8000/api/v1/homes/${HOME}/anomalies`);
    expect(init.headers.Authorization).toBe("Bearer access-token");
  });

  it("deja pasar solo los filtros permitidos y con valores válidos", async () => {
    const ok = vi.fn().mockResolvedValue(json([]));
    expect((await handleBff(get("?status=all&kind=peak&granularity=day&limit=10"), config, ok)).status).toBe(200);
    for (const qs of ["?status=todo", "?kind=x", "?granularity=week", "?limit=0", "?limit=101", "?limit=abc", "?x=1", "?status=all&status=open"]) {
      const refused = vi.fn();
      expect((await handleBff(get(qs), config, refused)).status, qs).toBe(400);
      expect(refused).not.toHaveBeenCalled();
    }
  });

  it("rechaza filas de otra vivienda o con forma inválida (no llegan al navegador)", async () => {
    for (const body of [[row({ home_id: OTHER })], [row({ kind: "raro" })], [{ ...row(), extra_secret: "x", id: undefined }]]) {
      const response = await handleBff(get(), config, vi.fn().mockResolvedValue(json(body)));
      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(JSON.stringify(await response.json())).not.toContain("extra_secret");
    }
  });

  it("cambia el estado con PATCH y exige que la respuesta sea esa anomalía", async () => {
    const upstream = vi.fn().mockResolvedValue(json(row({ status: "dismissed" })));
    const response = await handleBff(patch({ status: "dismissed" }), config, upstream);
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("dismissed");
    expect(upstream.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(upstream.mock.calls[0][1].body)).toEqual({ status: "dismissed" });
    const wrong = await handleBff(patch({ status: "open" }), config, vi.fn().mockResolvedValue(json(row({ id: OTHER }))));
    expect(wrong.status).toBeGreaterThanOrEqual(500);
  });

  it.each([
    ["estado no permitido", { status: "resolved" }],
    ["campo de más", { status: "open", severity: "info" }],
    ["sin cuerpo útil", {}],
  ])("PATCH con %s no llega a la API", async (_n, body) => {
    const upstream = vi.fn();
    expect((await handleBff(patch(body), config, upstream)).status).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("no hay más rutas de anomalías: ni escaneo, ni borrado, ni ids inválidos", async () => {
    const upstream = vi.fn();
    const scan = new Request(`http://localhost:3000/api/bff/homes/${HOME}/anomalies/scan`, { method: "POST", body: "{}", headers: { origin: config.origin, cookie, "content-type": "application/json" } });
    const del = new Request(`http://localhost:3000/api/bff/homes/${HOME}/anomalies/${ID}`, { method: "DELETE", body: "{}", headers: { origin: config.origin, cookie, "content-type": "application/json" } });
    for (const request of [scan, del, patch({ status: "open" }, "no-es-uuid")]) expect((await handleBff(request, config, upstream)).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("sin sesión no consulta la API", async () => {
    const upstream = vi.fn();
    expect((await handleBff(get("", {}), config, upstream)).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("el error del servidor se traduce a un mensaje local", async () => {
    const response = await handleBff(patch({ status: "open" }), config, vi.fn().mockResolvedValue(json({ detail: "TEXTO-INTERNO", code: "conflict" }, 409)));
    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).not.toContain("TEXTO-INTERNO");
  });
});
