import { z } from 'zod';

export const qualitySchema = z.enum(['REAL', 'ESTIMATED', 'PROJECTED', 'INFERRED']);
const decimal = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)])
  .transform(Number).refine(Number.isFinite, 'Valor no finito');
const nonnegative = decimal.refine(value => value >= 0, 'Valor negativo');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, 'Fecha inválida');
const source = z.enum(['manual', 'seed']);
export const homeSchema = z.object({ id: z.string().uuid(), name: z.string().min(1), distributor: z.string() });
export const billSchema = z.object({
  id: z.string().uuid(), home_id: z.string().uuid(), period_start: date, period_end: date,
  kwh: nonnegative, amount_dop: nonnegative, source,
}).refine(bill => bill.period_start <= bill.period_end, 'Período invertido');
const metric = z.object({ value: decimal, unit: z.string(), quality: qualitySchema });
export const dashboardSchema = z.object({
  home: homeSchema,
  projection: z.object({ method: z.string(), bills_used: z.number().int().nonnegative(),
    kwh: metric, amount_dop: metric, note: z.string() }).nullable(),
  alert: z.object({ severity: z.enum(['warning', 'critical']), message: z.string(),
    basis_period_start: date, basis_period_end: date }).nullable(),
  recommendation: z.string().nullable(),
  data_status: z.object({ is_demo: z.boolean(), resolution: z.literal('monthly'),
    insufficient_reasons: z.array(z.string()) }),
});
export type EnergyHome = z.infer<typeof homeSchema>;
export type EnergyBill = z.infer<typeof billSchema>;
export type EnergyDashboardData = z.infer<typeof dashboardSchema>;
export type EnergyData = { bills: EnergyBill[]; dashboard: EnergyDashboardData };

async function request(base: string, path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`${base.replace(/\/$/, '')}/api/v1${path}`, { signal });
  if (!response.ok) throw new Error(`No pudimos cargar los datos (HTTP ${response.status}).`);
  return response.json();
}
export async function loadHomes(base: string, signal?: AbortSignal) {
  return z.array(homeSchema).parse(await request(base, '/homes', signal));
}
export async function loadEnergy(base: string, homeId: string, signal?: AbortSignal): Promise<EnergyData> {
  const id = z.string().uuid().parse(homeId);
  const [rawBills, rawDashboard] = await Promise.all([
    request(base, `/homes/${id}/bills`, signal), request(base, `/homes/${id}/dashboard`, signal),
  ]);
  const bills = z.array(billSchema).parse(rawBills);
  const dashboard = dashboardSchema.parse(rawDashboard);
  if (dashboard.home.id !== id || bills.some(bill => bill.home_id !== id)) {
    throw new Error('La respuesta no corresponde a la vivienda seleccionada.');
  }
  if (new Set(bills.map(bill => bill.id)).size !== bills.length) throw new Error('Facturas duplicadas.');
  return { bills, dashboard };
}
