// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleBff } from "./bff";

// Fase 2 (ERD-CONS-01 / ERD-GOAL-01): lecturas, consumo, meta, progreso y tarifas pasan por la
// misma frontera estricta del BFF: método + patrón de ruta + consulta + cuerpo validados antes
// de contactar la API, y nunca texto libre de la API en los errores.
const config = { enabled: true, apiBase: "http://127.0.0.1:8000", origin: "http://localhost:3000", secure: false };
const EPOCH = "0123456789abcdef0123456789abcdef";
const session = `erd-epoch=${EPOCH}; erd-access=${EPOCH}~access-token`;
const HOME = "11111111-1111-4111-8111-111111111111";
const READING = "33333333-3333-4333-8333-333333333333";
const TARIFF = "44444444-4444-4444-8444-444444444444";
const req = (path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost:3000/api/bff/${path}`, {
    method,
    headers: { origin: config.origin, "content-type": "application/json", cookie: session, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

const reading = { id: READING, home_id: HOME, read_at: "2026-10-01T12:00:00Z", reading_kwh: "1200.00", source: "manual", note: null, created_at: "2026-10-01T12:00:00Z" };
const bucket = { start: "2026-10-01", end: "2026-10-01", kwh: null, quality: null, coverage_ratio: "0.0000", reason_code: "no_coverage", reason: "Sin lecturas que cubran el período." };
const consumption = {
  home_id: HOME, granularity: "day", from_date: "2026-10-01", to_date: "2026-10-01", timezone: "America/Santo_Domingo",
  buckets: [bucket], totals: { kwh: null, covered_days: "0", coverage_ratio: "0" }, average_daily_kwh: null, peak_bucket: null,
  readings_used: 0, resolution: "meter_readings", hourly_data_available: false, insufficient_reasons: ["Sin lecturas."], quality_legend: {},
};
const goal = { home_id: HOME, monthly_amount_rd: "3000.00", monthly_kwh: null, updated_at: "2026-10-04T12:00:00Z" };
const progress = {
  home_id: HOME, month_start: "2026-10-01", month_end: "2026-10-31", as_of: "2026-10-04", timezone: "America/Santo_Domingo",
  goal: null, status: "insufficient_data", data_source: "none", kwh: null, amount: null, reasons: ["No hay meta."], quality_legend: {},
};
const tariff = {
  id: TARIFF, distributor: "EDESUR", tariff_code: "BTS-1", effective_from: "2026-10-01", effective_to: "2026-12-31",
  flat_all_units_from_kwh: "701.00", fixed_charges: [], blocks: [], source_resolution: "SIE-121-2026-TF", source_url: null, scope_note: null,
};

describe("BFF fase 2: rutas permitidas", () => {
  it.each([
    ["lista de lecturas", `homes/${HOME}/readings?limit=100&offset=0`, "GET", undefined, json([reading]), 200],
    ["crear lectura", `homes/${HOME}/readings`, "POST", { read_at: "2026-10-01T08:00:00-04:00", reading_kwh: "1200.5", note: "Mañana" }, json(reading, 201), 201],
    ["borrar lectura", `homes/${HOME}/readings/${READING}`, "DELETE", undefined, new Response(null, { status: 204 }), 204],
    ["consumo", `homes/${HOME}/consumption?granularity=day&from=2026-10-01&to=2026-10-01`, "GET", undefined, json(consumption), 200],
    ["meta (vacía)", `homes/${HOME}/goal`, "GET", undefined, json(null), 200],
    ["guardar meta", `homes/${HOME}/goal`, "PUT", { monthly_amount_rd: "3000", monthly_kwh: null }, json(goal), 200],
    ["progreso de la meta", `homes/${HOME}/goal/progress?on=2026-10-04`, "GET", undefined, json(progress), 200],
    ["progreso sin fecha", `homes/${HOME}/goal/progress`, "GET", undefined, json(progress), 200],
    ["tarifas", "tariffs?distributor=EDESUR&on=2026-10-04&limit=100&offset=0", "GET", undefined, json([tariff]), 200],
  ] as const)("%s: llega a la API con el bearer de la cookie", async (_label, path, method, body, upstreamResponse, status) => {
    const upstream = vi.fn().mockResolvedValue(upstreamResponse);
    const response = await handleBff(req(path, method, body), config, upstream);
    expect(response.status).toBe(status);
    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe(`${config.apiBase}/api/v1/${path}`);
    expect(init.method).toBe(method);
    expect(init.headers.Authorization).toBe("Bearer access-token");
    expect(init.redirect).toBe("manual");
    if (method === "DELETE") expect(init.body).toBeUndefined();
    if (method === "GET" && path.endsWith("/goal")) expect(await response.json()).toBeNull();
  });

  it("valida la respuesta contra el contrato: una lectura sin cumplirlo no pasa", async () => {
    const upstream = vi.fn().mockResolvedValue(json([{ ...reading, reading_kwh: "abc" }]));
    expect((await handleBff(req(`homes/${HOME}/readings`), config, upstream)).status).toBe(502);
  });
});

describe("BFF fase 2: variantes no listadas siguen rechazadas", () => {
  it.each([
    ["PUT a lecturas", `homes/${HOME}/readings`, "PUT", {}],
    ["PATCH a una lectura", `homes/${HOME}/readings/${READING}`, "PATCH", {}],
    ["GET de una lectura (no existe en la API)", `homes/${HOME}/readings/${READING}`, "GET", undefined],
    ["id de lectura no UUID", `homes/${HOME}/readings/not-a-uuid`, "DELETE", undefined],
    ["subruta de lectura", `homes/${HOME}/readings/${READING}/extra`, "DELETE", undefined],
    ["POST a consumo", `homes/${HOME}/consumption?granularity=day&from=2026-10-01&to=2026-10-02`, "POST", {}],
    ["DELETE de la meta (no existe)", `homes/${HOME}/goal`, "DELETE", undefined],
    ["POST a la meta", `homes/${HOME}/goal`, "POST", { monthly_kwh: "300" }],
    ["PUT al progreso", `homes/${HOME}/goal/progress`, "PUT", {}],
    ["POST a tarifas", "tariffs", "POST", {}],
    ["una tarifa por id", `tariffs/${TARIFF}`, "GET", undefined],
    ["vivienda no UUID", "homes/abc/readings", "GET", undefined],
  ] as const)("%s → 404/405 sin contactar la API", async (_label, path, method, body) => {
    const upstream = vi.fn();
    const response = await handleBff(req(path, method, body), config, upstream);
    expect([404, 405]).toContain(response.status);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    ["consumo sin granularidad", `homes/${HOME}/consumption?from=2026-10-01&to=2026-10-02`],
    ["consumo con granularidad desconocida", `homes/${HOME}/consumption?granularity=hour&from=2026-10-01&to=2026-10-02`],
    ["consumo con fecha mal formada", `homes/${HOME}/consumption?granularity=day&from=2026/10/01&to=2026-10-02`],
    ["consumo con fecha imposible", `homes/${HOME}/consumption?granularity=day&from=2026-02-30&to=2026-10-02`],
    ["consumo con parámetro repetido", `homes/${HOME}/consumption?granularity=day&granularity=week&from=2026-10-01&to=2026-10-02`],
    ["consumo con parámetro extra", `homes/${HOME}/consumption?granularity=day&from=2026-10-01&to=2026-10-02&url=http://evil.test`],
    ["consumo con paginación", `homes/${HOME}/consumption?granularity=day&from=2026-10-01&to=2026-10-02&limit=5`],
    ["progreso con fecha inválida", `homes/${HOME}/goal/progress?on=mañana`],
    ["progreso con parámetro extra", `homes/${HOME}/goal/progress?on=2026-10-04&home=x`],
    ["meta con consulta", `homes/${HOME}/goal?limit=1`],
    ["lecturas con include_dismissed", `homes/${HOME}/readings?include_dismissed=true`],
    ["lecturas con limit no numérico", `homes/${HOME}/readings?limit=all`],
    ["tarifas de distribuidora desconocida", "tariffs?distributor=Otra"],
    ["tarifas con parámetro extra", "tariffs?code=BTS-1"],
  ])("%s → 400 sin contactar la API", async (_label, path) => {
    const upstream = vi.fn();
    const response = await handleBff(req(path), config, upstream);
    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    ["campo desconocido en lectura", { read_at: "2026-10-01T08:00:00-04:00", reading_kwh: "10", home_id: HOME }],
    ["lectura sin zona horaria", { read_at: "2026-10-01T08:00:00", reading_kwh: "10" }],
    ["lectura negativa", { read_at: "2026-10-01T08:00:00-04:00", reading_kwh: "-1" }],
    ["lectura con 3 decimales", { read_at: "2026-10-01T08:00:00-04:00", reading_kwh: "1.234" }],
    ["lectura numérica (no texto decimal)", { read_at: "2026-10-01T08:00:00-04:00", reading_kwh: 10 }],
    ["nota demasiado larga", { read_at: "2026-10-01T08:00:00-04:00", reading_kwh: "10", note: "x".repeat(256) }],
    ["origen inventado", { read_at: "2026-10-01T08:00:00-04:00", reading_kwh: "10", source: "seed" }],
  ])("POST lectura con %s → 422 local sin contactar la API", async (_label, body) => {
    const upstream = vi.fn();
    const response = await handleBff(req(`homes/${HOME}/readings`, "POST", body), config, upstream);
    expect(response.status).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    ["meta vacía", {}],
    ["ambas metas nulas", { monthly_amount_rd: null, monthly_kwh: null }],
    ["meta en cero", { monthly_kwh: "0" }],
    ["meta negativa", { monthly_amount_rd: "-5" }],
    ["campo desconocido", { monthly_kwh: "300", home_id: HOME }],
  ])("PUT meta con %s → 422 local sin contactar la API", async (_label, body) => {
    const upstream = vi.fn();
    const response = await handleBff(req(`homes/${HOME}/goal`, "PUT", body), config, upstream);
    expect(response.status).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("DELETE de lectura con cuerpo → 422", async () => {
    const upstream = vi.fn();
    expect((await handleBff(req(`homes/${HOME}/readings/${READING}`, "DELETE", { reading_kwh: "1" }), config, upstream)).status).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("escrituras de fase 2 exigen el mismo origen", async () => {
    const upstream = vi.fn();
    const response = await handleBff(req(`homes/${HOME}/goal`, "PUT", { monthly_kwh: "300" }, { origin: "https://evil.test" }), config, upstream);
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("sin sesión: 401 sin contactar la API (también tarifas)", async () => {
    const upstream = vi.fn();
    for (const path of ["tariffs", `homes/${HOME}/goal/progress`]) {
      expect((await handleBff(req(path, "GET", undefined, { cookie: "" }), config, upstream)).status).toBe(401);
    }
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("BFF fase 2: errores en español local, nunca texto de la API", () => {
  const leak = "psycopg2 La lectura (900) es menor que la anterior <script>";
  it.each([
    ["lectura duplicada", `homes/${HOME}/readings`, "POST", { read_at: "2026-10-01T08:00:00-04:00", reading_kwh: "900" }, 409, { detail: leak, code: "conflict" }, "Ya existe una lectura con esa fecha y hora."],
    ["lectura no monótona", `homes/${HOME}/readings`, "POST", { read_at: "2026-10-01T08:00:00-04:00", reading_kwh: "900" }, 422, { detail: leak, code: "invalid_input" }, "La lectura debe ser mayor o igual que la anterior y menor o igual que la siguiente."],
    ["rango > 366 días", `homes/${HOME}/consumption?granularity=day&from=2025-01-01&to=2026-10-04`, "GET", undefined, 422, { detail: leak, code: "invalid_input" }, "Rango de fechas inválido: máximo 366 días."],
    ["lectura ya borrada", `homes/${HOME}/readings/${READING}`, "DELETE", undefined, 404, { detail: leak, code: "not_found" }, "No encontrado o sin acceso."],
  ] as const)("%s → mensaje local", async (_label, path, method, body, status, upstreamBody, expected) => {
    const upstream = vi.fn().mockResolvedValue(json(upstreamBody, status));
    const response = await handleBff(req(path, method, body), config, upstream);
    const text = await response.text();
    expect(response.status).toBe(status);
    expect(text).not.toContain("psycopg2");
    expect(text).not.toContain("<script>");
    expect(JSON.parse(text).detail).toBe(expected);
  });

  it("422 de campos de lectura/meta usa la tabla local de campos", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ detail: [{ loc: ["body", "read_at"], msg: leak }, { loc: ["body", "monthly_kwh"], msg: leak }], code: "validation_error" }, 422));
    const response = await handleBff(req(`homes/${HOME}/readings`, "POST", { read_at: "2026-10-01T08:00:00-04:00", reading_kwh: "10" }), config, upstream);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("psycopg2");
    expect(body.detail).toEqual([
      { loc: ["body", "read_at"], msg: "Revisa la fecha y hora de la lectura (no puede ser futura)." },
      { loc: ["body", "monthly_kwh"], msg: "Introduce una meta en kWh mayor que 0, con hasta 2 decimales." },
    ]);
  });
});
