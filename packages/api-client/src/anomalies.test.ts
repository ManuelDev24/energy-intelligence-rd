import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./index";

const HOME = "00000000-0000-0000-0000-000000000001";
const ID = "00000000-0000-0000-0000-0000000000a1";
const anomaly = {
  id: ID, home_id: HOME, bill_id: null, kind: "increase", source: "readings", granularity: "month", severity: "warning", confidence: "medium",
  status: "open", observed_kwh: "510.25", baseline_kwh: "400.00", delta_pct: "27.56", days: "30.00", period_start: "2026-09-01",
  period_end: "2026-09-30", explanation: "El consumo observado supera la línea base histórica.",
  detected_at: "2026-10-01T12:00:00Z", last_seen_at: "2026-10-02T12:00:00Z",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("anomalies API (ERD-ANOM-01-COMPLETE)", () => {
  it("lists the active ones by default and preserves decimal values as strings", async () => {
    const fetcher = vi.fn().mockResolvedValue(json([anomaly]));
    const result = await createApiClient("http://api.test", fetcher).listAnomalies(HOME);
    expect(fetcher.mock.calls[0][0]).toBe(`http://api.test/api/v1/homes/${HOME}/anomalies`);
    expect(result[0]).toMatchObject({ observed_kwh: "510.25", baseline_kwh: "400.00", delta_pct: "27.56", confidence: "medium" });
  });

  it("sends only the filters that were given", async () => {
    const fetcher = vi.fn().mockResolvedValue(json([]));
    await createApiClient("http://api.test", fetcher).listAnomalies(HOME, { status: "all", kind: "peak", limit: 5 });
    expect(fetcher.mock.calls[0][0]).toBe(`http://api.test/api/v1/homes/${HOME}/anomalies?status=all&kind=peak&limit=5`);
  });

  it("accepts a night anomaly without a percentage", async () => {
    const night = { ...anomaly, kind: "night", granularity: "day", delta_pct: null, severity: "info" };
    const [result] = await createApiClient("http://api.test", vi.fn().mockResolvedValue(json([night]))).listAnomalies(HOME);
    expect(result.delta_pct).toBeNull();
  });

  it("rejects unknown kinds, a foreign home and malformed rows", async () => {
    const api = (body: unknown) => createApiClient("http://api.test", vi.fn().mockResolvedValue(json(body))).listAnomalies(HOME);
    await expect(api([{ ...anomaly, kind: "mystery" }])).rejects.toMatchObject({ code: "invalid_response" });
    await expect(api([{ ...anomaly, home_id: "00000000-0000-0000-0000-000000000002" }])).rejects.toMatchObject({ code: "invalid_response" });
    await expect(api([{ ...anomaly, id: undefined }])).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("updates the status with PATCH and checks that the answer is the same anomaly", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ ...anomaly, status: "dismissed" }));
    const updated = await createApiClient("http://api.test", fetcher).updateAnomaly(HOME, ID, "dismissed");
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`http://api.test/api/v1/homes/${HOME}/anomalies/${ID}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ status: "dismissed" });
    expect(updated.status).toBe("dismissed");
    const other = createApiClient("http://api.test", vi.fn().mockResolvedValue(json({ ...anomaly, id: "00000000-0000-0000-0000-0000000000a2" })));
    await expect(other.updateAnomaly(HOME, ID, "open")).rejects.toMatchObject({ code: "invalid_response" });
  });
});
