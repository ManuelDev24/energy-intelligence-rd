import { describe, expect, it } from "vitest";
import {
  ConsumptionSchema, GoalInputSchema, GoalProgressSchema, GoalSchema, ReadingInputSchema, ReadingSchema,
  ReadingsSchema, TariffSchema, TariffsSchema,
} from "./index";

const HOME = "6fcbbeb0-7447-497c-bb32-d91b813939f2";

describe("phase 2 contracts", () => {
  it("parses readings and rejects naive datetimes", () => {
    const reading = {
      id: HOME, home_id: HOME, read_at: "2026-09-01T04:00:00Z", reading_kwh: "100.00",
      source: "manual", note: null, created_at: "2026-09-01T04:00:01Z",
    };
    expect(ReadingsSchema.parse([reading])[0].reading_kwh).toBe("100.00");
    expect(ReadingSchema.shape.source.safeParse("seed").success).toBe(false);
    expect(ReadingInputSchema.safeParse({ read_at: "2026-09-01T00:00:00-04:00", reading_kwh: "1500" }).success).toBe(true);
    expect(ReadingInputSchema.safeParse({ read_at: "2026-09-01T00:00:00", reading_kwh: "1500" }).success).toBe(false);
    // Límites numéricos (>= 0, formato decimal, no futuro, monotonía) los valida la API con 422:
    // el patrón Decimal de entrada generado no es estricto (limitación previa del generador).
  });

  it("keeps uncovered consumption buckets as null, never zero", () => {
    const empty = { start: "2026-09-04", end: "2026-09-04", kwh: null, quality: null, coverage_ratio: "0",
      reason_code: "no_coverage", reason: "Sin lecturas" };
    const parsed = ConsumptionSchema.parse({
      home_id: HOME, granularity: "day", from_date: "2026-09-04", to_date: "2026-09-04",
      timezone: "America/Santo_Domingo", buckets: [empty],
      totals: { kwh: null, covered_days: "0", coverage_ratio: "0" }, average_daily_kwh: null, peak_bucket: null,
      readings_used: 0, insufficient_reasons: ["x"], quality_legend: {},
    });
    expect(parsed.buckets[0].kwh).toBeNull();
    expect(parsed.resolution).toBe("meter_readings");
    expect(ConsumptionSchema.shape.granularity.safeParse("hour").success).toBe(false);
  });

  it("exposes goal status, tariff provenance and goal input", () => {
    expect(GoalProgressSchema.shape.status.safeParse("insufficient_data").success).toBe(true);
    expect(GoalProgressSchema.shape.status.safeParse("unknown").success).toBe(false);
    expect(GoalSchema.shape.monthly_kwh.parse(null)).toBeNull();
    expect(GoalInputSchema.safeParse({ monthly_kwh: "300" }).success).toBe(true);
    const tariff = TariffSchema.parse({
      id: HOME, distributor: "EDESUR", tariff_code: "BTS-1", effective_from: "2026-10-01", effective_to: "2026-12-31",
      flat_all_units_from_kwh: "701.00", fixed_charges: [{ from_kwh: "0.00", to_kwh: "100.00", amount_rd: "42.10" }],
      blocks: [{ from_kwh: "700.00", to_kwh: null, price_rd_per_kwh: "13.0900" }],
      source_resolution: "SIE-121-2026-TF", source_url: "https://sie.gob.do/document/sie-121-2026-tf/",
      scope_note: null,
    });
    expect(tariff.source_resolution).toBe("SIE-121-2026-TF");
    expect(TariffsSchema.parse([])).toEqual([]);
    expect(TariffSchema.shape.distributor.safeParse("Otra").success).toBe(false);
  });
});
