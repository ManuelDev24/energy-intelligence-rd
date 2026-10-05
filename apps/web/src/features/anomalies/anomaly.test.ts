import { describe, expect, it } from "vitest";
import { formatAnomaly } from "./anomaly";

const record = {
  home_id: "00000000-0000-0000-0000-000000000001",
  granularity: "month" as const,
  severity: "critical" as const,
  observed_kwh: "510.25",
  baseline_kwh: "400.00",
  delta_pct: "27.56",
  period_start: "2026-09-01",
  period_end: "2026-09-30",
  explanation: "El consumo observado supera la línea base histórica.",
};

describe("formatAnomaly", () => {
  it("formats API decimal strings without recalculating them", () => {
    expect(formatAnomaly(record)).toEqual({
      observed: "510.25 kWh",
      baseline: "400.00 kWh",
      delta: "+27.56%",
      period: "1–30 sep 2026",
      explanation: record.explanation,
    });
  });
});
