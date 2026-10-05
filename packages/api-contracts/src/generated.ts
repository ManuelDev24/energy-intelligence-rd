// Generated from Pydantic. Run npm run contracts:generate; do not edit.
import { z } from "zod";

export const HomeOutSchema = z.object({
  "province": z.union([z.string().min(1).max(120), z.null()]).default(null),
  "municipality": z.union([z.string().min(1).max(120), z.null()]).default(null),
  "sector": z.union([z.string().min(1).max(120), z.null()]).default(null),
  "user_type": z.union([z.string().min(1).max(120), z.null()]).default(null),
  "occupants": z.union([z.number().finite().int().min(1).max(999), z.null()]).default(null),
  "has_ac": z.union([z.boolean(), z.null()]).default(null),
  "has_water_heater": z.union([z.boolean(), z.null()]).default(null),
  "has_pool": z.union([z.boolean(), z.null()]).default(null),
  "has_solar": z.union([z.boolean(), z.null()]).default(null),
  "has_inverter": z.union([z.boolean(), z.null()]).default(null),
  "id": z.string().uuid(),
  "code": z.union([z.string(), z.null()]),
  "name": z.string(),
  "address": z.union([z.string(), z.null()]),
  "city": z.union([z.string(), z.null()]),
  "distributor": z.enum(["EDESUR", "EDENORTE", "EDEESTE", "Otra"]),
  "created_at": z.string().datetime({ offset: true })
});
export type HomeOut = z.infer<typeof HomeOutSchema>;

export const BillOutSchema = z.object({
  "id": z.string().uuid(),
  "home_id": z.string().uuid(),
  "period_start": z.string().date(),
  "period_end": z.string().date(),
  "kwh": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String),
  "amount_dop": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String),
  "days": z.number().finite().int(),
  "reading_previous": z.union([z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String), z.null()]),
  "reading_current": z.union([z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String), z.null()]),
  "source": z.enum(["manual", "seed"]),
  "created_at": z.string().datetime({ offset: true })
});
export type BillOut = z.infer<typeof BillOutSchema>;

export const MetricSchema = z.object({
  "value": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String),
  "unit": z.string(),
  "quality": z.enum(["REAL", "ESTIMATED", "PROJECTED"])
});
export type Metric = z.infer<typeof MetricSchema>;

export const ComparisonSchema = z.object({
  "previous_bill_id": z.string().uuid(),
  "previous_period_start": z.string().date(),
  "previous_period_end": z.string().date(),
  "kwh_delta": MetricSchema,
  "kwh_pct": z.union([MetricSchema, z.null()]),
  "amount_delta": MetricSchema,
  "amount_pct": z.union([MetricSchema, z.null()])
});
export type Comparison = z.infer<typeof ComparisonSchema>;

export const DashboardAlertSummarySchema = z.object({
  "severity": z.enum(["warning", "critical"]),
  "message": z.string(),
  "basis_period_start": z.string().date(),
  "basis_period_end": z.string().date()
});
export type DashboardAlertSummary = z.infer<typeof DashboardAlertSummarySchema>;

export const DashboardHomeSchema = z.object({
  "id": z.string().uuid(),
  "code": z.union([z.string(), z.null()]),
  "name": z.string(),
  "distributor": z.string()
});
export type DashboardHome = z.infer<typeof DashboardHomeSchema>;

export const DataStatusSchema = z.object({
  "bills_count": z.number().finite().int(),
  "data_source": z.enum(["manual", "seed", "mixed", "none"]),
  "is_demo": z.boolean(),
  "resolution": z.literal("monthly").default("monthly"),
  "hourly_data_available": z.boolean().default(false),
  "insufficient_reasons": z.array(z.string())
});
export type DataStatus = z.infer<typeof DataStatusSchema>;

export const LatestBillSchema = z.object({
  "bill_id": z.string().uuid(),
  "period_start": z.string().date(),
  "period_end": z.string().date(),
  "days": z.number().finite().int(),
  "kwh": MetricSchema,
  "amount_dop": MetricSchema,
  "avg_daily_kwh": z.union([MetricSchema, z.null()]),
  "avg_price_per_kwh": z.union([MetricSchema, z.null()]),
  "source": z.enum(["manual", "seed"])
});
export type LatestBill = z.infer<typeof LatestBillSchema>;

export const ProjectionOutSchema = z.object({
  "method": z.string(),
  "bills_used": z.number().finite().int(),
  "kwh": MetricSchema,
  "amount_dop": MetricSchema,
  "note": z.string()
});
export type ProjectionOut = z.infer<typeof ProjectionOutSchema>;

export const DashboardOutSchema = z.object({
  "home": DashboardHomeSchema,
  "latest_bill": z.union([LatestBillSchema, z.null()]),
  "comparison": z.union([ComparisonSchema, z.null()]),
  "projection": z.union([ProjectionOutSchema, z.null()]),
  "alert": z.union([DashboardAlertSummarySchema, z.null()]),
  "recommendation": z.union([z.string(), z.null()]),
  "data_status": DataStatusSchema,
  "quality_legend": z.record(z.string(), z.string())
});
export type DashboardOut = z.infer<typeof DashboardOutSchema>;

export const EquipmentOutSchema = z.object({
  "id": z.string().uuid(),
  "home_id": z.string().uuid(),
  "name": z.string(),
  "room": z.union([z.string(), z.null()]),
  "power_w": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String),
  "hours_per_day": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String),
  "created_at": z.string().datetime({ offset: true })
});
export type EquipmentOut = z.infer<typeof EquipmentOutSchema>;

export const EquipmentEstimateItemSchema = z.object({
  "equipment_id": z.string().uuid(),
  "name": z.string(),
  "room": z.union([z.string(), z.null()]),
  "daily_kwh": MetricSchema,
  "monthly_kwh": MetricSchema
});
export type EquipmentEstimateItem = z.infer<typeof EquipmentEstimateItemSchema>;

export const EquipmentEstimateOutSchema = z.object({
  "home_id": z.string().uuid(),
  "equipment_count": z.number().finite().int(),
  "items": z.array(EquipmentEstimateItemSchema),
  "total_daily_kwh": MetricSchema,
  "total_monthly_kwh": MetricSchema,
  "days_per_month": z.number().finite().int(),
  "latest_bill_kwh": z.union([MetricSchema, z.null()]),
  "bill_coverage_pct": z.union([MetricSchema, z.null()]),
  "note": z.string()
});
export type EquipmentEstimateOut = z.infer<typeof EquipmentEstimateOutSchema>;

export const AlertRecordSchema = z.object({
  "id": z.string().uuid(),
  "home_id": z.string().uuid(),
  "bill_id": z.union([z.string().uuid(), z.null()]),
  "type": z.string(),
  "severity": z.enum(["warning", "critical"]),
  "status": z.enum(["unread", "read", "dismissed"]),
  "message": z.string(),
  "kwh_pct": z.union([z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String), z.null()]),
  "threshold_pct": z.union([z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String), z.null()]),
  "basis_bill_id": z.union([z.string().uuid(), z.null()]),
  "basis_period_start": z.union([z.string().date(), z.null()]),
  "basis_period_end": z.union([z.string().date(), z.null()]),
  "created_at": z.string().datetime({ offset: true })
});
export type AlertRecord = z.infer<typeof AlertRecordSchema>;

export const AlertSettingsOutSchema = z.object({
  "home_id": z.string().uuid(),
  "warning_pct": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String),
  "critical_pct": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String)
});
export type AlertSettingsOut = z.infer<typeof AlertSettingsOutSchema>;

export const BillCreateSchema = z.object({
  "period_start": z.string().date(),
  "period_end": z.string().date(),
  "kwh": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*(?:\\d{0,10}|(?=[\\d.]{1,13}0*$)\\d{0,10}\\.\\d{0,2}0*$)")), z.number().finite()]).transform(String),
  "amount_dop": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*(?:\\d{0,10}|(?=[\\d.]{1,13}0*$)\\d{0,10}\\.\\d{0,2}0*$)")), z.number().finite()]).transform(String),
  "days": z.number().finite().int().min(0).max(366),
  "reading_previous": z.union([z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*(?:\\d{0,10}|(?=[\\d.]{1,13}0*$)\\d{0,10}\\.\\d{0,2}0*$)")), z.number().finite()]).transform(String), z.null()]).default(null),
  "reading_current": z.union([z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*(?:\\d{0,10}|(?=[\\d.]{1,13}0*$)\\d{0,10}\\.\\d{0,2}0*$)")), z.number().finite()]).transform(String), z.null()]).default(null),
  "source": z.literal("manual").default("manual")
});
export type BillCreate = z.infer<typeof BillCreateSchema>;

export const BillUpdateSchema = z.object({
  "period_start": z.string().date(),
  "period_end": z.string().date(),
  "kwh": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*(?:\\d{0,10}|(?=[\\d.]{1,13}0*$)\\d{0,10}\\.\\d{0,2}0*$)")), z.number().finite()]).transform(String),
  "amount_dop": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*(?:\\d{0,10}|(?=[\\d.]{1,13}0*$)\\d{0,10}\\.\\d{0,2}0*$)")), z.number().finite()]).transform(String),
  "days": z.number().finite().int().min(0).max(366),
  "reading_previous": z.union([z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*(?:\\d{0,10}|(?=[\\d.]{1,13}0*$)\\d{0,10}\\.\\d{0,2}0*$)")), z.number().finite()]).transform(String), z.null()]).default(null),
  "reading_current": z.union([z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*(?:\\d{0,10}|(?=[\\d.]{1,13}0*$)\\d{0,10}\\.\\d{0,2}0*$)")), z.number().finite()]).transform(String), z.null()]).default(null)
});
export type BillUpdate = z.infer<typeof BillUpdateSchema>;

export const EquipmentInSchema = z.object({
  "name": z.string().min(1).max(120),
  "room": z.union([z.string().max(80), z.null()]).default(null),
  "power_w": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*(?:\\d{0,8}|(?=[\\d.]{1,11}0*$)\\d{0,8}\\.\\d{0,2}0*$)")), z.number().finite()]).transform(String),
  "hours_per_day": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*(?:\\d{0,2}|(?=[\\d.]{1,5}0*$)\\d{0,2}\\.\\d{0,2}0*$)")), z.number().finite()]).transform(String)
});
export type EquipmentIn = z.infer<typeof EquipmentInSchema>;

export const AlertSettingsInSchema = z.object({
  "warning_pct": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*(?:\\d{0,4}|(?=[\\d.]{1,7}0*$)\\d{0,4}\\.\\d{0,2}0*$)")), z.number().finite()]).transform(String),
  "critical_pct": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*(?:\\d{0,4}|(?=[\\d.]{1,7}0*$)\\d{0,4}\\.\\d{0,2}0*$)")), z.number().finite()]).transform(String)
});
export type AlertSettingsIn = z.infer<typeof AlertSettingsInSchema>;

export const AlertStatusUpdateSchema = z.object({
  "status": z.enum(["unread", "read", "dismissed"])
});
export type AlertStatusUpdate = z.infer<typeof AlertStatusUpdateSchema>;

export const UserOutSchema = z.object({
  "id": z.string().uuid(),
  "email": z.string(),
  "role": z.enum(["user", "admin", "support"]),
  "created_at": z.string().datetime({ offset: true }),
  "terms_version": z.union([z.string(), z.null()]).default(null),
  "terms_accepted_at": z.union([z.string().datetime({ offset: true }), z.null()]).default(null)
});
export type UserOut = z.infer<typeof UserOutSchema>;

export const TokensOutSchema = z.object({
  "access_token": z.string(),
  "refresh_token": z.string(),
  "token_type": z.literal("bearer").default("bearer"),
  "expires_in": z.number().finite().int()
});
export type TokensOut = z.infer<typeof TokensOutSchema>;

export const ReadingOutSchema = z.object({
  "id": z.string().uuid(),
  "home_id": z.string().uuid(),
  "read_at": z.string().datetime({ offset: true }),
  "reading_kwh": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String),
  "source": z.literal("manual"),
  "note": z.union([z.string(), z.null()]),
  "created_at": z.string().datetime({ offset: true })
});
export type ReadingOut = z.infer<typeof ReadingOutSchema>;

export const ReadingCreateSchema = z.object({
  "read_at": z.string().datetime({ offset: true }),
  "reading_kwh": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*(?:\\d{0,10}|(?=[\\d.]{1,13}0*$)\\d{0,10}\\.\\d{0,2}0*$)")), z.number().finite()]).transform(String),
  "note": z.union([z.string().max(255), z.null()]).default(null),
  "source": z.literal("manual").default("manual")
});
export type ReadingCreate = z.infer<typeof ReadingCreateSchema>;

export const ConsumptionBucketSchema = z.object({
  "start": z.string().date(),
  "end": z.string().date(),
  "kwh": z.union([z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String), z.null()]),
  "quality": z.union([z.enum(["REAL", "ESTIMATED", "PROJECTED"]), z.null()]),
  "coverage_ratio": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String),
  "reason_code": z.union([z.enum(["no_coverage", "partial_coverage"]), z.null()]),
  "reason": z.union([z.string(), z.null()])
});
export type ConsumptionBucket = z.infer<typeof ConsumptionBucketSchema>;

export const ConsumptionTotalsSchema = z.object({
  "kwh": z.union([MetricSchema, z.null()]),
  "covered_days": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String),
  "coverage_ratio": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String)
});
export type ConsumptionTotals = z.infer<typeof ConsumptionTotalsSchema>;

export const ConsumptionOutSchema = z.object({
  "home_id": z.string().uuid(),
  "granularity": z.enum(["day", "week", "month"]),
  "from_date": z.string().date(),
  "to_date": z.string().date(),
  "timezone": z.string(),
  "buckets": z.array(ConsumptionBucketSchema),
  "totals": ConsumptionTotalsSchema,
  "average_daily_kwh": z.union([MetricSchema, z.null()]),
  "peak_bucket": z.union([ConsumptionBucketSchema, z.null()]),
  "readings_used": z.number().finite().int(),
  "resolution": z.literal("meter_readings").default("meter_readings"),
  "hourly_data_available": z.boolean().default(false),
  "insufficient_reasons": z.array(z.string()),
  "quality_legend": z.record(z.string(), z.string())
});
export type ConsumptionOut = z.infer<typeof ConsumptionOutSchema>;

export const GoalOutSchema = z.object({
  "home_id": z.string().uuid(),
  "monthly_amount_rd": z.union([z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String), z.null()]),
  "monthly_kwh": z.union([z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String), z.null()]),
  "updated_at": z.string().datetime({ offset: true })
});
export type GoalOut = z.infer<typeof GoalOutSchema>;

export const GoalInSchema = z.object({
  "monthly_amount_rd": z.union([z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*(?:\\d{0,10}|(?=[\\d.]{1,13}0*$)\\d{0,10}\\.\\d{0,2}0*$)")), z.number().finite()]).transform(String), z.null()]).default(null),
  "monthly_kwh": z.union([z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*(?:\\d{0,10}|(?=[\\d.]{1,13}0*$)\\d{0,10}\\.\\d{0,2}0*$)")), z.number().finite()]).transform(String), z.null()]).default(null)
});
export type GoalIn = z.infer<typeof GoalInSchema>;

export const TariffRefSchema = z.object({
  "tariff_id": z.string().uuid(),
  "distributor": z.enum(["EDESUR", "EDENORTE", "EDEESTE"]),
  "tariff_code": z.string(),
  "effective_from": z.string().date(),
  "effective_to": z.union([z.string().date(), z.null()]),
  "source_resolution": z.string(),
  "source_url": z.union([z.string(), z.null()])
});
export type TariffRef = z.infer<typeof TariffRefSchema>;

export const GoalMetricProgressSchema = z.object({
  "target": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String),
  "unit": z.string(),
  "so_far": z.union([MetricSchema, z.null()]),
  "projected": z.union([MetricSchema, z.null()]),
  "percent_so_far": z.union([z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String), z.null()]),
  "percent_projected": z.union([z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String), z.null()]),
  "status": z.enum(["on_track", "at_risk", "exceeded", "insufficient_data"]),
  "basis": z.union([z.enum(["readings", "bills_prorated", "tariff", "bill_average_price"]), z.null()]),
  "projection_method": z.union([z.enum(["run_rate_readings", "linear_least_squares"]), z.null()]),
  "tariff": z.union([TariffRefSchema, z.null()]),
  "reasons": z.array(z.string())
});
export type GoalMetricProgress = z.infer<typeof GoalMetricProgressSchema>;

export const GoalProgressOutSchema = z.object({
  "home_id": z.string().uuid(),
  "month_start": z.string().date(),
  "month_end": z.string().date(),
  "as_of": z.string().date(),
  "timezone": z.string(),
  "goal": z.union([GoalOutSchema, z.null()]),
  "status": z.enum(["on_track", "at_risk", "exceeded", "insufficient_data"]),
  "data_source": z.enum(["readings", "bills", "none"]),
  "kwh": z.union([GoalMetricProgressSchema, z.null()]),
  "amount": z.union([GoalMetricProgressSchema, z.null()]),
  "reasons": z.array(z.string()),
  "quality_legend": z.record(z.string(), z.string())
});
export type GoalProgressOut = z.infer<typeof GoalProgressOutSchema>;

export const TariffBlockOutSchema = z.object({
  "from_kwh": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String),
  "to_kwh": z.union([z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String), z.null()]),
  "price_rd_per_kwh": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String)
});
export type TariffBlockOut = z.infer<typeof TariffBlockOutSchema>;

export const TariffFixedChargeOutSchema = z.object({
  "from_kwh": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String),
  "to_kwh": z.union([z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String), z.null()]),
  "amount_rd": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String)
});
export type TariffFixedChargeOut = z.infer<typeof TariffFixedChargeOutSchema>;

export const TariffOutSchema = z.object({
  "id": z.string().uuid(),
  "distributor": z.enum(["EDESUR", "EDENORTE", "EDEESTE"]),
  "tariff_code": z.string(),
  "effective_from": z.string().date(),
  "effective_to": z.union([z.string().date(), z.null()]),
  "flat_all_units_from_kwh": z.union([z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String), z.null()]),
  "fixed_charges": z.array(TariffFixedChargeOutSchema),
  "blocks": z.array(TariffBlockOutSchema),
  "source_resolution": z.string(),
  "source_url": z.union([z.string(), z.null()]),
  "scope_note": z.union([z.string(), z.null()])
});
export type TariffOut = z.infer<typeof TariffOutSchema>;

export const ContractInSchema = z.object({
  "account_number": z.string().min(1).max(120)
});
export type ContractIn = z.infer<typeof ContractInSchema>;

export const ContractOutSchema = z.object({
  "home_id": z.string().uuid(),
  "account_number": z.string(),
  "updated_at": z.string().datetime({ offset: true })
});
export type ContractOut = z.infer<typeof ContractOutSchema>;

export const BillItemInSchema = z.object({
  "label": z.string().min(1).max(200),
  "kind": z.enum(["charge", "discount"]),
  "amount_dop": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*(?:\\d{0,10}|(?=[\\d.]{1,13}0*$)\\d{0,10}\\.\\d{0,2}0*$)")), z.number().finite()]).transform(String)
});
export type BillItemIn = z.infer<typeof BillItemInSchema>;

export const BillItemsReplaceSchema = z.object({
  "items": z.array(BillItemInSchema).max(100)
});
export type BillItemsReplace = z.infer<typeof BillItemsReplaceSchema>;

export const BillItemOutSchema = z.object({
  "position": z.number().finite().int(),
  "label": z.string(),
  "kind": z.enum(["charge", "discount"]),
  "amount_dop": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String)
});
export type BillItemOut = z.infer<typeof BillItemOutSchema>;

export const BillItemsOutSchema = z.object({
  "home_id": z.string().uuid(),
  "bill_id": z.string().uuid(),
  "items": z.array(BillItemOutSchema),
  "items_total_dop": z.union([z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String), z.null()]),
  "bill_amount_dop": z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String),
  "difference_dop": z.union([z.union([z.string().regex(new RegExp("^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$")), z.number().finite()]).transform(String), z.null()])
});
export type BillItemsOut = z.infer<typeof BillItemsOutSchema>;

export const BillCheckSchema = z.object({
  "code": z.string(),
  "status": z.enum(["pass", "warning", "unavailable"]),
  "observed": z.record(z.string(), z.unknown())
});
export type BillCheck = z.infer<typeof BillCheckSchema>;

export const BillCorrectionSchema = z.object({
  "entity": z.enum(["bills", "bill_items"]),
  "operation": z.string(),
  "before": z.union([z.record(z.string(), z.unknown()), z.null()]),
  "after": z.union([z.record(z.string(), z.unknown()), z.null()]),
  "created_at": z.string().datetime({ offset: true })
});
export type BillCorrection = z.infer<typeof BillCorrectionSchema>;

export const BillProvenanceSchema = z.object({
  "origin": z.enum(["creation", "migration", "unknown"]),
  "original_available": z.boolean(),
  "data": z.union([z.record(z.string(), z.unknown()), z.null()]),
  "captured_at": z.union([z.string().datetime({ offset: true }), z.null()])
});
export type BillProvenance = z.infer<typeof BillProvenanceSchema>;

export const BillAssessmentSchema = z.object({
  "home_id": z.string().uuid(),
  "bill_id": z.string().uuid(),
  "read_only": z.literal(true).default(true),
  "approval": z.literal("not_performed").default("not_performed"),
  "status": z.enum(["consistent", "warnings", "incomplete"]),
  "checks": z.array(BillCheckSchema),
  "warnings": z.array(z.string()),
  "provenance": BillProvenanceSchema,
  "corrections": z.array(BillCorrectionSchema),
  "corrections_has_more": z.boolean(),
  "detail": BillItemsOutSchema
});
export type BillAssessment = z.infer<typeof BillAssessmentSchema>;

export const RegisterInSchema = z.object({
  "email": z.string().max(254),
  "password": z.string().min(12).max(128),
  "accept_terms": z.literal(true)
});
export type RegisterIn = z.infer<typeof RegisterInSchema>;

export const AccountDeletionInSchema = z.object({
  "password": z.string().min(12).max(128)
});
export type AccountDeletionIn = z.infer<typeof AccountDeletionInSchema>;

export const LegalOutSchema = z.object({
  "terms_version": z.string(),
  "privacy_version": z.string(),
  "status": z.literal("draft")
});
export type LegalOut = z.infer<typeof LegalOutSchema>;

export const PasswordForgotInSchema = z.object({
  "email": z.string().max(254)
});
export type PasswordForgotIn = z.infer<typeof PasswordForgotInSchema>;

export const PasswordForgotAcceptedSchema = z.object({
  "status": z.literal("accepted")
});
export type PasswordForgotAccepted = z.infer<typeof PasswordForgotAcceptedSchema>;

export const PasswordResetInSchema = z.object({
  "token": z.string().regex(new RegExp("^[A-Za-z0-9_-]{43}$")).min(43).max(43),
  "new_password": z.string().min(12).max(128)
});
export type PasswordResetIn = z.infer<typeof PasswordResetInSchema>;
