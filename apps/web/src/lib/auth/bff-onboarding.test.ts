// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleBff } from "./bff";
const config = { enabled: true, apiBase: "http://127.0.0.1:8000", origin: "http://localhost:3000", secure: false };
const HOME = "11111111-1111-4111-8111-111111111111";
const EPOCH = "0123456789abcdef0123456789abcdef";
const cookie = `erd-epoch=${EPOCH}; erd-access=${EPOCH}~access-token`;
const home = { id: HOME, code: null, name: "Casa", address: null, city: null, distributor: "EDESUR", created_at: "2026-01-01T00:00:00Z", province: "Santiago", municipality: "Santiago", sector: null, user_type: null, occupants: null, has_ac: null, has_water_heater: null, has_pool: null, has_solar: null, has_inverter: null };
const contract = { home_id: HOME, account_number: "ABC-123", updated_at: "2026-01-01T00:00:00Z" };
const req = (path: string, method: string, body?: unknown, cookies = cookie) => new Request(`http://localhost:3000/api/bff/${path}`, { method, headers: { origin: config.origin, "content-type": "application/json", cookie: cookies }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
describe("onboarding BFF", () => {
  it.each([
    ["POST", "homes", { name: "Casa", distributor: "EDESUR", province: "Santiago", municipality: "Santiago" }, home, 201],
    ["PATCH", `homes/${HOME}`, { user_type: "Residencial", occupants: 2, has_ac: false, has_pool: null }, home, 200],
    ["GET", `homes/${HOME}/contract`, undefined, contract, 200],
    ["PUT", `homes/${HOME}/contract`, { account_number: "ABC-123" }, contract, 200],
  ] as const)("%s %s valida contrato y envía bearer", async (method, path, body, value, status) => {
    const upstream = vi.fn().mockResolvedValue(json(value, status));
    const result = await handleBff(req(path, method, body), config, upstream);
    expect(result.status).toBe(status);
    expect(await result.json()).toEqual(value);
    expect(upstream.mock.calls[0][1].headers.Authorization).toBe("Bearer access-token");
  });
  it.each([
    ["POST", "homes", { name: "Casa", distributor: "EDESUR", province: "" }, 422],
    ["POST", "homes", { name: "Casa", distributor: "EDESUR", occupants: 0 }, 422],
    ["PATCH", `homes/${HOME}`, { user_type: "x".repeat(121) }, 422],
    ["PATCH", `homes/${HOME}`, { has_ac: "sí" }, 422],
    ["PATCH", `homes/${HOME}`, { owner_id: HOME }, 422],
    ["PUT", `homes/${HOME}/contract`, { account_number: "" }, 422],
    ["PUT", `homes/${HOME}/contract`, { account_number: "123", home_id: HOME }, 422],
    ["GET", `homes/${HOME}?limit=1`, undefined, 400],
    ["PATCH", `homes/${HOME}?limit=1`, { name: "Casa" }, 400],
    ["GET", `homes/${HOME}/contract?limit=1`, undefined, 400],
    ["DELETE", `homes/${HOME}/contract`, {}, 404],
    ["PUT", "homes/not-a-uuid/contract", { account_number: "123" }, 404],
  ] as const)("rechaza %s %s sin upstream", async (method, path, body, status) => {
    const upstream = vi.fn();
    expect((await handleBff(req(path, method, body), config, upstream)).status).toBe(status);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("PATCH conserva exactamente los campos enviados y lecturas no se cachean", async () => {
    const upstream = vi.fn().mockResolvedValue(json(home));
    const result = await handleBff(req(`homes/${HOME}`, "PATCH", { name: "Casa" }), config, upstream);
    expect(JSON.parse(upstream.mock.calls[0][1].body)).toEqual({ name: "Casa" });
    expect(upstream.mock.calls[0][1].cache).toBe("no-store");
    expect(result.headers.get("cache-control")).toBe("no-store, private");
    expect(result.headers.get("vary")).toBe("Cookie");
  });
  it("sin sesión nunca consulta contrato", async () => {
    const upstream = vi.fn();
    expect((await handleBff(req(`homes/${HOME}/contract`, "GET", undefined, ""), config, upstream)).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("respuesta ajena no se devuelve y errores no filtran detalle", async () => {
    const upstream = vi.fn().mockResolvedValueOnce(json({ ...contract, home_id: "22222222-2222-4222-8222-222222222222" })).mockResolvedValueOnce(json({ detail: "secreto <script>", code: "not_found" }, 404));
    expect((await handleBff(req(`homes/${HOME}/contract`, "GET"), config, upstream)).status).toBe(502);
    const result = await handleBff(req(`homes/${HOME}/contract`, "GET"), config, upstream);
    expect(result.status).toBe(404);
    expect(await result.text()).not.toContain("secreto");
  });
  it("DELETE de vivienda autenticada acepta 204 sin cuerpo", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const result = await handleBff(req(`homes/${HOME}`, "DELETE", {}), config, upstream);
    expect(result.status).toBe(204);
    expect(await result.text()).toBe("");
  });
  it("PATCH de vivienda nunca devuelve una vivienda distinta", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ ...home, id: "22222222-2222-4222-8222-222222222222" }));
    expect((await handleBff(req(`homes/${HOME}`, "PATCH", { occupants: 2 }), config, upstream)).status).toBe(502);
  });
});
