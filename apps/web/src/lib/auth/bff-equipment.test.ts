// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleBff } from "./bff";

const config = { enabled: true, apiBase: "http://127.0.0.1:8000", origin: "http://localhost:3000", secure: false };
const HOME = "11111111-1111-4111-8111-111111111111";
const EPOCH = "0123456789abcdef0123456789abcdef";
const cookie = `erd-epoch=${EPOCH}; erd-access=${EPOCH}~access-token`;
const body = { name: "Aire", room: null, kind: "air_conditioner", brand: "LG", model: "X1", icon: "fan", power_w: "1500", hours_per_day: "6" };
const out = { ...body, id: "22222222-2222-4222-8222-222222222222", home_id: HOME, created_at: "2026-10-01T00:00:00Z" };
const req = (payload: unknown) =>
  new Request(`http://localhost:3000/api/bff/homes/${HOME}/equipment`, {
    method: "POST", body: JSON.stringify(payload), headers: { origin: config.origin, cookie, "content-type": "application/json" },
  });

describe("equipos por BFF (ERD-DEV-02)", () => {
  it("acepta tipo, marca, modelo e icono y valida la respuesta", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify(out), { status: 201 }));
    const res = await handleBff(req(body), config, upstream);
    expect(res.status).toBe(201);
    expect(JSON.parse(upstream.mock.calls[0][1].body)).toMatchObject({ kind: "air_conditioner", brand: "LG", icon: "fan" });
  });

  it.each([
    { why: "tipo fuera del catálogo", payload: { ...body, kind: "toaster" } },
    { why: "icono fuera del catálogo", payload: { ...body, icon: "skull" } },
    { why: "marca demasiado larga", payload: { ...body, brand: "x".repeat(61) } },
    { why: "campo no permitido", payload: { ...body, owner: "otro" } },
  ])("rechaza $why sin llegar a la API", async ({ payload }) => {
    const upstream = vi.fn();
    const res = await handleBff(req(payload), config, upstream);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("descarta una respuesta de la API con un tipo desconocido", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...out, kind: "robot" }), { status: 201 }));
    const res = await handleBff(req(body), config, upstream);
    expect(res.status).toBe(502);
  });
});
