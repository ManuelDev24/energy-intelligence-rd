import { describe, expect, it } from "vitest";
import { formatAnomaly } from "./anomaly";

const record = {
  id: "00000000-0000-0000-0000-0000000000a1", home_id: "00000000-0000-0000-0000-000000000001", bill_id: null, kind: "increase" as const,
  source: "readings" as const, granularity: "month" as const, severity: "critical" as const, confidence: "high" as const, status: "open" as const,
  observed_kwh: "510.25", baseline_kwh: "400.00", delta_pct: "27.56", days: "30.00", period_start: "2026-09-01", period_end: "2026-09-30",
  explanation: "El consumo observado supera la línea base histórica.", detected_at: "2026-10-01T12:00:00Z", last_seen_at: "2026-10-02T12:00:00Z",
};

describe("formatAnomaly", () => {
  it("formats API decimal strings without recalculating them", () => {
    expect(formatAnomaly(record)).toMatchObject({
      title: "Consumo más alto de lo habitual", confidence: "Confianza alta", observed: "510.25 kWh", baseline: "400.00 kWh",
      baselineLabel: "Línea base", delta: "+27.56%", period: "1–30 sep 2026", explanation: record.explanation,
    });
  });
  it("keeps the sign of a drop and has no percentage for a night anomaly", () => {
    expect(formatAnomaly({ ...record, kind: "drop", delta_pct: "-43.33" }).delta).toBe("-43.33%");
    const night = formatAnomaly({ ...record, kind: "night", delta_pct: null });
    expect(night.delta).toBeNull();
    expect(night.baselineLabel).toBe("Al ritmo promedio");
  });
});
