// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleBff } from "./bff";
import { BILLS, DASHBOARD_A, HOME_A, HOME_B } from "@/test/mock-api";

const config = { enabled: true, apiBase: "http://127.0.0.1:8000", origin: "http://localhost:3000", secure: false };
const epoch = "0123456789abcdef0123456789abcdef";
const request = (query: string) => new Request(`http://localhost:3000/api/bff/homes/${HOME_A}/dashboard${query}`, {
  headers: { cookie: `erd-epoch=${epoch}; erd-access=${epoch}~access-token` },
});

describe("dashboard por período en el BFF", () => {
  it("transmite el período seleccionado con la sesión", async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json(DASHBOARD_A));
    const response = await handleBff(request(`?bill_id=${BILLS[2].id}`), config, upstream);
    expect(response.status).toBe(200);
    expect(upstream.mock.calls[0][0]).toBe(`${config.apiBase}/api/v1/homes/${HOME_A}/dashboard?bill_id=${BILLS[2].id}`);
    expect(upstream.mock.calls[0][1].headers.Authorization).toBe("Bearer access-token");
  });
  it.each(["?bill_id=invalid", `?bill_id=${BILLS[0].id}&bill_id=${BILLS[1].id}`, "?unexpected=1"])("rechaza %s antes de consultar", async query => {
    const upstream = vi.fn();
    expect((await handleBff(request(query), config, upstream)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    { ...DASHBOARD_A, home: { ...DASHBOARD_A.home, id: HOME_B } },
    { ...DASHBOARD_A, latest_bill: { ...DASHBOARD_A.latest_bill, bill_id: BILLS[0].id } },
  ])("rechaza una respuesta de otra vivienda o período", async data => {
    const upstream = vi.fn().mockResolvedValue(Response.json(data));
    expect((await handleBff(request(`?bill_id=${BILLS[2].id}`), config, upstream)).status).toBe(502);
  });
});
