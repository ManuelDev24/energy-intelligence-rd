import {
  AlertItemSchema,
  BillSchema,
  DashboardSchema,
  EquipmentEstimateSchema,
  EquipmentSchema,
  HomeSchema,
  type AlertItem,
  type Bill,
  type BillInput,
  type Dashboard,
  type Equipment,
  type Home,
  ConsumptionSchema,
  GoalProgressSchema,
  GoalSchema,
  ReadingSchema,
  TariffSchema,
  BillAssessmentSchema,
  BillItemsOutSchema,
  type BillItemOut,
  type Consumption,
  type Goal,
  type GoalProgress,
  type Reading,
} from "@/lib/api/schemas";
import { ApiError, type Api } from "@/lib/api/types";

// SOLO PARA TESTS. No se importa desde código de producción: la web habla siempre
// con la API real (`getApi`). Estas fixtures reproducen la forma y la semántica del
// backend (decimales con 2 dígitos, etiquetas de calidad) usando la vivienda
// PILOT-01 del seed; los números están escritos a mano, no se calculan aquí.

export const HOME_A = "11111111-1111-4111-8111-111111111111";
export const HOME_B = "22222222-2222-4222-8222-222222222222";

const emptyOnboarding = {
  province: null, municipality: null, sector: null, user_type: null, occupants: null,
  has_ac: null, has_water_heater: null, has_pool: null, has_solar: null, has_inverter: null,
};

const HOMES: Home[] = [
  {
    ...emptyOnboarding,
    id: HOME_A,
    code: "PILOT-01",
    name: "Vivienda piloto 01 (demo)",
    address: null,
    city: "Santo Domingo",
    distributor: "EDESUR",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    ...emptyOnboarding,
    id: HOME_B,
    code: "PILOT-02",
    name: "Vivienda piloto 02 (demo)",
    address: null,
    city: "Santiago",
    distributor: "EDENORTE",
    created_at: "2026-01-01T00:00:00Z",
  },
];

function bill(
  n: number,
  homeId: string,
  start: string,
  end: string,
  days: number,
  kwh: string,
  amount: string,
): Bill {
  return {
    id: `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`,
    home_id: homeId,
    period_start: start,
    period_end: end,
    kwh,
    amount_dop: amount,
    days,
    reading_previous: null,
    reading_current: null,
    source: "seed",
    created_at: "2026-01-01T00:00:00Z",
  };
}

export const BILLS: Bill[] = [
  bill(1, HOME_A, "2026-06-01", "2026-06-30", 30, "250.00", "3150.00"),
  bill(2, HOME_A, "2026-07-01", "2026-07-31", 31, "280.00", "3560.00"),
  bill(3, HOME_A, "2026-08-01", "2026-08-31", 31, "420.00", "5600.00"),
  bill(4, HOME_B, "2026-08-01", "2026-08-31", 31, "315.00", "4010.00"),
];

export const DASHBOARD_A = {
  home: { id: HOME_A, code: "PILOT-01", name: "Vivienda piloto 01 (demo)", distributor: "EDESUR" },
  latest_bill: {
    bill_id: BILLS[2].id,
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    days: 31,
    kwh: { value: "420.00", unit: "kWh", quality: "REAL" },
    amount_dop: { value: "5600.00", unit: "RD$", quality: "REAL" },
    avg_daily_kwh: { value: "13.55", unit: "kWh/día", quality: "ESTIMATED" },
    avg_price_per_kwh: { value: "13.33", unit: "RD$/kWh", quality: "ESTIMATED" },
    source: "seed",
  },
  comparison: {
    previous_bill_id: BILLS[1].id,
    previous_period_start: "2026-07-01",
    previous_period_end: "2026-07-31",
    kwh_delta: { value: "140.00", unit: "kWh", quality: "REAL" },
    kwh_pct: { value: "50.00", unit: "%", quality: "REAL" },
    amount_delta: { value: "2040.00", unit: "RD$", quality: "REAL" },
    amount_pct: { value: "57.30", unit: "%", quality: "REAL" },
  },
  projection: {
    method: "linear_least_squares",
    bills_used: 3,
    kwh: { value: "486.67", unit: "kWh", quality: "PROJECTED" },
    amount_dop: { value: "6553.33", unit: "RD$", quality: "PROJECTED" },
    note: "Proyección de la próxima factura mensual por tendencia lineal; no incluye cambios de tarifa.",
  },
  alert: {
    severity: "critical",
    message: "El consumo subió 50.00% frente al período anterior (280.00 kWh → 420.00 kWh).",
    basis_period_start: "2026-07-01",
    basis_period_end: "2026-07-31",
  },
  recommendation: "Revise equipos de mayor uso y compare con su rutina del mes anterior.",
  data_status: {
    bills_count: 3,
    data_source: "seed",
    is_demo: true,
    resolution: "monthly",
    hourly_data_available: false,
    insufficient_reasons: [],
  },
  quality_legend: {
    REAL: "Dato tomado directamente de una factura mensual introducida.",
    ESTIMATED: "Valor derivado de totales mensuales (promedios); no es una medición directa.",
    PROJECTED: "Proyección lineal a partir del historial de facturas; no es un dato observado.",
  },
} satisfies Dashboard;

const dashboardWithoutProjection = (home: Home): Dashboard => ({
  home: { id: home.id, code: home.code, name: home.name, distributor: home.distributor },
  latest_bill: null,
  comparison: null,
  projection: null,
  alert: null,
  recommendation: null,
  data_status: {
    bills_count: 0,
    data_source: "none",
    is_demo: false,
    resolution: "monthly",
    hourly_data_available: false,
    insufficient_reasons: ["No hay facturas registradas: registre al menos una para ver consumo."],
  },
  quality_legend: DASHBOARD_A.quality_legend,
});

export function createMockApi(): Api {
  const homes = HOMES.map((h) => HomeSchema.parse(h));
  let bills = BILLS.map((b) => BillSchema.parse(b));
  let equipment: Equipment[] = [];
  let alerts: AlertItem[] = [AlertItemSchema.parse(ALERT_A)];
  let counter = 100;
  let readings: Reading[] = READINGS.map((r) => ReadingSchema.parse(r));
  const goals = new Map<string, Goal>([[HOME_A, GoalSchema.parse(GOAL_A)]]);
  const billItems = new Map<string, BillItemOut[]>();

  const requireHome = (homeId: string) => {
    const home = homes.find((h) => h.id === homeId);
    if (!home) throw new ApiError(404, "Vivienda no encontrada");
    return home;
  };
  const requireBill = (homeId: string, billId: string) => {
    requireHome(homeId);
    const found = bills.find((b) => b.id === billId && b.home_id === homeId);
    if (!found) throw new ApiError(404, "Factura no encontrada para esta vivienda");
    return found;
  };
  const assertNoOverlap = (homeId: string, input: BillInput, excludeId?: string) => {
    const clash = bills.some(
      (b) =>
        b.home_id === homeId &&
        b.id !== excludeId &&
        b.period_start <= input.period_end &&
        b.period_end >= input.period_start,
    );
    if (clash) throw new ApiError(409, "El período se solapa con otra factura de esta vivienda");
  };

  return {
    listHomes: async () => homes,
    listBills: async (homeId) => {
      requireHome(homeId);
      return bills
        .filter((b) => b.home_id === homeId)
        .sort((a, b) => b.period_start.localeCompare(a.period_start));
    },
    getBill: async (homeId, billId) => requireBill(homeId, billId),
    createBill: async (homeId, input) => {
      requireHome(homeId);
      assertNoOverlap(homeId, input);
      counter += 1;
      const created: Bill = {
        ...input,
        reading_previous: input.reading_previous ?? null,
        reading_current: input.reading_current ?? null,
        id: `bbbbbbbb-0000-4000-8000-${String(counter).padStart(12, "0")}`,
        home_id: homeId,
        source: "manual",
        created_at: new Date().toISOString(),
      };
      bills = [...bills, created];
      return created;
    },
    updateBill: async (homeId, billId, input) => {
      const current = requireBill(homeId, billId);
      assertNoOverlap(homeId, input, billId);
      const updated: Bill = { ...current, ...input };
      bills = bills.map((b) => (b.id === billId ? updated : b));
      return updated;
    },
    deleteBill: async (homeId, billId) => {
      requireBill(homeId, billId);
      bills = bills.filter((b) => b.id !== billId);
    },
    // Estático a propósito: el cálculo del dashboard es del backend, no de la web.
    getDashboard: async (homeId) => {
      const home = requireHome(homeId);
      return DashboardSchema.parse(homeId === HOME_A ? DASHBOARD_A : dashboardWithoutProjection(home));
    },

    listEquipment: async (homeId) => {
      requireHome(homeId);
      return equipment.filter((e) => e.home_id === homeId);
    },
    createEquipment: async (homeId, input) => {
      requireHome(homeId);
      counter += 1;
      const created = EquipmentSchema.parse({
        ...input,
        id: `cccccccc-0000-4000-8000-${String(counter).padStart(12, "0")}`,
        home_id: homeId,
        created_at: new Date().toISOString(),
      });
      equipment = [...equipment, created];
      return created;
    },
    updateEquipment: async (homeId, id, input) => {
      requireHome(homeId);
      const current = equipment.find((e) => e.id === id && e.home_id === homeId);
      if (!current) throw new ApiError(404, "Equipo no encontrado para esta vivienda");
      const updated = { ...current, ...input };
      equipment = equipment.map((e) => (e.id === id ? updated : e));
      return updated;
    },
    deleteEquipment: async (homeId, id) => {
      requireHome(homeId);
      equipment = equipment.filter((e) => !(e.id === id && e.home_id === homeId));
    },
    // Estático: el estimado lo calcula el backend.
    getEstimate: async (homeId) => {
      requireHome(homeId);
      const own = equipment.filter((e) => e.home_id === homeId);
      return EquipmentEstimateSchema.parse({
        home_id: homeId,
        equipment_count: own.length,
        items: [],
        total_daily_kwh: { value: "0.00", unit: "kWh/día", quality: "ESTIMATED" },
        total_monthly_kwh: { value: "0.00", unit: "kWh/mes", quality: "ESTIMATED" },
        days_per_month: 30,
        latest_bill_kwh: null,
        bill_coverage_pct: null,
        note: "Estimación de prueba.",
      });
    },
    listAlerts: async (homeId, opts) => {
      requireHome(homeId);
      return alerts.filter((a) => a.home_id === homeId && (opts?.includeDismissed || a.status !== "dismissed"));
    },
    setAlertStatus: async (homeId, id, status) => {
      const found = alerts.find((a) => a.id === id && a.home_id === homeId);
      if (!found) throw new ApiError(404, "Alerta no encontrada para esta vivienda");
      const updated = { ...found, status };
      alerts = alerts.map((a) => (a.id === id ? updated : a));
      return updated;
    },

    // ---------- Fase 2 ----------
    listReadings: async (homeId) => {
      requireHome(homeId);
      return readings.filter((r) => r.home_id === homeId).sort((a, b) => b.read_at.localeCompare(a.read_at));
    },
    // Errores con texto "de servidor" a propósito: la UI NO debe mostrarlo (usa mensajes locales).
    createReading: async (homeId, input) => {
      requireHome(homeId);
      const at = Date.parse(input.read_at);
      const own = readings.filter((r) => r.home_id === homeId);
      if (own.some((r) => Date.parse(r.read_at) === at)) throw new ApiError(409, "SERVER-TEXT duplicate", {}, "conflict");
      const before = own.filter((r) => Date.parse(r.read_at) < at).sort((a, b) => b.read_at.localeCompare(a.read_at))[0];
      if (before && Number(input.reading_kwh) < Number(before.reading_kwh)) throw new ApiError(422, "SERVER-TEXT monotonic", {}, "invalid_input");
      counter += 1;
      const created = ReadingSchema.parse({
        id: `eeeeeeee-0000-4000-8000-${String(counter).padStart(12, "0")}`,
        home_id: homeId,
        read_at: new Date(at).toISOString(),
        reading_kwh: String(input.reading_kwh),
        source: "manual",
        note: input.note ?? null,
        created_at: new Date().toISOString(),
      });
      readings = [...readings, created];
      return created;
    },
    deleteReading: async (homeId, readingId) => {
      requireHome(homeId);
      if (!readings.some((r) => r.id === readingId && r.home_id === homeId)) throw new ApiError(404, "SERVER-TEXT not found", {}, "not_found");
      readings = readings.filter((r) => r.id !== readingId);
    },
    // Estático: el cálculo de buckets es del backend. Solo refleja el rango pedido.
    getConsumption: async (homeId, opts) => {
      requireHome(homeId);
      if (homeId !== HOME_A) return ConsumptionSchema.parse({ ...EMPTY_CONSUMPTION, home_id: homeId, granularity: opts.granularity, from_date: opts.from, to_date: opts.to });
      return ConsumptionSchema.parse({ ...CONSUMPTION_A, granularity: opts.granularity, from_date: opts.from, to_date: opts.to });
    },
    getGoal: async (homeId) => {
      requireHome(homeId);
      return goals.get(homeId) ?? null;
    },
    putGoal: async (homeId, input) => {
      requireHome(homeId);
      const saved = GoalSchema.parse({
        home_id: homeId,
        monthly_amount_rd: input.monthly_amount_rd ?? null,
        monthly_kwh: input.monthly_kwh ?? null,
        updated_at: new Date().toISOString(),
      });
      goals.set(homeId, saved);
      return saved;
    },
    getGoalProgress: async (homeId) => {
      requireHome(homeId);
      if (homeId === HOME_A) return GoalProgressSchema.parse(PROGRESS_A);
      const goal = goals.get(homeId) ?? null;
      return GoalProgressSchema.parse({
        ...PROGRESS_EMPTY,
        home_id: homeId,
        goal,
        reasons: goal ? ["No hay lecturas ni facturas en este mes."] : ["No hay meta mensual definida para esta vivienda."],
      });
    },
    listTariffs: async (opts) => [TariffSchema.parse(TARIFF_EDESUR)].filter((t) => !opts?.distributor || t.distributor === opts.distributor),

    // ---------- ERD-BILL-02 (solo tests) ----------
    // La suma en centavos enteros simula a la API (Decimal); la web nunca la calcula.
    getBillItems: async (homeId, billId) => billDetail(requireBill(homeId, billId), billItems.get(billId) ?? []),
    putBillItems: async (homeId, billId, input) => {
      const found = requireBill(homeId, billId);
      if (input.items.length > 100) throw new ApiError(422, "SERVER-TEXT too many", {}, "validation_error");
      billItems.set(billId, input.items.map((item, position) => ({ position, label: item.label, kind: item.kind, amount_dop: item.amount_dop })));
      return billDetail(found, billItems.get(billId)!);
    },
    assessBill: async (homeId, billId) => {
      const found = requireBill(homeId, billId);
      const detail = billDetail(found, billItems.get(billId) ?? []);
      return BillAssessmentSchema.parse({ ...ASSESSMENT_A, home_id: homeId, bill_id: billId, detail });
    },
  };
}

// ---------- Fixtures de fase 2 (forma real de la API, números escritos a mano) ----------
const reading = (n: number, read_at: string, reading_kwh: string, note: string | null = null) => ({
  id: `eeeeeeee-0000-4000-8000-${String(n).padStart(12, "0")}`,
  home_id: HOME_A,
  read_at,
  reading_kwh,
  source: "manual" as const,
  note,
  created_at: read_at,
});

export const READINGS = [
  reading(1, "2026-09-20T12:00:00Z", "1000.00"),
  reading(2, "2026-09-27T12:00:00Z", "1070.50", "Antes del viaje"),
  reading(3, "2026-10-04T00:00:00Z", "1140.00"),
];

const LEGEND = {
  REAL: "Diferencia entre dos lecturas del medidor que caen dentro del período.",
  ESTIMATED: "Energía de un intervalo entre lecturas repartida proporcionalmente al tiempo entre períodos, o promedio diario.",
};

export const NO_COVERAGE_REASON = "Ninguna pareja de lecturas cubre este período; no se inventa un valor.";
export const PARTIAL_REASON = "Las lecturas cubren solo parte del período; el valor no se extrapola.";

export const CONSUMPTION_A = {
  home_id: HOME_A,
  granularity: "week",
  from_date: "2026-09-07",
  to_date: "2026-10-04",
  timezone: "America/Santo_Domingo",
  buckets: [
    { start: "2026-09-07", end: "2026-09-13", kwh: null, quality: null, coverage_ratio: "0.0000", reason_code: "no_coverage", reason: NO_COVERAGE_REASON },
    { start: "2026-09-14", end: "2026-09-20", kwh: "6.71", quality: "ESTIMATED", coverage_ratio: "0.0952", reason_code: "partial_coverage", reason: PARTIAL_REASON },
    { start: "2026-09-21", end: "2026-09-27", kwh: "70.50", quality: "REAL", coverage_ratio: "1.0000", reason_code: null, reason: null },
    { start: "2026-09-28", end: "2026-10-04", kwh: "62.79", quality: "ESTIMATED", coverage_ratio: "0.8333", reason_code: "partial_coverage", reason: PARTIAL_REASON },
  ],
  totals: { kwh: { value: "140.00", unit: "kWh", quality: "ESTIMATED" }, covered_days: "13.5000", coverage_ratio: "0.4821" },
  average_daily_kwh: { value: "10.37", unit: "kWh/día", quality: "ESTIMATED" },
  peak_bucket: { start: "2026-09-21", end: "2026-09-27", kwh: "70.50", quality: "REAL", coverage_ratio: "1.0000", reason_code: null, reason: null },
  estimated_cost: { value: "450.00", unit: "RD$", quality: "ESTIMATED" },
  comparison: null,
  readings_used: 3,
  resolution: "meter_readings",
  hourly_data_available: false,
  insufficient_reasons: ["Parte del rango no está cubierta por lecturas; esos períodos no tienen valor."],
  quality_legend: LEGEND,
} satisfies Consumption;

// Variante con comparación real (CH-02/CH-03): mismo rango que CONSUMPTION_A pero con un
// período anterior completo y un kwh_pct significativo, para probar el badge de variación.
export const CONSUMPTION_WITH_COMPARISON = {
  ...CONSUMPTION_A,
  comparison: {
    previous_from: "2026-08-10",
    previous_to: "2026-09-06",
    previous_kwh: { value: "100.00", unit: "kWh", quality: "REAL" },
    kwh_delta: { value: "40.00", unit: "kWh", quality: "ESTIMATED" },
    kwh_pct: { value: "40.00", unit: "%", quality: "ESTIMATED" },
  },
} satisfies Consumption;

const EMPTY_CONSUMPTION = {
  ...CONSUMPTION_A,
  buckets: [{ start: "2026-10-04", end: "2026-10-04", kwh: null, quality: null, coverage_ratio: "0.0000", reason_code: "no_coverage", reason: NO_COVERAGE_REASON }],
  totals: { kwh: null, covered_days: "0.0000", coverage_ratio: "0.0000" },
  average_daily_kwh: null,
  peak_bucket: null,
  estimated_cost: null,
  comparison: null,
  readings_used: 0,
  insufficient_reasons: ["Se necesitan al menos 2 lecturas del medidor para calcular consumo."],
} satisfies Consumption;

export const GOAL_A = { home_id: HOME_A, monthly_amount_rd: "3000.00", monthly_kwh: "400.00", updated_at: "2026-10-01T12:00:00Z" } satisfies Goal;

const TARIFF_REF = {
  tariff_id: "d75cf04f-4b37-506e-bbd9-ea929724d3d3",
  distributor: "EDESUR" as const,
  tariff_code: "BTS-1",
  effective_from: "2026-10-01",
  effective_to: "2026-12-31",
  source_resolution: "SIE-121-2026-TF",
  source_url: "https://sie.gob.do/document/sie-121-2026-tf/",
};

export const PROGRESS_A = {
  home_id: HOME_A,
  month_start: "2026-10-01",
  month_end: "2026-10-31",
  as_of: "2026-10-04",
  timezone: "America/Santo_Domingo",
  goal: GOAL_A,
  status: "at_risk",
  data_source: "readings",
  kwh: {
    target: "400.00", unit: "kWh",
    so_far: { value: "30.29", unit: "kWh", quality: "REAL" },
    projected: { value: "331.46", unit: "kWh", quality: "PROJECTED" },
    percent_so_far: "7.57", percent_projected: "82.87",
    status: "on_track", basis: "readings", projection_method: "run_rate_readings", tariff: null, reasons: [],
  },
  amount: {
    target: "3000.00", unit: "RD$",
    so_far: { value: "225.35", unit: "RD$", quality: "ESTIMATED" },
    projected: { value: "3104.11", unit: "RD$", quality: "PROJECTED" },
    percent_so_far: "7.51", percent_projected: "103.47",
    status: "at_risk", basis: "tariff", projection_method: "run_rate_readings", tariff: TARIFF_REF, reasons: [],
  },
  reasons: [],
  quality_legend: {
    REAL: "Diferencia entre lecturas del medidor dentro del mes.",
    ESTIMATED: "Prorrateo por tiempo/días, o RD$ calculado con tarifa (sin impuestos ni otros cargos).",
    PROJECTED: "Cierre de mes proyectado: ritmo diario de las lecturas o tendencia lineal de facturas.",
  },
} satisfies GoalProgress;

const PROGRESS_EMPTY = {
  ...PROGRESS_A,
  goal: null,
  status: "insufficient_data",
  data_source: "none",
  kwh: null,
  amount: null,
  reasons: [] as string[],
} satisfies GoalProgress;

// Solo prueba: precios ficticios (la UI muestra únicamente resolución y vigencia del pliego).
export const TARIFF_EDESUR = {
  id: TARIFF_REF.tariff_id,
  distributor: "EDESUR",
  tariff_code: "BTS-1",
  effective_from: "2026-10-01",
  effective_to: "2026-12-31",
  flat_all_units_from_kwh: "701.00",
  fixed_charges: [{ from_kwh: "0.00", to_kwh: null, amount_rd: "40.00" }],
  blocks: [{ from_kwh: "0.00", to_kwh: null, price_rd_per_kwh: "10.00" }],
  source_resolution: "SIE-121-2026-TF",
  source_url: TARIFF_REF.source_url,
  scope_note: null,
};

export const ALERT_A: AlertItem = {
  id: "dddddddd-0000-4000-8000-000000000001",
  home_id: HOME_A,
  bill_id: BILLS[2].id,
  type: "bill_variation",
  severity: "critical",
  status: "unread",
  message: DASHBOARD_A.alert.message,
  kwh_pct: "50.00",
  threshold_pct: "40.00",
  basis_bill_id: BILLS[1].id,
  basis_period_start: "2026-07-01",
  basis_period_end: "2026-07-31",
  created_at: "2026-09-01T00:00:00Z",
};

// ---------- ERD-BILL-02: detalle de cargos y evaluación (forma real de la API) ----------
const cents = (value: string) => Math.round(Number(value) * 100);
const money = (c: number) => `${c < 0 ? "-" : ""}${Math.floor(Math.abs(c) / 100)}.${String(Math.abs(c) % 100).padStart(2, "0")}`;
export function billDetail(bill: Bill, items: BillItemOut[]) {
  const total = items.length ? items.reduce((sum, item) => sum + cents(item.amount_dop), 0) : null;
  return BillItemsOutSchema.parse({
    home_id: bill.home_id, bill_id: bill.id, items,
    items_total_dop: total === null ? null : money(total),
    bill_amount_dop: bill.amount_dop,
    difference_dop: total === null ? null : money(total - cents(bill.amount_dop)),
  });
}

export const ASSESSMENT_A = {
  read_only: true,
  approval: "not_performed",
  status: "warnings",
  checks: [
    { code: "period_order", status: "pass", observed: { period_start: "2026-08-01", period_end: "2026-08-31" } },
    { code: "days_consistency", status: "warning", observed: { days: 31, elapsed_days: 30, inclusive_days: 31, convention: "unspecified" } },
    { code: "readings_kwh", status: "unavailable", observed: { reading_previous: null, reading_current: null } },
  ],
  warnings: ["days_consistency", "original_unverified"],
  provenance: { origin: "migration", original_available: false, data: { amount_dop: "5600.00" }, captured_at: "2026-09-01T12:00:00Z" },
  corrections: [
    { entity: "bills", operation: "update", before: { amount_dop: "5500.00" }, after: { amount_dop: "5600.00" }, created_at: "2026-09-02T15:30:00Z" },
  ],
  corrections_has_more: false,
};
