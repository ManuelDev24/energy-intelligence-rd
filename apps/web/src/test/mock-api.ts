import {
  BillSchema,
  DashboardSchema,
  HomeSchema,
  type Bill,
  type BillInput,
  type Dashboard,
  type Home,
} from "@/lib/api/schemas";
import { ApiError, type Api } from "@/lib/api/types";

// SOLO PARA TESTS. No se importa desde código de producción: la web habla siempre
// con la API real (`getApi`). Estas fixtures reproducen la forma y la semántica del
// backend (decimales con 2 dígitos, etiquetas de calidad) usando la vivienda
// PILOT-01 del seed; los números están escritos a mano, no se calculan aquí.

export const HOME_A = "11111111-1111-4111-8111-111111111111";
export const HOME_B = "22222222-2222-4222-8222-222222222222";

const HOMES: Home[] = [
  {
    id: HOME_A,
    code: "PILOT-01",
    name: "Vivienda piloto 01 (demo)",
    address: null,
    city: "Santo Domingo",
    distributor: "EDESUR",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
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
  let counter = 100;

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
  };
}
