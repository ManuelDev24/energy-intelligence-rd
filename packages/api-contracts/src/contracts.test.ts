import { describe, expect, it } from "vitest";
import { BillSchema, HomeSchema, MetricSchema } from "./index";

describe("generated runtime contracts", () => {
  it("rejects invalid decimal strings and infinite values", () => {
    for (const value of ["abc", "NaN", "Infinity", Infinity]) {
      expect(MetricSchema.safeParse({ value, unit: "kWh", quality: "REAL" }).success).toBe(false);
    }
    expect(MetricSchema.parse({ value: "99999999999800.00", unit: "%", quality: "REAL" }).value).toBe("99999999999800.00");
  });
  it("validates calendar dates and source enums from the backend", () => {
    expect(BillSchema.shape.period_end.safeParse("2026-02-30").success).toBe(false);
    expect(BillSchema.shape.source.safeParse("invented").success).toBe(false);
    expect(HomeSchema.shape.distributor.safeParse("EDESUR").success).toBe(true);
  });
});
