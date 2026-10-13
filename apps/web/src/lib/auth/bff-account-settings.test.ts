// @vitest-environment node
// ERD-PROF-01: cambio de contraseña, preferencias, sesiones y exportación de datos a través del BFF.
import { describe, expect, it, vi } from "vitest";
import { handleBff } from "./bff";

const config = { enabled: true, apiBase: "http://127.0.0.1:8000", origin: "http://localhost:3000", secure: false };
const EPOCH = "0123456789abcdef0123456789abcdef";
const cookie = `erd-epoch=${EPOCH}; erd-access=${EPOCH}~access-token; erd-logout=${EPOCH}~refresh-token`;
const SESSION = "11111111-1111-4111-8111-111111111111";
const OLD = "valid-test-password-123";
const NEW = "another-new-password-789";
const prefs = { alerts_email: true, alerts_push: false, updated_at: "2026-10-10T12:00:00Z" };
const session = { id: SESSION, created_at: "2026-10-10T12:00:00Z", expires_at: "2026-11-09T12:00:00Z", current: true };
const tokens = { access_token: "new-access", refresh_token: "new-refresh", token_type: "bearer", expires_in: 900 };
const req = (path: string, method: string, body?: unknown, cookies = cookie) => new Request(`http://localhost:3000/api/bff/${path}`, {
  method, headers: { origin: config.origin, "content-type": "application/json", cookie: cookies },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

describe("preferencias y sesiones por BFF", () => {
  it.each([
    ["GET", "auth/me/preferences", undefined, prefs],
    ["PUT", "auth/me/preferences", { alerts_email: true, alerts_push: false }, prefs],
    ["GET", "auth/sessions", undefined, [session]],
  ] as const)("%s %s valida el contrato y envía bearer", async (method, path, body, value) => {
    const upstream = vi.fn().mockResolvedValue(json(value));
    const result = await handleBff(req(path, method, body), config, upstream);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual(value);
    expect(upstream.mock.calls[0][1].headers.Authorization).toBe("Bearer access-token");
    expect(result.headers.get("cache-control")).toBe("no-store, private");
  });

  it.each([
    ["DELETE", `auth/sessions/${SESSION}`, {}],
    ["POST", "auth/sessions/revoke-others", {}],
  ] as const)("%s %s responde 204", async (method, path, body) => {
    const upstream = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const result = await handleBff(req(path, method, body), config, upstream);
    expect(result.status).toBe(204);
    expect(upstream.mock.calls[0][0]).toBe(`http://127.0.0.1:8000/api/v1/${path}`);
    expect(result.headers.has("set-cookie")).toBe(false);
  });

  it.each([
    ["PUT", "auth/me/preferences", { alerts_email: true }],
    ["PUT", "auth/me/preferences", { alerts_email: "yes", alerts_push: true }],
    ["PUT", "auth/me/preferences", { alerts_email: true, alerts_push: true, sms: true }],
    ["DELETE", `auth/sessions/${SESSION}`, { x: 1 }],
    ["POST", "auth/sessions/revoke-others", { x: 1 }],
  ] as const)("rechaza %s %s con cuerpo inválido sin tocar la API", async (method, path, body) => {
    const upstream = vi.fn();
    expect((await handleBff(req(path, method, body), config, upstream)).status).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    ["DELETE", "auth/sessions/not-a-uuid"], ["GET", `auth/sessions/${SESSION}`], ["PUT", "auth/sessions"], ["POST", "auth/sessions"],
    ["DELETE", "auth/me/preferences"], ["PATCH", "auth/me/preferences"], ["GET", "auth/sessions/revoke-others"],
  ])("%s %s no es una ruta permitida", async (method, path) => {
    const upstream = vi.fn();
    expect([404, 405]).toContain((await handleBff(req(path, method, method === "GET" ? undefined : {}), config, upstream)).status);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("sin sesión nunca consulta la API", async () => {
    const upstream = vi.fn();
    for (const [method, path] of [["GET", "auth/sessions"], ["GET", "auth/me/preferences"], ["GET", "auth/me/export"]] as const) {
      expect((await handleBff(req(path, method, undefined, ""), config, upstream)).status).toBe(401);
    }
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("cambio de contraseña por BFF", () => {
  const change = (body: unknown = { current_password: OLD, new_password: NEW }, cookies = cookie) => req("auth/password/change", "POST", body, cookies);

  it("renueva las cookies de sesión con los tokens nuevos y no los expone al navegador", async () => {
    const upstream = vi.fn().mockResolvedValue(json(tokens));
    const result = await handleBff(change(), config, upstream);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true });
    const setCookie = result.headers.get("set-cookie")!;
    expect(setCookie).toContain(`erd-access=${EPOCH}~new-access`);
    expect(setCookie).toContain(`erd-logout=${EPOCH}~new-refresh`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(upstream.mock.calls[0][1].headers.Authorization).toBe("Bearer access-token");
    expect(JSON.parse(upstream.mock.calls[0][1].body)).toEqual({ current_password: OLD, new_password: NEW });
  });

  it.each([
    [{ current_password: "short", new_password: NEW }], [{ current_password: OLD, new_password: "short" }],
    [{ current_password: OLD }], [{ new_password: NEW }], [{ current_password: OLD, new_password: NEW, email: "a@b.co" }],
    [{ current_password: OLD, new_password: OLD }], [{ current_password: "x".repeat(129), new_password: NEW }],
  ])("rechaza %j sin tocar la API", async (body) => {
    const upstream = vi.fn();
    expect((await handleBff(change(body), config, upstream)).status).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("sin sesión no consulta la API", async () => {
    const upstream = vi.fn();
    expect((await handleBff(change(undefined, ""), config, upstream)).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("una contraseña actual incorrecta no cambia cookies y muestra el mensaje local", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ detail: "secreto", code: "reauthentication_failed" }, 403));
    const result = await handleBff(change(), config, upstream);
    expect(result.status).toBe(403);
    expect((await result.json()).detail).toBe("La contraseña no es correcta.");
    expect(result.headers.has("set-cookie")).toBe(false);
  });

  it("una respuesta con tokens malformados es un error de contrato y no toca las cookies", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ access_token: "x", refresh_token: "y" }));
    const result = await handleBff(change(), config, upstream);
    expect(result.status).toBe(502);
    expect(result.headers.has("set-cookie")).toBe(false);
  });

  it("mensajes de campo locales para current_password y new_password", async () => {
    const upstream = vi.fn();
    const result = await handleBff(change({ current_password: OLD, new_password: "short" }), config, upstream);
    const body = await result.json();
    expect(JSON.stringify(body)).toMatch(/12 y 128/);
  });
});

describe("exportación de datos por BFF", () => {
  it("devuelve el JSON del titular con encabezados de descarga y sin cachear", async () => {
    const data = { format_version: 1, generated_at: "2026-10-10T12:00:00Z", account: { email: "a@b.co" }, homes: [], sessions: [] };
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status: 200, headers: { "content-disposition": 'attachment; filename="energyrd-datos-2026-10-10.json"' } }));
    const result = await handleBff(req("auth/me/export", "GET"), config, upstream);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual(data);
    expect(result.headers.get("cache-control")).toBe("no-store, private");
    expect(result.headers.get("content-disposition")).toBe('attachment; filename="energyrd-datos-2026-10-10.json"');
  });

  it("rechaza una respuesta que no parece una exportación", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ hello: "world" }));
    expect((await handleBff(req("auth/me/export", "GET"), config, upstream)).status).toBe(502);
  });

  it("solo GET y sin parámetros de consulta", async () => {
    const upstream = vi.fn();
    expect((await handleBff(req("auth/me/export", "POST", {}), config, upstream)).status).toBe(404);
    expect((await handleBff(req("auth/me/export?x=1", "GET"), config, upstream)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
});
