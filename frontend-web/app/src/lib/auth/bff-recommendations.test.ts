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
  id: ID, home_id: HOME, equipment_id: null, anomaly_id: null, rule_id: "ac-one-hour", rule_version: 1, ruleset_version: 1, difficulty: "easy", impact: "high", category: "equipment",
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

  it("meta sugerida: GET sin parámetros y POST de aplicar con cuerpo vacío; nada más", async () => {
    const proposal = { home_id: HOME, proposal: { value: "265", unit: "kWh/mes", quality: "ESTIMATED" }, baseline: { value: "310.00", unit: "kWh/mes", quality: "REAL" },
      potential_savings: null, bills_used: 2, current_goal_kwh: null, reason: null, assumptions: [] };
    const upstream = vi.fn().mockResolvedValueOnce(json(proposal)).mockResolvedValueOnce(json({ home_id: HOME, monthly_kwh: "265.00", monthly_amount_rd: null, created_at: "2026-10-14T10:00:00Z", updated_at: "2026-10-14T10:00:00Z" }));
    expect((await handleBff(get("/goal-proposal"), config, upstream)).status).toBe(200);
    expect((await handleBff(write(`${base}/goal-proposal/apply`, "POST", {}), config, upstream)).status).toBe(200);
    expect(upstream.mock.calls.map(([u, init]) => [u, init.method])).toEqual([
      [`http://127.0.0.1:8000/api/v1/homes/${HOME}/recommendations/goal-proposal`, "GET"],
      [`http://127.0.0.1:8000/api/v1/homes/${HOME}/recommendations/goal-proposal/apply`, "POST"],
    ]);
    const refused = vi.fn();
    expect((await handleBff(get("/goal-proposal?x=1"), config, refused)).status).toBe(400);
    expect((await handleBff(write(`${base}/goal-proposal/apply`, "POST", { monthly_kwh: "1" }), config, refused)).status).toBe(422);
    expect((await handleBff(write(`${base}/goal-proposal`, "POST", {}), config, refused)).status).toBe(404);
    expect(refused).not.toHaveBeenCalled();
  });

  it("informe energético: solo lectura con fechas válidas; nada más pasa", async () => {
    const report = { home_id: HOME, home: { id: HOME, name: "Casa", distributor: "EDESUR", province: null, municipality: null }, period: { period_from: "2026-05-01", period_to: "2026-06-30", days: 61 },
      generated_at: "2026-10-14T12:00:00Z", bills: [], totals: { bills_count: 0, kwh: null, amount_dop: null, avg_price_per_kwh: null, avg_kwh_per_bill: null }, peak_bill: null,
      comparison: null, equipment: [], recommendations: [], goal: null, sources: [], notes: [] };
    const upstream = vi.fn().mockResolvedValue(json(report));
    const url = `http://localhost:3000/api/bff/homes/${HOME}/reports/energy`;
    expect((await handleBff(new Request(`${url}?from=2026-05-01&to=2026-06-30`, { headers: { cookie } }), config, upstream)).status).toBe(200);
    expect(upstream.mock.calls[0][0]).toBe(`http://127.0.0.1:8000/api/v1/homes/${HOME}/reports/energy?from=2026-05-01&to=2026-06-30`);
    const refused = vi.fn();
    for (const qs of ["?from=ayer", "?x=1", "?from=2026-05-01&from=2026-05-02"]) expect((await handleBff(new Request(`${url}${qs}`, { headers: { cookie } }), config, refused)).status, qs).toBe(400);
    expect((await handleBff(write(url, "POST", {}), config, refused)).status).toBe(404);
    expect((await handleBff(new Request(`${url}/pdf`, { headers: { cookie } }), config, refused)).status).toBe(404);
    expect(refused).not.toHaveBeenCalled();
  });

  it("ayuda: GET de índice con búsqueda y categoría acotadas y de artículos por id; nada más", async () => {
    const index = { content_version: "v", categories: [{ id: "cuenta", label: "Cuenta" }], articles: [], contact: { email: null, note: "n" }, query: null };
    const article = { id: "real-estimado", category: "datos", title: "t", summary: "s", body: ["b"], tags: [] };
    const upstream = vi.fn().mockResolvedValueOnce(json(index)).mockResolvedValueOnce(json(article));
    const url = "http://localhost:3000/api/bff/help";
    expect((await handleBff(new Request(`${url}?q=contrase%C3%B1a&category=cuenta`, { headers: { cookie } }), config, upstream)).status).toBe(200);
    expect((await handleBff(new Request(`${url}/articles/real-estimado`, { headers: { cookie } }), config, upstream)).status).toBe(200);
    expect(upstream.mock.calls[0][0]).toContain("/api/v1/help?q=contrase%C3%B1a&category=cuenta");
    const refused = vi.fn();
    for (const bad of [`${url}?q=${"x".repeat(81)}`, `${url}?category=../x`, `${url}?x=1`, `${url}/articles/A_B`, `${url}/otra`]) {
      expect([400, 404], bad).toContain((await handleBff(new Request(bad, { headers: { cookie } }), config, refused)).status);
    }
    expect((await handleBff(write(url, "POST", {}), config, refused)).status).toBe(404);
    expect(refused).not.toHaveBeenCalled();
  });

  it("reclamaciones: cuerpos estrictos, estado cerrado y vivienda/caso verificados en la respuesta", async () => {
    const CLAIM = "cccccccc-0000-4000-8000-0000000000c1";
    const claim = { id: CLAIM, home_id: HOME, bill_id: null, kind: "other", status: "open", subject: "Voltaje bajo", description: "Hay variaciones de voltaje.", disputed_amount_dop: null, reference_number: null,
      created_at: "2026-10-14T10:00:00Z", updated_at: "2026-10-14T10:00:00Z", closed_at: null, disclaimer: "d", evidence: null, events: [] };
    const url = `http://localhost:3000/api/bff/homes/${HOME}/claims`;
    const upstream = vi.fn().mockResolvedValueOnce(json([{ ...claim, evidence: undefined, events: undefined }])).mockResolvedValueOnce(json(claim, 201)).mockResolvedValueOnce(json(claim)).mockResolvedValueOnce(json(claim, 201));
    expect((await handleBff(new Request(`${url}?status=open`, { headers: { cookie } }), config, upstream)).status).toBe(200);
    expect((await handleBff(write(url, "POST", { kind: "other", subject: "Voltaje bajo", description: "Hay variaciones de voltaje." }), config, upstream)).status).toBe(201);
    expect((await handleBff(new Request(`${url}/${CLAIM}`, { headers: { cookie } }), config, upstream)).status).toBe(200);
    expect((await handleBff(write(`${url}/${CLAIM}/notes`, "POST", { note: "Llamé hoy" }), config, upstream)).status).toBe(201);
    const closeUp = vi.fn().mockResolvedValue(json({ ...claim, status: "closed" }));
    expect((await handleBff(write(`${url}/${CLAIM}/close`, "POST", {}), config, closeUp)).status).toBe(200);          // lo que envían web y móvil sin nota
    expect(JSON.parse(closeUp.mock.calls[0][1].body)).toEqual({ note: null });
    const refused = vi.fn();
    expect((await handleBff(write(`${url}/${CLAIM}/close`, "POST", { status: "resolved" }), config, refused)).status).toBe(422);
    expect((await handleBff(new Request(`${url}?status=x`, { headers: { cookie } }), config, refused)).status).toBe(400);
    expect((await handleBff(write(url, "POST", { kind: "other", subject: "Voltaje bajo", description: "Hay variaciones de voltaje.", status: "resolved" }), config, refused)).status).toBe(422);
    expect((await handleBff(write(`${url}/${CLAIM}`, "DELETE", {}), config, refused)).status).toBe(404);
    expect((await handleBff(write(`${url}/${CLAIM}/status`, "POST", {}), config, refused)).status).toBe(404);
    expect(refused).not.toHaveBeenCalled();
    const foreign = vi.fn().mockResolvedValue(json({ ...claim, home_id: "55555555-5555-4555-8555-555555555555" }));
    expect((await handleBff(new Request(`${url}/${CLAIM}`, { headers: { cookie } }), config, foreign)).status).toBe(502);
  });

  it("PDF del informe: reenvía solo un PDF real y pequeño con cabeceras fijas; el enlace firmado es POST sin cuerpo", async () => {
    const pdf = (bytes: Uint8Array, headers: Record<string, string> = {}) => new Response(bytes as BodyInit, { status: 200, headers: { "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="informe-energetico-2026-05-01-2026-06-30.pdf"', ...headers } });
    const good = new TextEncoder().encode("%PDF-1.4 contenido");
    const url = `http://localhost:3000/api/bff/homes/${HOME}/reports/energy.pdf?from=2026-05-01&to=2026-06-30`;
    const ok = await handleBff(new Request(url, { headers: { cookie } }), config, vi.fn().mockResolvedValue(pdf(good)));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("application/pdf");
    expect(ok.headers.get("content-disposition")).toBe('attachment; filename="informe-energetico-2026-05-01-2026-06-30.pdf"');
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new TextDecoder().decode(await ok.arrayBuffer())).toBe("%PDF-1.4 contenido");
    for (const bad of [pdf(new TextEncoder().encode("<html>no pdf</html>")), pdf(good, { "content-type": "text/html" }), pdf(new Uint8Array(2_000_001).fill(37))]) {
      expect((await handleBff(new Request(url, { headers: { cookie } }), config, vi.fn().mockResolvedValue(bad))).status).toBe(502);
    }
    const refused = vi.fn();
    expect((await handleBff(new Request(`${url}&x=1`, { headers: { cookie } }), config, refused)).status).toBe(400);
    expect((await handleBff(new Request(url.replace("from=2026-05-01", "from=ayer"), { headers: { cookie } }), config, refused)).status).toBe(400);
    const link = vi.fn().mockResolvedValue(json({ url: "/api/v1/reports/download?token=rpt1.a.b", expires_at: "2026-10-15T10:00:00Z" }));
    expect((await handleBff(write(`http://localhost:3000/api/bff/homes/${HOME}/reports/energy/pdf-link?from=2026-05-01&to=2026-06-30`, "POST", {}), config, link)).status).toBe(200);
    expect((await handleBff(write(`http://localhost:3000/api/bff/homes/${HOME}/reports/energy/pdf-link`, "POST", { x: 1 }), config, refused)).status).toBe(422);
    expect(refused).not.toHaveBeenCalled();
  });
});
