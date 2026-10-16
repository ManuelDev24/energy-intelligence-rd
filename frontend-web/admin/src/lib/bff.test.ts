import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleAdminBff, readAdminBffConfig, type AdminBffConfig } from "./bff";

const config: AdminBffConfig = { apiBase: "https://api.example.test", origin: "https://admin.example.test", secure: true };
const origin = config.origin;
const pairs = { access_token: "access.token", refresh_token: "refresh.token" };
let jar: Record<string, string> = {};
let upstream: ReturnType<typeof vi.fn>;
function cookies(response: Response) {
  for (const line of response.headers.getSetCookie()) {
    const [name, value] = line.split(";", 1)[0].split("=");
    if (line.includes("Max-Age=0")) delete jar[name];
    else jar[name] = value;
  }
  return response.headers.getSetCookie();
}
function request(path: string, method = "GET", body?: unknown, extra: Record<string, string> = {}) {
  return new Request(`${origin}/api/admin${path}`, {
    method,
    headers: { host: new URL(origin).host,
      ...(Object.keys(jar).length ? { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
      ...(method !== "GET" ? { origin, "content-type": "application/json" } : {}), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function call(path: string, method = "GET", body?: unknown, extra?: Record<string, string>) {
  return handleAdminBff(request(path, method, body, extra), config);
}
beforeEach(() => {
  jar = {};
  upstream = vi.fn(async () => Response.json(pairs));
  vi.stubGlobal("fetch", upstream);
});
afterEach(() => vi.unstubAllGlobals());

describe("admin BFF", () => {
  it("rejects insecure or missing production origins", () => {
    expect(() => readAdminBffConfig({ NODE_ENV: "production", ADMIN_API_BASE_URL: "https://api.example.test" })).toThrow();
    expect(() => readAdminBffConfig({ NODE_ENV: "production", ADMIN_API_BASE_URL: "http://api.example.test", ADMIN_ORIGIN: origin })).toThrow();
    expect(readAdminBffConfig({ NODE_ENV: "production", ADMIN_API_BASE_URL: config.apiBase, ADMIN_ORIGIN: origin })).toEqual(config);
  });
  it("issues secure HttpOnly epoch and bound token cookies, never token JSON", async () => {
    const init = await call("/session");
    expect(cookies(init).join(" ")).toContain("__Host-admin-epoch=");
    const login = await call("/auth/login", "POST", { email: "a@example.com", password: "secret" });
    const lines = cookies(login).join(" ");
    expect(login.status).toBe(200);
    expect(await login.json()).toEqual({ ok: true });
    expect(lines).toContain("__Host-admin-access=");
    expect(lines).toContain("__Host-admin-refresh=");
    expect(lines).toContain("HttpOnly");
    expect(lines).toContain("Secure");
    expect(lines.toLowerCase()).toContain("samesite=strict");
    expect(login.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects late login cookies after logout rotates epoch", async () => {
    cookies(await call("/session"));
    const pendingLogin = call("/auth/login", "POST", { email: "a@example.com", password: "secret" });
    const logout = await call("/auth/logout", "POST", {});
    cookies(logout);
    const stale = await pendingLogin;
    cookies(stale); // simulate response landing after logout
    upstream.mockImplementation(async (_url: string, init: RequestInit) => init.method === "POST" ? Response.json(pairs) : Response.json({ user_id: "u", email: "a@example.com", roles: [], scopes: [] }));
    const proxied = await call("/proxy/me");
    expect(proxied.status).toBe(401);
    expect(upstream).not.toHaveBeenCalledWith(`${config.apiBase}/api/v1/admin/me`, expect.anything());
  });

  it("rejects late refresh cookies after logout", async () => {
    cookies(await call("/session"));
    cookies(await call("/auth/login", "POST", { email: "a@example.com", password: "secret" }));
    let resolveRefresh!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { resolveRefresh = resolve; });
    upstream.mockImplementation(async (url: string) => url.endsWith("/refresh") ? pending : new Response(null, { status: 204 }));
    const refreshing = call("/auth/refresh", "POST", {});
    cookies(await call("/auth/logout", "POST", {}));
    resolveRefresh(Response.json(pairs));
    cookies(await refreshing);
    expect((await call("/proxy/me")).status).toBe(401);
  });

  it("rejects a Host header that does not match the configured origin", async () => {
    const mismatched = request("/session", "GET", undefined, { host: "attacker.test" });
    expect((await handleAdminBff(mismatched, config)).status).toBe(403);
  });

  it("trusts the Host header over request.url, working around Next dev reporting 'localhost'", async () => {
    // Next's dev server can report request.url with hostname "localhost" even when bound to a
    // different host; the Host header is what the client actually sent and must still decide.
    const spoofedUrlHostname = new Request(`https://localhost/api/admin/session`,
      { headers: { host: new URL(origin).host } });
    expect((await handleAdminBff(spoofedUrlHostname, config)).status).toBe(200);
  });

  it("enforces exact Origin on writes and allowlisted proxy routes", async () => {
    cookies(await call("/session"));
    expect((await call("/auth/login", "POST", {}, { origin: "https://attacker.test" })).status).toBe(403);
    expect((await call("/proxy/role-assignments", "POST", {}, { origin: "https://attacker.test" })).status).toBe(403);
    expect((await call("/proxy/../../auth/refresh", "POST", {})).status).toBe(404);
    expect((await call("/proxy/roles", "DELETE", {})).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("sanitizes upstream errors and only proxies authorized admin paths", async () => {
    cookies(await call("/session"));
    cookies(await call("/auth/login", "POST", { email: "a@example.com", password: "secret" }));
    upstream.mockResolvedValueOnce(Response.json({ detail: "secret SQL trace", code: "SECRET" }, { status: 403 }));
    const denied = await call("/proxy/roles");
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: "No tienes permiso para esta operación." });
    expect(denied.headers.get("cache-control")).toContain("no-store");
    expect(upstream).toHaveBeenLastCalledWith(`${config.apiBase}/api/v1/admin/roles`, expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer access.token" }) }));
  });

  it("proxies only the OCR routes and filters the API defines, and keeps 409 as a 409", async () => {
    cookies(await call("/session"));
    cookies(await call("/auth/login", "POST", { email: "a@example.com", password: "secret" }));
    upstream.mockClear();
    upstream.mockImplementation(async () => Response.json({ items: [], total: 0, limit: 25, offset: 0 }));
    expect((await call("/proxy/ocr/jobs?status=dead_letter&error_code=engine_error&min_attempts=2&created_from=2026-10-01T04%3A00%3A00.000Z&limit=25&offset=0")).status).toBe(200);
    expect((await call("/proxy/ocr/jobs/42")).status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(2);
    for (const [path, method] of [["/proxy/ocr/jobs?home_id=x", "GET"], ["/proxy/ocr/jobs?status=a&status=b", "GET"],
      ["/proxy/ocr/jobs/0", "GET"], ["/proxy/ocr/jobs/abc", "GET"], ["/proxy/ocr/jobs/42/content", "GET"],
      ["/proxy/ocr/jobs/42/retry", "GET"], ["/proxy/ocr/jobs/42/confirm", "POST"], ["/proxy/ocr/jobs", "POST"]] as const) {
      expect((await call(path, method, method === "POST" ? { reason: "x" } : undefined)).status, path).toBe(404);
    }
    expect(upstream).toHaveBeenCalledTimes(2);
    upstream.mockResolvedValueOnce(Response.json({ detail: "El trabajo no admite reintento manual" }, { status: 409 }));
    const conflict = await call("/proxy/ocr/jobs/42/retry", "POST", { reason: "Revisar motor" });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: "La operación no es válida en el estado actual." });
    expect(upstream).toHaveBeenLastCalledWith(`${config.apiBase}/api/v1/admin/ocr/jobs/42/retry`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "Revisar motor" }) }));
    upstream.mockResolvedValueOnce(Response.json({}, { status: 200 }));
    expect((await call("/proxy/ocr/jobs/42/cancel", "POST", { reason: "Detener" })).status).toBe(200);
  });

  it("proxies the aggregate overview as read-only and refuses writes or parameters", async () => {
    cookies(await call("/session"));
    cookies(await call("/auth/login", "POST", { email: "a@example.com", password: "secret" }));
    upstream.mockClear();
    upstream.mockImplementation(async () => Response.json({ users: { total: 1 } }));
    expect((await call("/proxy/overview")).status).toBe(200);
    expect(upstream).toHaveBeenLastCalledWith(`${config.apiBase}/api/v1/admin/overview`, expect.objectContaining({ method: "GET" }));
    for (const [path, method] of [["/proxy/overview?home_id=x", "GET"], ["/proxy/overview", "POST"], ["/proxy/overview/x", "GET"]] as const) {
      expect((await call(path, method, method === "POST" ? {} : undefined)).status, `${method} ${path}`).toBe(404);
    }
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("proxies only read-only user lookups with the declared filters", async () => {
    cookies(await call("/session"));
    cookies(await call("/auth/login", "POST", { email: "a@example.com", password: "secret" }));
    upstream.mockClear();
    upstream.mockImplementation(async () => Response.json({ items: [], total: 0, limit: 25, offset: 0 }));
    expect((await call("/proxy/users?q=alicia&verified=true&limit=25&offset=0")).status).toBe(200);
    expect((await call("/proxy/users/11111111-1111-4111-8111-111111111111")).status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(2);
    for (const [path, method] of [["/proxy/users?password=x", "GET"], ["/proxy/users?q=a&q=b", "GET"], ["/proxy/users/abc", "GET"],
      ["/proxy/users", "POST"], ["/proxy/users/11111111-1111-4111-8111-111111111111", "DELETE"], ["/proxy/users/11111111-1111-4111-8111-111111111111/sessions", "GET"]] as const) {
      expect((await call(path, method, method === "GET" ? undefined : {})).status, `${method} ${path}`).toBe(404);
    }
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("proxies only read-only home lookups with the declared filters", async () => {
    cookies(await call("/session"));
    cookies(await call("/auth/login", "POST", { email: "a@example.com", password: "secret" }));
    upstream.mockClear();
    upstream.mockImplementation(async () => Response.json({ items: [], total: 0, limit: 25, offset: 0 }));
    expect((await call("/proxy/homes?q=PILOT-01&distributor=EDESUR&limit=25&offset=0")).status).toBe(200);
    expect((await call("/proxy/homes/11111111-1111-4111-8111-111111111111")).status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(2);
    for (const [path, method] of [["/proxy/homes?name=x", "GET"], ["/proxy/homes?q=a&q=b", "GET"], ["/proxy/homes/abc", "GET"],
      ["/proxy/homes", "POST"], ["/proxy/homes/11111111-1111-4111-8111-111111111111", "DELETE"], ["/proxy/homes/11111111-1111-4111-8111-111111111111/members", "GET"]] as const) {
      expect((await call(path, method, method === "GET" ? undefined : {})).status, `${method} ${path}`).toBe(404);
    }
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("proxies only read-only bill lookups: the aggregate summary and one home's bills", async () => {
    cookies(await call("/session"));
    cookies(await call("/auth/login", "POST", { email: "a@example.com", password: "secret" }));
    upstream.mockClear();
    upstream.mockImplementation(async () => Response.json({ items: [], total: 0, limit: 25, offset: 0 }));
    const home = "11111111-1111-4111-8111-111111111111";
    expect((await call("/proxy/bills/summary?days=30")).status).toBe(200);
    expect((await call(`/proxy/homes/${home}/bills?limit=25&offset=0`)).status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(2);
    for (const [path, method] of [["/proxy/bills", "GET"], ["/proxy/bills/summary?home_id=x", "GET"], ["/proxy/bills/summary", "POST"],
      [`/proxy/homes/${home}/bills?q=x`, "GET"], [`/proxy/homes/${home}/bills`, "POST"], [`/proxy/homes/${home}/bills/abc`, "GET"],
      ["/proxy/homes/abc/bills", "GET"]] as const) {
      expect((await call(path, method, method === "GET" ? undefined : {})).status, `${method} ${path}`).toBe(404);
    }
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("proxies the tariff coverage as read-only and refuses writes or parameters", async () => {
    cookies(await call("/session"));
    cookies(await call("/auth/login", "POST", { email: "a@example.com", password: "secret" }));
    upstream.mockClear();
    upstream.mockImplementation(async () => Response.json({ today: "2026-10-15", warn_days: 30, coverage: [], versions: [] }));
    expect((await call("/proxy/tariffs")).status).toBe(200);
    expect(upstream).toHaveBeenLastCalledWith(`${config.apiBase}/api/v1/admin/tariffs`, expect.objectContaining({ method: "GET" }));
    for (const [path, method] of [["/proxy/tariffs?on=2026-01-01", "GET"], ["/proxy/tariffs", "POST"], ["/proxy/tariffs", "DELETE"], ["/proxy/tariffs/x", "GET"]] as const) {
      expect((await call(path, method, method === "GET" ? undefined : {})).status, `${method} ${path}`).toBe(404);
    }
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("proxies the background-job views as read-only with only the declared filters", async () => {
    cookies(await call("/session"));
    cookies(await call("/auth/login", "POST", { email: "a@example.com", password: "secret" }));
    upstream.mockClear();
    upstream.mockImplementation(async () => Response.json({ items: [], total: 0, limit: 25, offset: 0, kinds: [] }));
    expect((await call("/proxy/jobs/summary")).status).toBe(200);
    expect((await call("/proxy/jobs?kind=ocr.process&status=dead&limit=25&offset=0")).status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(2);
    for (const [path, method] of [["/proxy/jobs/summary?kind=x", "GET"], ["/proxy/jobs?payload=1", "GET"], ["/proxy/jobs?status=a&status=b", "GET"],
      ["/proxy/jobs", "POST"], ["/proxy/jobs", "DELETE"], ["/proxy/jobs/1", "GET"], ["/proxy/jobs/summary", "POST"]] as const) {
      expect((await call(path, method, method === "GET" ? undefined : {})).status, `${method} ${path}`).toBe(404);
    }
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("proxies the AI usage as read-only with only the days filter", async () => {
    cookies(await call("/session"));
    cookies(await call("/auth/login", "POST", { email: "a@example.com", password: "secret" }));
    upstream.mockClear();
    upstream.mockImplementation(async () => Response.json({ days: 14 }));
    expect((await call("/proxy/ai/usage?days=14")).status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
    for (const [path, method] of [["/proxy/ai/usage?user=x", "GET"], ["/proxy/ai/usage?days=1&days=2", "GET"], ["/proxy/ai/usage", "POST"],
      ["/proxy/ai/conversations", "GET"], ["/proxy/ai/usage/x", "GET"], ["/proxy/ai", "GET"]] as const) {
      expect((await call(path, method, method === "GET" ? undefined : {})).status, `${method} ${path}`).toBe(404);
    }
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("proxies the system status as read-only and refuses writes or parameters", async () => {
    cookies(await call("/session"));
    cookies(await call("/auth/login", "POST", { email: "a@example.com", password: "secret" }));
    upstream.mockClear();
    upstream.mockImplementation(async () => Response.json({ environment: "development" }));
    expect((await call("/proxy/system")).status).toBe(200);
    expect(upstream).toHaveBeenLastCalledWith(`${config.apiBase}/api/v1/admin/system`, expect.objectContaining({ method: "GET" }));
    for (const [path, method] of [["/proxy/system?verbose=1", "GET"], ["/proxy/system", "POST"], ["/proxy/system", "PUT"], ["/proxy/system/env", "GET"], ["/proxy/system/config", "GET"]] as const) {
      expect((await call(path, method, method === "GET" ? undefined : {})).status, `${method} ${path}`).toBe(404);
    }
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("proxies scoped user requests and session actions only on the declared methods and filters", async () => {
    cookies(await call("/session"));
    cookies(await call("/auth/login", "POST", { email: "a@example.com", password: "secret" }));
    upstream.mockClear();
    upstream.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith("/requests") && init.method === "POST")
        return Response.json({ id: "11111111-1111-4111-8111-111111111111", status: "pending" }, { status: 201 });
      return Response.json({ items: [], total: 0, limit: 25, offset: 0 });
    });
    const userId = "22222222-2222-4222-8222-222222222222";
    const requestId = "11111111-1111-4111-8111-111111111111";
    const created = await call(`/proxy/users/${userId}/requests`, "POST", { kind: "export", reason: "solicitud recibida" });
    expect(created.status).toBe(201);
    expect((await call("/proxy/user-requests?status=pending&limit=25&offset=0")).status).toBe(200);
    expect((await call(`/proxy/user-requests/${requestId}/transition`, "POST", { status: "in_progress", reason: "caso asignado" })).status).toBe(200);
    expect((await call(`/proxy/users/${userId}/sessions/close`, "POST", { reason: "sesiones revocadas" })).status).toBe(200);
    expect((await call(`/proxy/users/${userId}/deactivate`, "POST", { reason: "cuenta desactivada" })).status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(5);
    for (const [path, method] of [
      [`/proxy/users/${userId}/requests`, "GET"], [`/proxy/users/${userId}/sessions/close`, "GET"],
      [`/proxy/users/${userId}/deactivate`, "DELETE"], [`/proxy/user-requests?status=pending&status=rejected`, "GET"],
      [`/proxy/user-requests?home_id=x`, "GET"], [`/proxy/user-requests/${requestId}/delete`, "POST"],
    ] as const) {
      expect((await call(path, method, method === "GET" ? undefined : {})).status, `${method} ${path}`).toBe(404);
    }
    expect(upstream).toHaveBeenCalledTimes(5);
  });
});
