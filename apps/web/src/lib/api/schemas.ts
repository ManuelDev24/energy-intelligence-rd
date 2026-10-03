import { z } from "zod";

// Contrato espejo de services/api/app/schemas. La web solo valida y muestra:
// no calcula métricas energéticas. Pydantic serializa Decimal como string, por
// eso los montos se conservan como string y solo se formatean para mostrarlos.

const decimal = z.union([z.string(), z.number()]).transform(String);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD)");

export const DistributorSchema = z.enum(["EDESUR", "EDENORTE", "EDEESTE", "Otra"]);
export type Distributor = z.infer<typeof DistributorSchema>;

export const HomeSchema = z.object({
  id: z.string().uuid(),
  code: z.string().nullable(),
  name: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  distributor: DistributorSchema,
  created_at: z.string(),
});
export type Home = z.infer<typeof HomeSchema>;

export const BillSourceSchema = z.enum(["manual", "seed"]);

export const BillSchema = z.object({
  id: z.string().uuid(),
  home_id: z.string().uuid(),
  period_start: isoDate,
  period_end: isoDate,
  kwh: decimal,
  amount_dop: decimal,
  days: z.number().int(),
  reading_previous: decimal.nullable(),
  reading_current: decimal.nullable(),
  source: BillSourceSchema,
  created_at: z.string(),
});
export type Bill = z.infer<typeof BillSchema>;

export const BillsSchema = z.array(BillSchema);

// Cuerpo de POST/PUT. `days` lo escribe quien registra la factura (la API lo exige).
export type BillInput = {
  period_start: string;
  period_end: string;
  kwh: string;
  amount_dop: string;
  days: number;
  reading_previous: string | null;
  reading_current: string | null;
};

const QualitySchema = z.enum(["REAL", "ESTIMATED", "PROJECTED"]);
export type Quality = z.infer<typeof QualitySchema>;

export const MetricSchema = z.object({
  value: decimal,
  unit: z.string(),
  quality: QualitySchema,
});
export type Metric = z.infer<typeof MetricSchema>;

const LatestBillSchema = z.object({
  bill_id: z.string().uuid(),
  period_start: isoDate,
  period_end: isoDate,
  days: z.number().int(),
  kwh: MetricSchema,
  amount_dop: MetricSchema,
  avg_daily_kwh: MetricSchema.nullable(),
  avg_price_per_kwh: MetricSchema.nullable(),
  source: BillSourceSchema,
});

const ComparisonSchema = z.object({
  previous_bill_id: z.string().uuid(),
  previous_period_start: isoDate,
  previous_period_end: isoDate,
  kwh_delta: MetricSchema,
  kwh_pct: MetricSchema.nullable(),
  amount_delta: MetricSchema,
  amount_pct: MetricSchema.nullable(),
});

const ProjectionSchema = z.object({
  method: z.string(),
  bills_used: z.number().int(),
  kwh: MetricSchema,
  amount_dop: MetricSchema,
  note: z.string(),
});

const AlertSchema = z.object({
  severity: z.enum(["warning", "critical"]),
  message: z.string(),
  basis_period_start: isoDate,
  basis_period_end: isoDate,
});

const DataStatusSchema = z.object({
  bills_count: z.number().int(),
  data_source: z.enum(["manual", "seed", "mixed", "none"]),
  is_demo: z.boolean(),
  resolution: z.literal("monthly"),
  hourly_data_available: z.boolean(),
  insufficient_reasons: z.array(z.string()),
});

export const DashboardSchema = z.object({
  home: z.object({
    id: z.string().uuid(),
    code: z.string().nullable(),
    name: z.string(),
    distributor: z.string(),
  }),
  latest_bill: LatestBillSchema.nullable(),
  comparison: ComparisonSchema.nullable(),
  projection: ProjectionSchema.nullable(),
  alert: AlertSchema.nullable(),
  recommendation: z.string().nullable(),
  data_status: DataStatusSchema,
  quality_legend: z.record(z.string(), z.string()),
});
export type Dashboard = z.infer<typeof DashboardSchema>;
