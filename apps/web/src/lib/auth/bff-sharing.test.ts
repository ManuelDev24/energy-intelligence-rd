// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleBff } from "./bff";

const config = { enabled: true, apiBase: "http://127.0.0.1:8000", origin: "http://localhost:3000", secure: false };
const HOME = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const INVITATION = "33333333-3333-4333-8333-333333333333";
const TOKEN = "A".repeat(43);
const EPOCH = "0123456789abcdef0123456789abcdef";
const cookie = `erd-epoch=${EPOCH}; erd-access=${EPOCH}~access-token`;
const home = { id: HOME, code: null, name: "Casa", address: null, city: null, distributor: "EDESUR", created_at: "2026-01-01T00:00:00Z", province: null, municipality: null, sector: null, user_type: null, occupants: null, has_ac: null, has_water_heater: null, has_pool: null, has_solar: null, has_inverter: null };
const member = { user_id: USER, email: "bob@example.com", role: "member", joined_at: "2026-01-01T00:00:00Z" };
const invitation = { id: INVITATION, email: "bob@example.com", created_at: "2026-01-01T00:00:00Z", expires_at: "2026-01-08T00:00:00Z" };
const req = (path: string, method: string, body?: unknown, cookies = cookie) => new Request(`http://localhost:3000/api/bff/${path}`, { method, headers: { origin: config.origin, "content-type": "application/json", cookie: cookies }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

describe("compartir vivienda por BFF (ERD-SHARE-01)", () => {
  it.each([
    ["GET", `homes/${HOME}/members`, undefined, [member], 200],
    ["GET", `homes/${HOME}/invitations`, undefined, [invitation], 200],
    ["POST", `homes/${HOME}/invitations`, { email: "bob@example.com" }, invitation, 201],
    ["POST", "invitations/accept", { token: TOKEN }, home, 200],
  ] as const)("%s %s valida contrato y envía bearer", async (method, path, body, value, status) => {
    const upstream = vi.fn().mockResolvedValue(json(value, status));
    const result = await handleBff(req(path, method, body), config, upstream);
    expect(result.status).toBe(status);
    expect(await result.json()).toEqual(value);
    expect(upstream.mock.calls[0][1].headers.Authorization).toBe("Bearer access-token");
    expect(result.headers.get("cache-control")).toBe("no-store, private");
  });

  it.each([
    ["DELETE", `homes/${HOME}/members/${USER}`, {}],
    ["DELETE", `homes/${HOME}/members/me`, {}],
    ["DELETE", `homes/${HOME}/invitations/${INVITATION}`, {}],
    ["POST", `homes/${HOME}/transfer-ownership`, { user_id: USER, password: "valid-test-password-123" }],
  ] as const)("%s %s responde 204 sin cuerpo", async (method, path, body) => {
    const upstream = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const result = await handleBff(req(path, method, body), config, upstream);
    expect(result.status).toBe(204);
    expect(await result.text()).toBe("");
    expect(upstream.mock.calls[0][0]).toBe(`http://127.0.0.1:8000/api/v1/${path}`);
  });

  it.each([
    ["POST", `homes/${HOME}/invitations`, { email: "bob@example.com", role: "owner" }],
    ["POST", `homes/${HOME}/invitations`, {}],
    ["POST", "invitations/accept", { token: "short" }],
    ["POST", "invitations/accept", { token: TOKEN, home_id: HOME }],
    ["POST", `homes/${HOME}/transfer-ownership`, { user_id: "no-uuid", password: "valid-test-password-123" }],
    ["POST", `homes/${HOME}/transfer-ownership`, { user_id: USER }],
    ["POST", `homes/${HOME}/transfer-ownership`, { user_id: USER, password: "valid-test-password-123", extra: 1 }],
    ["DELETE", `homes/${HOME}/members/${USER}`, { reason: "x" }],
  ] as const)("rechaza %s %s con cuerpo inválido sin tocar la API", async (method, path, body) => {
    const upstream = vi.fn();
    expect((await handleBff(req(path, method, body), config, upstream)).status).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    ["PUT", `homes/${HOME}/members`], ["POST", `homes/${HOME}/members`], ["GET", `homes/${HOME}/members/${USER}`],
    ["DELETE", `homes/${HOME}/members`], ["DELETE", `homes/${HOME}/invitations`], ["DELETE", `homes/${HOME}/invitations/me`],
    ["GET", `homes/${HOME}/transfer-ownership`], ["PATCH", `homes/${HOME}/invitations/${INVITATION}`],
    ["GET", "invitations/accept"], ["POST", "invitations"], ["POST", "invitations/accept/x"],
    ["GET", `homes/not-a-uuid/members`], ["DELETE", `homes/${HOME}/members/not-a-uuid`], ["DELETE", `homes/${HOME}/members/${USER}/x`],
  ])("%s %s no es una ruta permitida", async (method, path) => {
    const upstream = vi.fn();
    const result = await handleBff(req(path, method, method === "GET" ? undefined : {}), config, upstream);
    expect([404, 405]).toContain(result.status);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rechaza parámetros de consulta", async () => {
    const upstream = vi.fn();
    expect((await handleBff(req(`homes/${HOME}/members?x=1`, "GET"), config, upstream)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("sin sesión nunca consulta la API", async () => {
    const upstream = vi.fn();
    for (const [method, path, body] of [["GET", `homes/${HOME}/members`, undefined], ["POST", "invitations/accept", { token: TOKEN }]] as const) {
      expect((await handleBff(req(path, method, body, ""), config, upstream)).status).toBe(401);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("una respuesta que no cumple el contrato no se devuelve", async () => {
    const upstream = vi.fn().mockResolvedValue(json([{ ...member, role: "admin" }]));
    expect((await handleBff(req(`homes/${HOME}/members`, "GET"), config, upstream)).status).toBe(502);
  });

  it.each([
    [400, "invitation_invalid", /no es válida o ha caducado/],
    [409, "already_member", /ya es miembro/],
    [409, "invitation_pending", /invitación pendiente/],
    [409, "invitation_limit_reached", /demasiadas invitaciones pendientes/i],
    [429, "invitation_rate_limited", /demasiadas invitaciones/i],
    [403, "forbidden", /Solo el propietario/],
  ])("estado %i código %s tiene mensaje local y no filtra el texto de la API", async (status, code, message) => {
    const upstream = vi.fn().mockResolvedValue(json({ detail: "secreto bob@example.com <script>", code, request_id: "req-12345678" }, status));
    const path = status === 403 ? `homes/${HOME}/members` : "invitations/accept";
    const result = await handleBff(req(path, status === 403 ? "GET" : "POST", status === 403 ? undefined : { token: TOKEN }), config, upstream);
    const body = await result.json();
    expect(result.status).toBe(status);
    expect(body.detail).toMatch(message);
    expect(JSON.stringify(body)).not.toContain("secreto");
  });

  it("transferir con contraseña incorrecta muestra el mensaje de contraseña, no el de propietario", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ detail: "x", code: "reauthentication_failed" }, 403));
    const result = await handleBff(req(`homes/${HOME}/transfer-ownership`, "POST", { user_id: USER, password: "valid-test-password-123" }), config, upstream);
    expect(result.status).toBe(403);
    expect((await result.json()).detail).toBe("La contraseña no es correcta.");
  });

  it("borrar la cuenta y salir de la vivienda explican distinto el mismo conflicto de propiedad", async () => {
    const upstream = vi.fn().mockImplementation(async () => json({ detail: "x", code: "ownership_transfer_required" }, 409));
    const leave = await (await handleBff(req(`homes/${HOME}/members/me`, "DELETE", {}), config, upstream)).json();
    const erase = await (await handleBff(req("auth/me", "DELETE", { password: "valid-test-password-123" }), config, upstream)).json();
    expect(leave.detail).toMatch(/antes de salir/);
    expect(erase.detail).toMatch(/eliminar la cuenta/);
  });
});
