import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient, ContractError, parseErrorBody } from "./index";

const HOME = "11111111-1111-4111-8111-111111111111";
const home = (n: number) => ({ id: `${n.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`, code: null,
  name: "Home", address: null, city: null, distributor: "EDESUR", created_at: "2026-10-04T00:00:00Z" });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
afterEach(() => vi.useRealTimers());

describe("shared API transport", () => {
  it("passes the selected bill and rejects a response for a different period", async () => {
    const bill = "aaaaaaaa-0000-4000-8000-000000000001";
    const fetcher = vi.fn().mockResolvedValue(json({
      home: { id: HOME, code: null, name: "Home", distributor: "EDESUR" },
      latest_bill: null, comparison: null, projection: null, alert: null, recommendation: null,
      data_status: { bills_count: 0, data_source: "none", is_demo: false, insufficient_reasons: [] },
      quality_legend: {},
    }));
    await expect(createApiClient("http://api.test", fetcher).getDashboard(HOME, undefined, bill)).rejects.toBeInstanceOf(ContractError);
    expect(fetcher.mock.calls[0][0]).toBe(`http://api.test/api/v1/homes/${HOME}/dashboard?bill_id=${bill}`);
  });
  it("loads all pages without silently cutting off after 100 records", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(Array.from({ length: 100 }, (_, n) => home(n))))
      .mockResolvedValueOnce(json([home(100)]));
    expect(await createApiClient("http://api.test", fetcher).listHomes()).toHaveLength(101);
    expect(fetcher.mock.calls[1][0]).toContain("offset=100");
  });
  it("rejects a dashboard response for another home", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({
      home: { id: home(2).id, code: null, name: "Other", distributor: "EDESUR" },
      latest_bill: null, comparison: null, projection: null, alert: null, recommendation: null,
      data_status: { bills_count: 0, data_source: "none", is_demo: false, insufficient_reasons: [] },
      quality_legend: {},
    }));
    await expect(createApiClient("http://api.test", fetcher).getDashboard(HOME)).rejects.toBeInstanceOf(ContractError);
  });
  it("timeout covers body reading after headers have arrived", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => new Promise(() => {}) });
    const result = createApiClient("http://api.test", fetcher, 50).listHomes();
    const assertion = expect(result).rejects.toMatchObject({ status: 0 });
    await vi.advanceTimersByTimeAsync(51);
    await assertion;
  });
  it("propagates cancellation and structured field errors", async () => {
    const ctrl = new AbortController();
    const fetcher = vi.fn().mockImplementation(() => new Promise(() => {}));
    const result = createApiClient("http://api.test", fetcher).listHomes(ctrl.signal);
    ctrl.abort();
    await expect(result).rejects.toMatchObject({ status: 0 });
    expect(parseErrorBody(422, { detail: [{ loc: ["body", "kwh"], msg: "invalid" }], code: "validation_error", request_id: "test1234" }))
      .toMatchObject({ fieldErrors: { kwh: "invalid" }, code: "validation_error", requestId: "test1234" });
  });
});
