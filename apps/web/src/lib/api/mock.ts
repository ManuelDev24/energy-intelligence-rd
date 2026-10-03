import {
  BillSchema,
  DashboardSchema,
  HomeSchema,
  type Bill,
  type BillInput,
  type Dashboard,
  type Home,
} from "./schemas";
import { ApiError, type Api } from "./types";

// FIXTURES DEMO. Todos los números están escritos a mano para ilustrar la UI:
// la web no calcula ni recalcula métricas. El dashboard mock es estático y no
// cambia cuando se crean, editan o borran facturas; eso lo hará el backend.

const HOME_A = "11111111-1111-4111-8111-111111111111";
const HOME_B = "22222222-2222-4222-8222-222222222222";

const HOMES: Home[] = [
  {
    id: HOME_A,
    code: "DEMO-001",
    name: "Casa demo (Santo Domingo)",
    address: "Calle Ejemplo 1",
    city: "Santo Domingo",
    distributor: "EDESUR",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: HOME_B,
    code: "DEMO-002",
    name: "Apartamento demo (Santiago)",
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
  kwh: string,
  amount: string,
  days: number,
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

const BILLS: Bill[] = [
  bill(1, HOME_A, "2026-05-01", "2026-05-31", "320.00", "4200.00", 31),
  bill(2, HOME_A, "2026-06-01", "2026-06-30", "345.00", "4550.00", 30),
  bill(3, HOME_A, "2026-07-01", "2026-07-31", "410.00", "5480.00", 31),
  bill(4, HOME_B, "2026-07-01", "2026-07-31", "180.00", "2300.00", 31),
];

const DASHBOARD_A = {
  home: { id: HOME_A, code: "DEMO-001", name: "Casa demo (Santo Domingo)", distributor: "EDESUR" },
  latest_bill: {
    bill_id: BILLS[2].id,
    period_start: "2026-07-01",
    period_end: "2026-07-31",
    days: 31,
    kwh: { value: "410.00", unit: "kWh", quality: "REAL" },
    amount_dop: { value: "5480.00", unit: "RD$", quality: "REAL" },
    avg_daily_kwh: { value: "13.23", unit: "kWh/día", quality: "ESTIMATED" },
    avg_price_per_kwh: { value: "13.37", unit: "RD$/kWh", quality: "ESTIMATED" },
    source: "seed",
  },
  comparison: {
    previous_bill_id: BILLS[1].id,
    previous_period_start: "2026-06-01",
    previous_period_end: "2026-06-30",
    kwh_delta: { value: "65.00", unit: "kWh", quality: "ESTIMATED" },
    kwh_pct: { value: "18.84", unit: "%", quality: "ESTIMATED" },
    amount_delta: { value: "930.00", unit: "RD$", quality: "ESTIMATED" },
    amount_pct: { value: "20.44", unit: "%", quality: "ESTIMATED" },
  },
  projection: {
    method: "demo",
    bills_used: 3,
    kwh: { value: "395.00", unit: "kWh", quality: "PROJECTED" },
    amount_dop: { value: "5250.00", unit: "RD$", quality: "PROJECTED" },
    note: "Proyección de ejemplo (fixture demo); no es un cálculo real.",
  },
  alert: {
    severity: "warning",
    message: "Consumo de ejemplo por encima del período anterior (fixture demo).",
    basis_period_start: "2026-07-01",
    basis_period_end: "2026-07-31",
  },
  recommendation: "Recomendación de ejemplo (fixture demo).",
  data_status: {
    bills_count: 3,
    data_source: "seed",
    is_demo: true,
    resolution: "monthly",
    hourly_data_available: false,
    insufficient_reasons: [],
  },
  quality_legend: {
    REAL: "Dato tomado directamente de la factura",
    ESTIMATED: "Estimación a partir de datos disponibles",
    PROJECTED: "Proyección hacia el futuro",
  },
} satisfies Dashboard;

const DASHBOARD_EMPTY = (home: Home): Dashboard => ({
  home: { id: home.id, code: home.code, name: home.name, distributor: home.distributor },
  latest_bill: null,
  comparison: null,
  projection: null,
  alert: null,
  recommendation: null,
  data_status: {
    bills_count: 0,
    data_source: "none",
    is_demo: true,
    resolution: "monthly",
    hourly_data_available: false,
    insufficient_reasons: ["Aún no hay facturas registradas para esta vivienda (fixture demo)."],
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
    mode: "mock",
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
    getDashboard: async (homeId) => {
      const home = requireHome(homeId);
      return DashboardSchema.parse(homeId === HOME_A ? DASHBOARD_A : DASHBOARD_EMPTY(home));
    },
  };
}
