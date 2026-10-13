import { describe, expect, it, vi } from "vitest";
import { createApiClient, ContractError } from "./index";

const HOME = "11111111-1111-4111-8111-111111111111";
const BILL = "44444444-4444-4444-8444-444444444444";
const OTHER = "22222222-2222-4222-8222-222222222222";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const detail = { home_id: HOME, bill_id: BILL, items: [{ position: 0, label: "Cargo fijo", kind: "charge", amount_dop: "42.10" }],
  items_total_dop: "42.10", bill_amount_dop: "1768.09", difference_dop: "-1725.99" };

describe("bill detail endpoints", () => {
  it("reads bill items under the home-scoped bill path", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(detail));
    const parsed = await createApiClient("http://api.test", fetcher).getBillItems(HOME, BILL);
    expect(parsed.items_total_dop).toBe("42.10");
    expect(fetcher.mock.calls[0][0]).toBe(`http://api.test/api/v1/homes/${HOME}/bills/${BILL}/items`);
  });

  it("replaces items with a PUT body", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(detail));
    await createApiClient("http://api.test", fetcher).putBillItems(HOME, BILL, { items: [{ label: "Cargo fijo", kind: "charge", amount_dop: "42.10" }] });
    const [, init] = fetcher.mock.calls[0];
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ items: [{ label: "Cargo fijo", kind: "charge", amount_dop: "42.10" }] });
  });

  it("rejects detail belonging to another bill or home", async () => {
    for (const wrong of [{ ...detail, bill_id: OTHER }, { ...detail, home_id: OTHER }]) {
      const fetcher = vi.fn().mockResolvedValue(json(wrong));
      await expect(createApiClient("http://api.test", fetcher).getBillItems(HOME, BILL)).rejects.toBeInstanceOf(ContractError);
    }
  });

  it("requests a read-only assessment with an empty POST body", async () => {
    const assessment = { home_id: HOME, bill_id: BILL, read_only: true, approval: "not_performed", status: "warnings", checks: [],
      warnings: [], provenance: { origin: "creation", original_available: true, data: {}, captured_at: "2026-10-04T12:00:00Z" },
      corrections: [], corrections_has_more: false, detail };
    const fetcher = vi.fn().mockResolvedValue(json(assessment));
    const parsed = await createApiClient("http://api.test", fetcher).assessBill(HOME, BILL);
    expect(parsed.approval).toBe("not_performed");
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`http://api.test/api/v1/homes/${HOME}/bills/${BILL}/validate`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({});
  });
});
