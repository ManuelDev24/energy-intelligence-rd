import { describe, expect, it, vi } from "vitest";
import { ContractError, createApiClient } from "./index";

const HOME = "00000000-0000-4000-8000-000000000001";
const report = (homeId = HOME) => ({
  home_id: HOME, home: { id: homeId, name: "Casa", distributor: "EDESUR", province: null, municipality: null },
  period: { period_from: "2026-01-01", period_to: "2026-01-31", days: 31 }, generated_at: "2026-10-14T12:00:00.123456Z", bills: [],
  totals: { bills_count: 0, kwh: null, amount_dop: null, avg_price_per_kwh: null, avg_kwh_per_bill: null }, peak_bill: null, comparison: null,
  equipment: [], recommendations: [], goal: null, sources: [], notes: ["n"],
});
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("informe energético (ERD-RPT-01)", () => {
  it("lee el informe con el período pedido y acepta la fecha con microsegundos de la API", async () => {
    const fetcher = vi.fn().mockImplementation(async () => json(report()));
    const out = await createApiClient("http://api.test", fetcher).getEnergyReport(HOME, { from: "2026-01-01", to: "2026-01-31" });
    expect(fetcher.mock.calls[0][0]).toBe(`http://api.test/api/v1/homes/${HOME}/reports/energy?from=2026-01-01&to=2026-01-31`);
    expect(out.totals.kwh).toBeNull();
    await createApiClient("http://api.test", fetcher).getEnergyReport(HOME);
    expect(fetcher.mock.calls[1][0]).toBe(`http://api.test/api/v1/homes/${HOME}/reports/energy`);
  });
  it("rechaza un informe de otra vivienda (el cliente comprueba `home.id`)", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(report("00000000-0000-4000-8000-0000000000ff")));
    await expect(createApiClient("http://api.test", fetcher).getEnergyReport(HOME)).rejects.toBeInstanceOf(ContractError);
  });
});
