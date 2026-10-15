// @vitest-environment node
// ERD-ONB-ACCEPTANCE: el BFF reenvía Idempotency-Key solo en POST /homes y solo si es un UUID.
import { describe, expect, it, vi } from "vitest";
import { handleBff } from "./bff";

const config = { enabled: true, apiBase: "http://127.0.0.1:8000", origin: "http://localhost:3000", secure: false };
const EPOCH = "0123456789abcdef0123456789abcdef";
const cookie = `erd-epoch=${EPOCH}; erd-access=${EPOCH}~access-token`;
const KEY = "aaaaaaaa-0000-4000-8000-000000000001";
const HOME = { id: "11111111-1111-4111-8111-111111111111", name: "Casa", distributor: "EDESUR", code: null, address: null, city: null, province: null, municipality: null, sector: null, user_type: null, occupants: null, has_ac: null, has_water_heater: null, has_pool: null, has_solar: null, has_inverter: null, created_at: "2026-10-14T10:00:00Z", updated_at: "2026-10-14T10:00:00Z" };
const post = (path: string, headers: Record<string, string> = {}, body: unknown = { name: "Casa", distributor: "EDESUR" }) =>
  new Request(`http://localhost:3000/api/bff${path}`, { method: "POST", body: JSON.stringify(body), headers: { origin: config.origin, cookie, "content-type": "application/json", ...headers } });
const ok = () => new Response(JSON.stringify(HOME), { status: 201 });

describe("Idempotency-Key en el BFF", () => {
  it("se reenvía al crear vivienda", async () => {
    const upstream = vi.fn().mockResolvedValue(ok());
    expect((await handleBff(post("/homes", { "idempotency-key": KEY }), config, upstream)).status).toBe(201);
    expect(upstream.mock.calls[0][1].headers["Idempotency-Key"]).toBe(KEY);
  });
  it("sin la cabecera no se añade nada", async () => {
    const upstream = vi.fn().mockResolvedValue(ok());
    await handleBff(post("/homes"), config, upstream);
    expect(upstream.mock.calls[0][1].headers).not.toHaveProperty("Idempotency-Key");
  });
  it("una clave que no es UUID, o en otra ruta, se rechaza sin llamar a la API", async () => {
    const upstream = vi.fn();
    expect((await handleBff(post("/homes", { "idempotency-key": "../x" }), config, upstream)).status).toBe(400);
    const patch = new Request("http://localhost:3000/api/bff/homes/11111111-1111-4111-8111-111111111111", { method: "PATCH", body: JSON.stringify({ name: "Otra" }),
      headers: { origin: config.origin, cookie, "content-type": "application/json", "idempotency-key": KEY } });
    expect((await handleBff(patch, config, upstream)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
});
