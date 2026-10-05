export * from "./generated";
import {
  HomeOutSchema, BillOutSchema, DashboardOutSchema, EquipmentOutSchema,
  EquipmentEstimateOutSchema, AlertRecordSchema, BillUpdateSchema, EquipmentInSchema, MetricSchema,
} from "./generated";
import type { z } from "zod";

export const HomeSchema = HomeOutSchema;
export const BillSchema = BillOutSchema;
export const BillsSchema = BillSchema.array();
export const DashboardSchema = DashboardOutSchema;
export const EquipmentSchema = EquipmentOutSchema;
export const EquipmentEstimateSchema = EquipmentEstimateOutSchema;
export const AlertItemSchema = AlertRecordSchema;
export const DistributorSchema = HomeSchema.shape.distributor;
export const BillSourceSchema = BillSchema.shape.source;
export const AlertStatusSchema = AlertItemSchema.shape.status;
export const QualitySchema = MetricSchema.shape.quality;
export type Home = z.infer<typeof HomeSchema>;
export type Bill = z.infer<typeof BillSchema>;
export type Dashboard = z.infer<typeof DashboardSchema>;
export type Equipment = z.infer<typeof EquipmentSchema>;
export type EquipmentEstimate = z.infer<typeof EquipmentEstimateSchema>;
export type AlertItem = z.infer<typeof AlertItemSchema>;
export type Alert = AlertItem;
export type Distributor = Home["distributor"];
export type Quality = z.infer<typeof QualitySchema>;
export type AlertStatus = AlertItem["status"];
export type Severity = AlertItem["severity"];
// Optional readings are accepted by the API; decimal inputs are canonical strings.
export type BillInput = Omit<z.infer<typeof BillUpdateSchema>, "reading_previous" | "reading_current">
  & { reading_previous?: string | null; reading_current?: string | null };
export type EquipmentInput = z.infer<typeof EquipmentInSchema>;

// ---------- Fase 2: lecturas, consumo, metas y tarifas ----------
import {
  ReadingOutSchema, ReadingCreateSchema, ConsumptionOutSchema, ConsumptionBucketSchema, GoalOutSchema, GoalInSchema,
  GoalProgressOutSchema, GoalMetricProgressSchema, TariffOutSchema, TariffRefSchema,
} from "./generated";

export const ReadingSchema = ReadingOutSchema;
export const ReadingsSchema = ReadingSchema.array();
export const ReadingInputSchema = ReadingCreateSchema;
export const ConsumptionSchema = ConsumptionOutSchema;
export const ConsumptionBucketItemSchema = ConsumptionBucketSchema;
export const GranularitySchema = ConsumptionSchema.shape.granularity;
export const GoalSchema = GoalOutSchema;
// GET /goal devuelve null cuando la vivienda no tiene meta.
export const GoalOrNullSchema = GoalSchema.nullable();
export const GoalInputSchema = GoalInSchema;
export const GoalProgressSchema = GoalProgressOutSchema;
export const GoalMetricSchema = GoalMetricProgressSchema;
export const GoalStatusSchema = GoalProgressSchema.shape.status;
export const TariffSchema = TariffOutSchema;
export const TariffsSchema = TariffSchema.array();
export const TariffSourceSchema = TariffRefSchema;
export type Reading = z.infer<typeof ReadingSchema>;
export type ReadingInput = z.input<typeof ReadingInputSchema>;
export type Consumption = z.infer<typeof ConsumptionSchema>;
export type ConsumptionBucketItem = z.infer<typeof ConsumptionBucketItemSchema>;
export type Granularity = z.infer<typeof GranularitySchema>;
export type Goal = z.infer<typeof GoalSchema>;
export type GoalInput = z.input<typeof GoalInputSchema>;
export type GoalProgress = z.infer<typeof GoalProgressSchema>;
export type GoalMetric = z.infer<typeof GoalMetricSchema>;
export type GoalStatus = z.infer<typeof GoalStatusSchema>;
export type Tariff = z.infer<typeof TariffSchema>;
export type TariffSource = z.infer<typeof TariffSourceSchema>;
