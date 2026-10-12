import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./index";

const HOME = "00000000-0000-4000-8000-000000000001";
const component = (key: string, score: number | null) => ({ key, label: key, weight: 25, score, available: score !== null, summary: "s", detail: "d", inputs: {}, reasons: [], next_step: "n" });
const body = (over: Record<string, unknown> = {}) => ({
  home_id: HOME, score_version: 1, as_of: "2026-10-11", status: "ok", score: 72, band: "good", band_label: "Bueno", quality: "INFERRED", coverage_pct: 100,
  components: [component("consumption", 80), component("efficiency", 67), component("habits", null), component("consistency", 55)], reasons: [], method: "m", note: "n", ...over,
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const client = (value: unknown, status = 200) => createApiClient("http://api.test", vi.fn().mockResolvedValue(json(value, status)));

describe("Energy Score API (ERD-SCORE-01)", () => {
  it("reads the score from the home path and keeps unavailable components as null", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(body()));
    const out = await createApiClient("http://api.test", fetcher).getEnergyScore(HOME);
    expect(fetcher.mock.calls[0][0]).toBe(`http://api.test/api/v1/homes/${HOME}/energy-score`);
    expect(out).toMatchObject({ score: 72, band: "good", quality: "INFERRED" });
    expect(out.components[2]).toMatchObject({ score: null, available: false });
  });

  it("accepts the insufficient-data shape with no score and no band", async () => {
    const out = await client(body({ status: "insufficient_data", score: null, band: null, band_label: null, coverage_pct: 0, reasons: ["faltan datos"] })).getEnergyScore(HOME);
    expect(out.score).toBeNull();
  });

  it("rejects a foreign home, an unknown band, a non-integer score and a missing field", async () => {
    await expect(client(body({ home_id: "00000000-0000-4000-8000-000000000002" })).getEnergyScore(HOME)).rejects.toMatchObject({ code: "invalid_response" });
    await expect(client(body({ band: "excelente" })).getEnergyScore(HOME)).rejects.toMatchObject({ code: "invalid_response" });
    await expect(client(body({ score: 72.5 })).getEnergyScore(HOME)).rejects.toMatchObject({ code: "invalid_response" });
    await expect(client(body({ components: undefined })).getEnergyScore(HOME)).rejects.toMatchObject({ code: "invalid_response" });
  });
});
