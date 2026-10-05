import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./index";

const HOME = "00000000-0000-0000-0000-000000000001";
const anomaly = {
  home_id: HOME,
  granularity: "month",
  severity: "warning",
  observed_kwh: "510.25",
  baseline_kwh: "400.00",
  delta_pct: "27.56",
  period_start: "2026-09-01",
  period_end: "2026-09-30",
  explanation: "El consumo observado supera la línea base histórica.",
};

describe("anomalies API", () => {
  it("requests monthly anomalies and preserves decimal values as strings", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([anomaly]), { status: 200 }));
    const result = await createApiClient("http://api.test", fetcher).listAnomalies(HOME, "month");
    expect(fetcher.mock.calls[0][0]).toBe(`http://api.test/api/v1/homes/${HOME}/anomalies?granularity=month`);
    expect(result[0]).toMatchObject({ observed_kwh: "510.25", baseline_kwh: "400.00", delta_pct: "27.56" });
  });
});
