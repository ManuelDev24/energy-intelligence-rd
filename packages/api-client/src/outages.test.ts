import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./index";

const HOME = "00000000-0000-0000-0000-000000000001";
const ID = "00000000-0000-0000-0000-0000000000a1";
const row = (over: Record<string, unknown> = {}) => ({
  id: ID, home_id: HOME, started_at: "2026-10-11T18:30:00Z", ended_at: "2026-10-11T20:00:00Z", cause: "utility_fault", note: null, source: "manual",
  created_at: "2026-10-11T21:00:00Z", updated_at: "2026-10-11T21:00:00Z", ongoing: false, duration_minutes: 90, ...over,
});
const month = (key: string, count = 0) => ({ month: key, count, total_minutes: count * 90, longest_minutes: count ? 90 : 0, average_minutes: count ? 90 : null, ongoing: 0 });
const summary = (over: Record<string, unknown> = {}) => ({
  home_id: HOME, timezone: "America/Santo_Domingo", from_month: "2026-09", to_month: "2026-10", months: [month("2026-09"), month("2026-10", 1)],
  totals: { count: 1, total_minutes: 90, longest_minutes: 90, average_minutes: 90, ongoing: 0 }, note: "a mano", ...over,
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const fresh = (value: unknown, status = 200) => vi.fn().mockImplementation(async () => json(value, status));
const input = { started_at: "2026-10-11T14:30:00-04:00", ended_at: null, cause: "weather" as const, note: null };

describe("outages API (ERD-INT-01)", () => {
  it("lists the history (paginated) and reads the monthly summary", async () => {
    const fetcher = fresh([row()]);
    const api = createApiClient("http://api.test", fetcher);
    const list = await api.listOutages(HOME);
    expect(fetcher.mock.calls[0][0]).toBe(`http://api.test/api/v1/homes/${HOME}/outages?limit=100&offset=0`);
    expect(list[0]).toMatchObject({ duration_minutes: 90, ongoing: false });
    const s = await createApiClient("http://api.test", fresh(summary())).getOutageSummary(HOME, 6);
    expect(s.months).toHaveLength(2);
    expect(s.months[0].average_minutes).toBeNull();
  });

  it("asks for the requested number of months", async () => {
    const fetcher = fresh(summary());
    await createApiClient("http://api.test", fetcher).getOutageSummary(HOME, 6);
    expect(fetcher.mock.calls[0][0]).toBe(`http://api.test/api/v1/homes/${HOME}/outages/summary?months=6`);
  });

  it("accepts an open outage with no duration", async () => {
    const open = row({ ended_at: null, ongoing: true, duration_minutes: null });
    const [o] = await createApiClient("http://api.test", fresh([open])).listOutages(HOME);
    expect(o).toMatchObject({ ongoing: true, duration_minutes: null, ended_at: null });
  });

  it("creates with POST, replaces with PUT and deletes with DELETE", async () => {
    const fetcher = fresh(row(), 201);
    const api = createApiClient("http://api.test", fetcher);
    await api.createOutage(HOME, input);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(input);
    const put = fresh(row());
    await createApiClient("http://api.test", put).updateOutage(HOME, ID, input);
    expect(put.mock.calls[0][0]).toBe(`http://api.test/api/v1/homes/${HOME}/outages/${ID}`);
    expect(put.mock.calls[0][1]).toMatchObject({ method: "PUT" });
    const del = vi.fn().mockImplementation(async () => new Response(null, { status: 204 }));
    await createApiClient("http://api.test", del).deleteOutage(HOME, ID);
    expect(del.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
  });

  it("rejects a foreign home, an unknown cause and a malformed summary", async () => {
    const api = (body: unknown) => createApiClient("http://api.test", fresh(body));
    await expect(api([row({ home_id: "00000000-0000-0000-0000-000000000002" })]).listOutages(HOME)).rejects.toMatchObject({ code: "invalid_response" });
    await expect(api([row({ cause: "rayo" })]).listOutages(HOME)).rejects.toMatchObject({ code: "invalid_response" });
    await expect(api(summary({ months: [{ month: "2026-10" }] })).getOutageSummary(HOME)).rejects.toMatchObject({ code: "invalid_response" });
    await expect(api(summary({ home_id: "00000000-0000-0000-0000-000000000002" })).getOutageSummary(HOME)).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("surfaces a 409 overlap as an API error", async () => {
    const conflict = createApiClient("http://api.test", fresh({ detail: "Ya hay una interrupción registrada que se solapa", code: "conflict" }, 409));
    await expect(conflict.createOutage(HOME, input)).rejects.toMatchObject({ status: 409 });
  });
});
