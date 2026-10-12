import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./index";

const HOME = "00000000-0000-0000-0000-000000000001";
const ID = "00000000-0000-0000-0000-0000000000a1";
const row = {
  id: ID, home_id: HOME, equipment_id: null, anomaly_id: null, rule_id: "ac-one-hour", rule_version: 1, ruleset_version: 1, category: "equipment",
  title: "Una hora menos de aire acondicionado al día (Sala)", summary: "Sala usa unas 6 h al día.", action: "Sube el termostato.", confidence: "medium",
  status: "active", savings_kwh_month: "45.00", savings_dop_month: "585.00", assumptions: ["Potencia nominal."], evidence: { power_w: "1500" },
  created_at: "2026-10-11T12:00:00Z", last_seen_at: "2026-10-11T12:00:00Z", status_changed_at: "2026-10-11T12:00:00Z",
};
const list = { home_id: HOME, ruleset_version: 1, items: [row], total_savings_kwh_month: { value: "45.00", unit: "kWh/mes", quality: "ESTIMATED" },
  total_savings_dop_month: { value: "585.00", unit: "RD$/mes", quality: "ESTIMATED" }, note: "Ahorro ESTIMADO." };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("recommendations API (ERD-SAVE-01)", () => {
  it("lists active ones by default and keeps decimals as strings", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(list));
    const result = await createApiClient("http://api.test", fetcher).listRecommendations(HOME);
    expect(fetcher.mock.calls[0][0]).toBe(`http://api.test/api/v1/homes/${HOME}/recommendations`);
    expect(result.items[0]).toMatchObject({ savings_kwh_month: "45.00", savings_dop_month: "585.00" });
    expect(result.total_savings_kwh_month?.quality).toBe("ESTIMATED");
  });

  it("sends only the given filters and refreshes with POST", async () => {
    const fetcher = vi.fn().mockImplementation(async () => json(list));   // una Response nueva por llamada: el cuerpo se lee una sola vez
    const api = createApiClient("http://api.test", fetcher);
    await api.listRecommendations(HOME, { status: "all", limit: 5 });
    expect(fetcher.mock.calls[0][0]).toBe(`http://api.test/api/v1/homes/${HOME}/recommendations?status=all&limit=5`);
    await api.refreshRecommendations(HOME);
    expect(fetcher.mock.calls[1][0]).toBe(`http://api.test/api/v1/homes/${HOME}/recommendations/refresh`);
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: "POST" });
  });

  it("accepts a recommendation without savings (goal, anomaly, data)", async () => {
    const goal = { ...row, category: "goal", rule_id: "goal-gap", savings_kwh_month: null, savings_dop_month: null };
    const out = await createApiClient("http://api.test", vi.fn().mockResolvedValue(json({ ...list, items: [goal], total_savings_kwh_month: null, total_savings_dop_month: null }))).listRecommendations(HOME);
    expect(out.items[0].savings_kwh_month).toBeNull();
  });

  it("rejects unknown categories, a foreign home and malformed rows", async () => {
    const api = (body: unknown) => createApiClient("http://api.test", vi.fn().mockResolvedValue(json(body))).listRecommendations(HOME);
    await expect(api({ ...list, items: [{ ...row, category: "mystery" }] })).rejects.toMatchObject({ code: "invalid_response" });
    await expect(api({ ...list, home_id: "00000000-0000-0000-0000-000000000002" })).rejects.toMatchObject({ code: "invalid_response" });
    await expect(api({ ...list, items: [{ ...row, id: undefined }] })).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("updates one and rejects an answer for another id", async () => {
    const ok = createApiClient("http://api.test", vi.fn().mockResolvedValue(json({ ...row, status: "applied" })));
    expect((await ok.updateRecommendation(HOME, ID, "applied")).status).toBe("applied");
    const other = createApiClient("http://api.test", vi.fn().mockResolvedValue(json({ ...row, id: "00000000-0000-0000-0000-0000000000b2" })));
    await expect(other.updateRecommendation(HOME, ID, "dismissed")).rejects.toMatchObject({ code: "invalid_response" });
  });
});
