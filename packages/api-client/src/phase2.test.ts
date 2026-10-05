import { describe, expect, it, vi } from "vitest";
import { createApiClient, ContractError } from "./index";

const HOME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const READING = "33333333-3333-4333-8333-333333333333";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const reading = { id: READING, home_id: HOME, read_at: "2026-10-01T08:00:00-04:00", reading_kwh: "1200.00",
  source: "manual", note: null, created_at: "2026-10-01T12:00:00Z" };

describe("phase 2 endpoints", () => {
  it("creates a reading with a POST body and parses the contract", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(reading, 201));
    const api = createApiClient("http://api.test", fetcher);
    const created = await api.createReading(HOME, { read_at: reading.read_at, reading_kwh: "1200" });
    expect(created.id).toBe(READING);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`http://api.test/api/v1/homes/${HOME}/readings`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({ read_at: reading.read_at, reading_kwh: "1200" });
  });

  it("rejects a reading that belongs to another home", async () => {
    const fetcher = vi.fn().mockResolvedValue(json([{ ...reading, home_id: OTHER }]));
    await expect(createApiClient("http://api.test", fetcher).listReadings(HOME)).rejects.toBeInstanceOf(ContractError);
  });

  it("deletes a reading by id", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await createApiClient("http://api.test", fetcher).deleteReading(HOME, READING);
    expect(fetcher.mock.calls[0][0]).toBe(`http://api.test/api/v1/homes/${HOME}/readings/${READING}`);
    expect(fetcher.mock.calls[0][1].method).toBe("DELETE");
  });

  it("encodes consumption query parameters (from/to/granularity)", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({}));
    await createApiClient("http://api.test", fetcher)
      .getConsumption(HOME, { granularity: "week", from: "2026-09-01", to: "2026-09-30" }).catch(() => undefined);
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.pathname).toBe(`/api/v1/homes/${HOME}/consumption`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ granularity: "week", from: "2026-09-01", to: "2026-09-30" });
  });

  it("rejects malformed consumption dates before calling the API", async () => {
    const fetcher = vi.fn();
    await expect(createApiClient("http://api.test", fetcher)
      .getConsumption(HOME, { granularity: "day", from: "2026/09/01", to: "2026-09-30" })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns null when the home has no goal and PUTs a goal", async () => {
    const goal = { home_id: HOME, monthly_amount_rd: "3000.00", monthly_kwh: null, updated_at: "2026-10-04T12:00:00Z" };
    const fetcher = vi.fn().mockResolvedValueOnce(json(null)).mockResolvedValueOnce(json(goal));
    const api = createApiClient("http://api.test", fetcher);
    expect(await api.getGoal(HOME)).toBeNull();
    const saved = await api.putGoal(HOME, { monthly_amount_rd: "3000", monthly_kwh: null });
    expect(saved?.monthly_amount_rd).toBe("3000.00");
    expect(fetcher.mock.calls[1][0]).toBe(`http://api.test/api/v1/homes/${HOME}/goal`);
    expect(fetcher.mock.calls[1][1].method).toBe("PUT");
  });

  it("requests goal progress, optionally for a date", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({}));
    const api = createApiClient("http://api.test", fetcher);
    await api.getGoalProgress(HOME, { on: "2026-10-15" }).catch(() => undefined);
    expect(fetcher.mock.calls[0][0]).toBe(`http://api.test/api/v1/homes/${HOME}/goal/progress?on=2026-10-15`);
  });

  it("lists published tariffs filtered by distributor and date", async () => {
    const fetcher = vi.fn().mockResolvedValue(json([]));
    expect(await createApiClient("http://api.test", fetcher).listTariffs({ distributor: "EDESUR", on: "2026-11-01" })).toEqual([]);
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/v1/tariffs");
    expect(url.searchParams.get("distributor")).toBe("EDESUR");
    expect(url.searchParams.get("on")).toBe("2026-11-01");
  });
});
