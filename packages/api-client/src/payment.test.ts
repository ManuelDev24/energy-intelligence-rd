import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./index";

const HOME = "00000000-0000-0000-0000-000000000001";
const BILL = "00000000-0000-0000-0000-0000000000b1";
const bill = {
  id: BILL, home_id: HOME, period_start: "2026-09-01", period_end: "2026-09-30", kwh: "300.00", amount_dop: "3600.00", days: 30,
  reading_previous: null, reading_current: null, due_date: "2026-10-15", paid_at: "2026-10-10T12:00:00Z", source: "manual", created_at: "2026-10-01T00:00:00Z",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("pago de facturas (ERD-ALERT-02)", () => {
  it("setBillPayment hace PUT con {paid} y devuelve la factura", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(bill));
    const result = await createApiClient("http://api.test", fetcher).setBillPayment(HOME, BILL, true);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`http://api.test/api/v1/homes/${HOME}/bills/${BILL}/payment`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ paid: true });
    expect(result.paid_at).toBe("2026-10-10T12:00:00Z");
  });
  it("rechaza la respuesta de otra factura o sin los campos nuevos", async () => {
    const other = createApiClient("http://api.test", vi.fn().mockResolvedValue(json({ ...bill, id: "00000000-0000-0000-0000-0000000000b2" })));
    await expect(other.setBillPayment(HOME, BILL, true)).rejects.toMatchObject({ code: "invalid_response" });
    const { due_date: _due, paid_at: _paid, ...legacy } = bill;
    const old = createApiClient("http://api.test", vi.fn().mockResolvedValue(json(legacy)));
    await expect(old.setBillPayment(HOME, BILL, false)).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("createBill envía due_date", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(bill, 201));
    await createApiClient("http://api.test", fetcher).createBill(HOME, { period_start: "2026-09-01", period_end: "2026-09-30", days: 30, kwh: "300", amount_dop: "3600", due_date: "2026-10-15" });
    expect(JSON.parse(fetcher.mock.calls[0][1].body as string).due_date).toBe("2026-10-15");
  });
});
