// API SIMULADA para la revisión de calidad web (ERD-WEB-QUALITY). NO es la API real.
//
// Implementa los endpoints que usa el recorrido vivienda → factura → dashboard → proyección/alerta y
// valida CADA respuesta contra los esquemas Zod generados del contrato (packages/api-contracts), así que
// la forma de los datos coincide con la de la API real. Los cálculos del dashboard (promedios,
// variación, proyección lineal, severidad) los hace ESTE servidor, como lo haría el backend; la web
// solo muestra lo que recibe.
//
// Uso (desde la raíz del repo, con dependencias instaladas, Node 24):
//   node docs/qa/evidence/web-quality-2026-10-07/simulated-api.mjs          # puerto 8000
//   PORT=8001 node docs/qa/evidence/web-quality-2026-10-07/simulated-api.mjs
// Controles para probar estados (GET, desde el navegador o curl):
//   /__sim?delay=3000        latencia en ms para todas las respuestas
//   /__sim?fail=500          responde HTTP 500 a las rutas /api/v1 (fail=0 lo quita)
//   /__sim?reset=1           restaura datos y controles
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {
  AlertRecordSchema,
  AnomalyRecordSchema,
  BillAssessmentSchema,
  BillItemsOutSchema,
  BillOutSchema,
  DashboardOutSchema,
  HomeOutSchema,
} from "../../../../packages/api-contracts/src/generated.ts";

const PORT = Number(process.env.PORT ?? 8000);
const ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(",");
const NOW = "2026-10-07T12:00:00.000Z";

const H1 = "11111111-1111-4111-8111-111111111111";
const H2 = "22222222-2222-4222-8222-222222222222";
const H3 = "33333333-3333-4333-8333-333333333333";

const money = (n) => (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);

function freshState() {
  const mkHome = (id, code, name, city, distributor) => ({
    id, code, name, address: null, city, distributor, created_at: NOW,
    province: null, municipality: null, sector: null, user_type: null, occupants: null,
    has_ac: null, has_water_heater: null, has_pool: null, has_solar: null, has_inverter: null,
  });
  const mkBill = (home_id, start, end, days, kwh, amount, source = "seed") => ({
    id: randomUUID(), home_id, period_start: start, period_end: end, kwh, amount_dop: amount, days,
    reading_previous: null, reading_current: null, source, created_at: NOW,
  });
  return {
    homes: [
      mkHome(H1, "SIM-01", "Vivienda simulada 01 (demo)", "Santo Domingo", "EDESUR"),
      mkHome(H2, "SIM-02", "Vivienda simulada 02 (demo)", "San Pedro de Macorís", "EDEESTE"),
      mkHome(H3, "SIM-03", "Vivienda simulada 03 sin facturas", "La Vega", "Otra"),
    ],
    bills: [
      mkBill(H1, "2026-06-01", "2026-06-30", 30, "250.00", "3150.00"),
      mkBill(H1, "2026-07-01", "2026-07-31", 31, "280.00", "3560.00"),
      mkBill(H1, "2026-08-01", "2026-08-31", 31, "420.00", "5600.00"),
      mkBill(H2, "2026-07-01", "2026-07-31", 31, "180.00", "2300.00"),
      mkBill(H2, "2026-08-01", "2026-08-31", 31, "225.00", "2900.00"),
    ],
    items: {}, // bill_id -> [{label, kind, amount_dop}]
    alertStatus: {}, // `${home}:${bill}` -> status
  };
}
let state = freshState();
const sim = { delay: 0, fail: 0 };

// ---------- "backend": cálculos del dashboard (la web NO calcula nada de esto) ----------
const metric = (value, unit, quality) => ({ value: typeof value === "number" ? money(value) : value, unit, quality });
const LEGEND = {
  REAL: "Dato tomado directamente de una factura mensual introducida.",
  ESTIMATED: "Valor derivado de totales mensuales (promedios); no es una medición directa.",
  PROJECTED: "Proyección lineal a partir del historial de facturas; no es un dato observado.",
};
const homeBills = (home) =>
  state.bills.filter((b) => b.home_id === home).sort((a, b) => a.period_end.localeCompare(b.period_end));

function projection(bills) {
  const w = bills.slice(-6);
  if (w.length < 2) return null;
  const n = w.length;
  const fit = (ys) => {
    const mx = (n - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    ys.forEach((y, x) => { num += (x - mx) * (y - my); den += (x - mx) ** 2; });
    const slope = num / den;
    return Math.max(0, my + slope * (n - mx));
  };
  return {
    method: "linear_least_squares", bills_used: n,
    kwh: metric(fit(w.map((b) => Number(b.kwh))), "kWh", "PROJECTED"),
    amount_dop: metric(fit(w.map((b) => Number(b.amount_dop))), "RD$", "PROJECTED"),
    note: "Proyección de la próxima factura mensual por tendencia lineal; no incluye cambios de tarifa.",
  };
}

function dashboard(home) {
  const h = state.homes.find((x) => x.id === home);
  const bills = homeBills(home);
  const sources = new Set(bills.map((b) => b.source));
  const head = { id: h.id, code: h.code, name: h.name, distributor: h.distributor };
  const status = (reasons) => ({
    bills_count: bills.length,
    data_source: !bills.length ? "none" : sources.size === 1 ? [...sources][0] : "mixed",
    is_demo: sources.has("seed"), resolution: "monthly", hourly_data_available: false,
    insufficient_reasons: reasons,
  });
  if (!bills.length) {
    return { home: head, latest_bill: null, comparison: null, projection: null, alert: null, recommendation: null,
      data_status: status(["No hay facturas registradas: registre al menos una para ver consumo."]), quality_legend: LEGEND };
  }
  const latest = bills.at(-1), reasons = [];
  const kwh = Number(latest.kwh), amount = Number(latest.amount_dop);
  const latest_bill = {
    bill_id: latest.id, period_start: latest.period_start, period_end: latest.period_end, days: latest.days,
    kwh: metric(latest.kwh, "kWh", "REAL"), amount_dop: metric(latest.amount_dop, "RD$", "REAL"),
    avg_daily_kwh: latest.days > 0 ? metric(kwh / latest.days, "kWh/día", "ESTIMATED") : null,
    avg_price_per_kwh: kwh > 0 ? metric(amount / kwh, "RD$/kWh", "ESTIMATED") : null,
    source: latest.source,
  };
  let comparison = null, alert = null, recommendation = null;
  if (bills.length >= 2) {
    const prev = bills.at(-2), pk = Number(prev.kwh), pa = Number(prev.amount_dop);
    const kwhPct = pk > 0 ? ((kwh - pk) / pk) * 100 : null;
    comparison = {
      previous_bill_id: prev.id, previous_period_start: prev.period_start, previous_period_end: prev.period_end,
      kwh_delta: metric(kwh - pk, "kWh", "REAL"), kwh_pct: kwhPct === null ? null : metric(kwhPct, "%", "REAL"),
      amount_delta: metric(amount - pa, "RD$", "REAL"), amount_pct: pa > 0 ? metric(((amount - pa) / pa) * 100, "%", "REAL") : null,
    };
    if (kwhPct === null) reasons.push("El período anterior tiene 0 kWh: no se calcula variación porcentual.");
    const severity = kwhPct === null ? null : kwhPct >= 40 ? "critical" : kwhPct >= 20 ? "warning" : null;
    if (severity) {
      alert = { severity, message: `El consumo subió ${money(kwhPct)}% frente al período anterior (${prev.kwh} kWh → ${latest.kwh} kWh).`,
        basis_period_start: prev.period_start, basis_period_end: prev.period_end };
      recommendation = "Revise equipos de mayor uso (aire acondicionado, nevera, calentador) y compare con su rutina del mes anterior. Una factura mensual no permite identificar picos.";
    }
  } else reasons.push("Se necesitan al menos 2 facturas para comparar períodos.");
  const proj = projection(bills);
  if (!proj) reasons.push("Se necesitan al menos 2 facturas para proyectar la próxima.");
  return { home: head, latest_bill, comparison, projection: proj, alert, recommendation, data_status: status(reasons), quality_legend: LEGEND };
}

function alerts(home) {
  const d = dashboard(home);
  if (!d.alert) return [];
  const bill = homeBills(home).at(-1), key = `${home}:${bill.id}`;
  const pct = d.comparison?.kwh_pct?.value ?? null;
  return [{
    id: bill.id, home_id: home, bill_id: bill.id, type: "kwh_increase",
    severity: d.alert.severity, status: state.alertStatus[key] ?? "unread", message: d.alert.message,
    kwh_pct: pct, threshold_pct: d.alert.severity === "critical" ? "40.00" : "20.00", basis_bill_id: d.comparison?.previous_bill_id ?? null,
    basis_period_start: d.alert.basis_period_start, basis_period_end: d.alert.basis_period_end, created_at: NOW,
  }];
}

function itemsOut(home, bill) {
  const rows = (state.items[bill.id] ?? []).map((r, i) => ({ position: i, ...r }));
  const total = rows.reduce((s, r) => s + (r.kind === "discount" ? -1 : 1) * Number(r.amount_dop), 0);
  return {
    home_id: home, bill_id: bill.id, items: rows, items_total_dop: rows.length ? money(total) : null,
    bill_amount_dop: bill.amount_dop, difference_dop: rows.length ? money(Number(bill.amount_dop) - total) : null,
  };
}

function assess(home, bill) {
  const detail = itemsOut(home, bill);
  const warnings = [];
  const checks = [
    { code: "period_days", status: "pass", observed: { days: bill.days } },
    { code: "items_total", status: detail.items.length ? (Number(detail.difference_dop) === 0 ? "pass" : "warning") : "unavailable",
      observed: { difference_dop: detail.difference_dop } },
  ];
  if (checks[1].status === "warning") warnings.push("La suma de cargos y descuentos no coincide con el monto de la factura.");
  return {
    home_id: home, bill_id: bill.id, read_only: true, approval: "not_performed",
    status: !detail.items.length ? "incomplete" : warnings.length ? "warnings" : "consistent",
    checks, warnings, provenance: { origin: "creation", original_available: false, data: null, captured_at: null },
    corrections: [], corrections_has_more: false, detail,
  };
}

// ---------- HTTP ----------
const send = (res, status, body, cors) => {
  res.writeHead(status, { "Content-Type": "application/json", ...cors });
  res.end(status === 204 ? undefined : JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(null); } });
});
const checked = (schema, value) => schema.parse(value) && value; // valida contra el contrato y devuelve el original

createServer(async (req, res) => {
  const origin = req.headers.origin;
  const cors = {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    Vary: "Origin",
  };
  if (req.method === "OPTIONS") return send(res, 204, null, cors);
  const url = new URL(req.url, "http://x");
  const path = url.pathname;

  if (path === "/__sim") {
    if (url.searchParams.get("reset")) { state = freshState(); sim.delay = 0; sim.fail = 0; }
    if (url.searchParams.has("delay")) sim.delay = Number(url.searchParams.get("delay"));
    if (url.searchParams.has("fail")) sim.fail = Number(url.searchParams.get("fail"));
    return send(res, 200, { ...sim, homes: state.homes.length, bills: state.bills.length }, cors);
  }
  if (path === "/health" || path === "/health/live") return send(res, 200, { status: "healthy", simulated: true }, cors);

  if (sim.delay) await new Promise((r) => setTimeout(r, sim.delay));
  if (sim.fail) return send(res, sim.fail, { detail: "Error simulado por /__sim?fail" }, cors);

  const body = ["POST", "PUT", "PATCH"].includes(req.method) ? await readBody(req) : null;
  const api = path.replace(/^\/api\/v1/, "");
  let m;
  try {
    if (api === "/homes" && req.method === "GET") return send(res, 200, state.homes.map((h) => checked(HomeOutSchema, h)), cors);
    if ((m = api.match(/^\/homes\/([^/]+)(\/.*)?$/))) {
      const [, home, rest = ""] = m;
      if (!state.homes.some((h) => h.id === home)) return send(res, 404, { detail: "Vivienda no encontrada" }, cors);
      if (rest === "" && req.method === "GET") return send(res, 200, checked(HomeOutSchema, state.homes.find((h) => h.id === home)), cors);

      if (rest === "/dashboard") return send(res, 200, checked(DashboardOutSchema, dashboard(home)), cors);
      if (rest === "/alerts") return send(res, 200, alerts(home).map((a) => checked(AlertRecordSchema, a)), cors);
      if ((m = rest.match(/^\/alerts\/([^/]+)$/)) && req.method === "PATCH") {
        const found = alerts(home).find((a) => a.id === m[1]);
        if (!found) return send(res, 404, { detail: "Alerta no encontrada" }, cors);
        state.alertStatus[`${home}:${found.bill_id}`] = body?.status;
        return send(res, 200, checked(AlertRecordSchema, alerts(home)[0]), cors);
      }
      if (rest === "/anomalies") {
        const g = url.searchParams.get("granularity");
        const bills = homeBills(home);
        if (g !== "month" || bills.length < 2) return send(res, 200, [], cors);
        const last = bills.at(-1), prev = bills.at(-2), pct = ((Number(last.kwh) - Number(prev.kwh)) / Number(prev.kwh)) * 100;
        return send(res, 200, pct >= 40 ? [checked(AnomalyRecordSchema, {
          home_id: home, granularity: "month", severity: "critical", observed_kwh: last.kwh, baseline_kwh: prev.kwh,
          delta_pct: money(pct), period_start: last.period_start, period_end: last.period_end,
          explanation: `El consumo del período es ${money(pct)}% superior al de referencia.`,
        })] : [], cors);
      }

      let b;
      if (rest === "/bills") {
        if (req.method === "GET") {
          const limit = Number(url.searchParams.get("limit") ?? 100), offset = Number(url.searchParams.get("offset") ?? 0);
          const list = [...homeBills(home)].reverse().slice(offset, offset + limit);
          return send(res, 200, list.map((x) => checked(BillOutSchema, x)), cors);
        }
        if (req.method === "POST") {
          const err = validateBill(home, body);
          if (err) return send(res, err.status, { detail: err.detail }, cors);
          const bill = { id: randomUUID(), home_id: home, source: "manual", created_at: new Date().toISOString(),
            reading_previous: null, reading_current: null, ...pickBill(body) };
          state.bills.push(bill);
          return send(res, 201, checked(BillOutSchema, bill), cors);
        }
      }
      if ((b = rest.match(/^\/bills\/([^/]+)(\/items|\/validate)?$/))) {
        const bill = state.bills.find((x) => x.id === b[1] && x.home_id === home);
        if (!bill) return send(res, 404, { detail: "Factura no encontrada para esta vivienda" }, cors);
        if (!b[2]) {
          if (req.method === "GET") return send(res, 200, checked(BillOutSchema, bill), cors);
          if (req.method === "PUT") {
            const err = validateBill(home, body, bill.id);
            if (err) return send(res, err.status, { detail: err.detail }, cors);
            Object.assign(bill, pickBill(body));
            return send(res, 200, checked(BillOutSchema, bill), cors);
          }
          if (req.method === "DELETE") { state.bills = state.bills.filter((x) => x.id !== bill.id); return send(res, 204, null, cors); }
        }
        if (b[2] === "/items" && req.method === "GET") return send(res, 200, checked(BillItemsOutSchema, itemsOut(home, bill)), cors);
        if (b[2] === "/items" && req.method === "PUT") {
          state.items[bill.id] = (body?.items ?? []).map((i) => ({ label: i.label, kind: i.kind, amount_dop: money(Number(i.amount_dop)) }));
          return send(res, 200, checked(BillItemsOutSchema, itemsOut(home, bill)), cors);
        }
        if (b[2] === "/validate" && req.method === "POST") return send(res, 200, checked(BillAssessmentSchema, assess(home, bill)), cors);
      }
    }
    return send(res, 404, { detail: "Not Found (no simulado)" }, cors);
  } catch (e) {
    // Si esto ocurre, la respuesta simulada NO cumple el contrato: es un fallo del simulador.
    console.error("CONTRATO VIOLADO por el simulador:", req.method, path, e?.issues ?? e);
    return send(res, 500, { detail: "El simulador generó una respuesta fuera de contrato" }, cors);
  }
}).listen(PORT, () => console.log(`API SIMULADA (no es la real) en http://localhost:${PORT}`));

const pickBill = (b) => ({
  period_start: b.period_start, period_end: b.period_end, kwh: String(b.kwh), amount_dop: String(b.amount_dop), days: b.days,
  reading_previous: b.reading_previous == null ? null : String(b.reading_previous),
  reading_current: b.reading_current == null ? null : String(b.reading_current),
});
function validateBill(home, b, exclude) {
  if (!b || !/^\d{4}-\d{2}-\d{2}$/.test(b.period_start ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(b.period_end ?? "")) return { status: 422, detail: "Fechas inválidas" };
  if (b.period_end < b.period_start) return { status: 422, detail: "period_end must be on or after period_start" };
  if (!(Number(b.kwh) >= 0) || !(Number(b.amount_dop) >= 0)) return { status: 422, detail: "kwh y amount_dop deben ser ≥ 0" };
  if (!Number.isInteger(b.days) || b.days < 0 || b.days > 366) return { status: 422, detail: "days debe estar entre 0 y 366" };
  const clash = state.bills.some((x) => x.home_id === home && x.id !== exclude && x.period_start <= b.period_end && x.period_end >= b.period_start);
  if (clash) return { status: 409, detail: "El período se solapa con otra factura de esta vivienda" };
  return null;
}
