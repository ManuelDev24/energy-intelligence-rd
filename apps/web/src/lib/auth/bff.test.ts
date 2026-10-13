// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleBff, readBffConfig } from "./bff";
const config = { enabled: true, apiBase: "http://127.0.0.1:8000", origin: "http://localhost:3000", secure: false, bffApiSharedSecret: "" };
const EPOCH = "0123456789abcdef0123456789abcdef";
const epochCookie = `erd-epoch=${EPOCH}`;
const req = (path: string, method = "GET", body?: unknown, headers = {}) => new Request(`http://localhost:3000/api/bff/${path}`, { method, headers: { origin: config.origin, "content-type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
describe("BFF security boundary", () => {
  it("rejects production pilot and credential-bearing/untrusted API configuration", () => {
    expect(() => readBffConfig({ NODE_ENV: "production" })).toThrow();
    expect(() => readBffConfig({ NODE_ENV: "development", API_BASE_URL: "http://user:secret@example.com" })).toThrow();
    expect(() => readBffConfig({ NODE_ENV: "production", NEXT_PUBLIC_AUTH_ENABLED: "true", API_BASE_URL: "http://localhost:8000", WEB_ORIGIN: "https://energy.example" })).toThrow();
  });
  it("rejects cross-origin and missing-origin writes before fetch", async () => {
    const upstream = vi.fn();
    for (const origin of ["https://evil.test", "null", ""]) {
      const response = await handleBff(req("auth/login", "POST", { email: "a@b.test", password: "long-password" }, { origin }), config, upstream);
      expect(response.status).toBe(403);
    }
    expect(upstream).not.toHaveBeenCalled();
  });
  it("does not allow arbitrary hosts, paths or refresh", async () => {
    const upstream = vi.fn();
    for (const path of ["https://evil.test", "auth/refresh", "homes/../auth/me", "%2f%2fevil.test", "homes?url=http://evil.test"]) {
      expect((await handleBff(req(path), config, upstream)).status).toBeGreaterThanOrEqual(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });
  it("rejects upstream redirects without following them", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://evil.test" } }));
    const response = await handleBff(req("auth/login", "POST", { email: "a@b.test", password: "long-password" }, { cookie: epochCookie }), config, upstream);
    expect(response.status).toBe(502); expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("uses secure host-prefixed cookies without a Domain in HTTPS mode", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "access-secret", refresh_token: "refresh-secret", token_type: "bearer", expires_in: 900 })));
    const response = await handleBff(req("auth/login", "POST", { email: "a@b.test", password: "long-password" }, { cookie: `__Host-erd-epoch=${EPOCH}` }), { ...config, secure: true }, upstream);
    const cookies = response.headers.get("set-cookie")!;
    expect(cookies).toContain("__Host-erd-access"); expect(cookies).toContain("__Host-erd-logout");
    expect(cookies).toContain("Secure"); expect(cookies).not.toContain("Domain=");
  });
  it("forwards only the cookie bearer and strips token fields from me", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", email: "a@b.test", role: "user", created_at: "2026-01-01T00:00:00Z", access_token: "leak" })));
    const response = await handleBff(req("auth/me", "GET", undefined, { cookie: `${epochCookie}; erd-access=${EPOCH}~real-access; other=private`, authorization: "Bearer injected" }), config, upstream);
    expect(response.status).toBe(200); expect(await response.text()).not.toContain("leak");
    expect(upstream.mock.calls[0][1].headers.Authorization).toBe("Bearer real-access");
    expect(upstream.mock.calls[0][1].headers.cookie).toBeUndefined();
  });
  it("does not let a stale unauthorized read erase a newer session or its logout cookie", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "expired" }), { status: 401 }));
    const response = await handleBff(req("auth/me", "GET", undefined, { cookie: "erd-access=expired; erd-logout=still-revocable" }), config, upstream);
    expect(response.status).toBe(401); expect(response.headers.has("set-cookie")).toBe(false);
  });
  it("revokes with the server cookie and always clears cookies, without refresh or retry", async () => {
    const upstream = vi.fn().mockRejectedValue(new TypeError("ambiguous"));
    const response = await handleBff(req("auth/logout", "POST", {}, { cookie: "erd-logout=logout-secret" }), config, upstream);
    expect(response.status).toBe(502); expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await response.text()).not.toContain("logout-secret");
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(JSON.parse(upstream.mock.calls[0][1].body)).toEqual({ refresh_token: "logout-secret" });
  });
  it("rejects unknown credential fields and never echoes password validation inputs", async () => {
    const upstream = vi.fn();
    const response = await handleBff(req("auth/register", "POST", { email: "a@b.test", password: "short-secret", role: "admin" }), config, upstream);
    expect(response.status).toBe(422); expect(await response.text()).not.toContain("short-secret"); expect(upstream).not.toHaveBeenCalled();
  });
  it("rejects credentials smuggled into domain writes", async () => {
    const upstream = vi.fn();
    const response = await handleBff(req("homes", "POST", { name: "Casa", distributor: "EDESUR", refresh_token: "smuggled" }, { cookie: "erd-access=real-access" }), config, upstream);
    expect(response.status).toBe(422); expect(upstream).not.toHaveBeenCalled();
  });
  it("keeps tokens exclusively in HttpOnly cookies and never forwards browser credentials", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "access-secret", refresh_token: "refresh-secret", token_type: "bearer", expires_in: 900 }), { status: 200 }));
    const response = await handleBff(req("auth/login", "POST", { email: "a@b.test", password: "long-password" }, { authorization: "Bearer injected", cookie: `${epochCookie}; other=private` }), config, upstream);
    expect(await response.text()).toBe('{"ok":true}');
    const cookies = response.headers.get("set-cookie")!;
    expect(cookies).toContain("HttpOnly"); expect(cookies).toContain("SameSite=strict");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const init = upstream.mock.calls[0][1];
    expect(init.headers).not.toHaveProperty("cookie"); expect(init.headers).not.toHaveProperty("authorization");
    expect(init.redirect).toBe("manual");
  });
  it("never forwards upstream free text: errors are local Spanish messages chosen by status/code/field", async () => {
    const leak = "psycopg2 SELECT password_hash FROM users <script>alert(1)</script>";
    const respond = (status: number, body: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
    const cases: [string, string, unknown, number, unknown, string][] = [
      ["auth/login", "POST", { email: "a@b.test", password: "long-password" }, 500, { detail: leak, code: leak, request_id: leak }, "Error del servidor. Inténtalo de nuevo más tarde."],
      ["auth/register", "POST", { email: "a@b.test", password: "long-password", accept_terms: true }, 409, { detail: leak, code: "conflict" }, "Ya existe una cuenta con este correo electrónico."],
      ["auth/login", "POST", { email: "a@b.test", password: "long-password" }, 401, { detail: leak, code: "http_401" }, "Credenciales inválidas."],
      ["auth/login", "POST", { email: "a@b.test", password: "long-password" }, 418, { detail: leak }, "No se pudo completar la solicitud."],
    ];
    for (const [path, method, body, status, upstreamBody, expected] of cases) {
      const response = await handleBff(req(path, method, body, { cookie: epochCookie }), config, respond(status, upstreamBody));
      const text = await response.text();
      expect(response.status).toBe(status);
      expect(text).not.toContain("psycopg2"); expect(text).not.toContain("<script>");
      expect(JSON.parse(text).detail).toBe(expected);
    }
    const validation = await handleBff(req("auth/register", "POST", { email: "a@b.test", password: "long-password", accept_terms: true }, { cookie: epochCookie }), config,
      respond(422, { detail: [{ loc: ["body", "password"], msg: leak }, { loc: ["body", "evil_field"], msg: leak }, { loc: ["body"], msg: leak }], code: "validation_error", request_id: "req-123" }));
    const parsed = JSON.parse(await validation.clone().text());
    expect(await validation.text()).not.toContain("psycopg2");
    expect(parsed).toEqual({ detail: [{ loc: ["body", "password"], msg: "La contraseña debe tener entre 12 y 128 caracteres." }], code: "validation_error", request_id: "req-123" });
  });
  it("maps the BFF's own validation errors to the local field table, never to library text", async () => {
    const response = await handleBff(req("auth/register", "POST", { email: "not-an-email", password: "short", accept_terms: true }), config, vi.fn());
    expect(response.status).toBe(422);
    expect((await response.json()).detail).toEqual([
      { loc: ["body", "email"], msg: "Introduce un correo electrónico válido." },
      { loc: ["body", "password"], msg: "La contraseña debe tener entre 12 y 128 caracteres." },
    ]);
  });
  it("rejects registration without explicit true consent and never sends a client-chosen terms version", async () => {
    const upstream = vi.fn();
    const bads = [{}, { accept_terms: false }, { accept_terms: "true" }, { accept_terms: 1 }, { terms_version: "2026-10-draft", accept_terms: true }];
    for (const bad of bads) {
      const response = await handleBff(req("auth/register", "POST", { email: "a@b.test", password: "long-password", ...bad }, { cookie: epochCookie }), config, upstream);
      expect(response.status).toBe(422);
    }
    expect(upstream).not.toHaveBeenCalled();
  });
  it("forwards accept_terms: true to the API on a valid registration", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "a", refresh_token: "b", token_type: "bearer", expires_in: 900 })));
    const response = await handleBff(req("auth/register", "POST", { email: "a@b.test", password: "long-password", accept_terms: true }, { cookie: epochCookie }), config, upstream);
    expect(response.status).toBe(200);
    expect(JSON.parse(upstream.mock.calls[0][1].body)).toEqual({ email: "a@b.test", password: "long-password", accept_terms: true });
  });
  it("requires a per-browser auth epoch before contacting upstream for login/register", async () => {
    const upstream = vi.fn();
    for (const path of ["auth/login", "auth/register"]) {
      const response = await handleBff(req(path, "POST", { email: "a@b.test", password: "long-password", ...(path === "auth/register" ? { accept_terms: true } : {}) }), config, upstream);
      expect(response.status).toBe(428);
      expect((await response.json()).code).toBe("auth_epoch_required");
      expect(response.headers.get("set-cookie")).toMatch(/erd-epoch=[0-9a-f]{32}; .*HttpOnly/i);
    }
    expect(upstream).not.toHaveBeenCalled();
  });
  it("a login whose response lands after a logout can neither restore nor keep a server session", async () => {
    const jar = new Map<string, string>([["erd-epoch", EPOCH]]);
    const header = () => [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    const store = (response: Response) => {
      for (const line of response.headers.getSetCookie()) {
        const [pair] = line.split(";"); const at = pair.indexOf("=");
        if (/max-age=0/i.test(line)) jar.delete(pair.slice(0, at)); else jar.set(pair.slice(0, at), pair.slice(at + 1));
      }
    };
    const user = { id: "11111111-1111-4111-8111-111111111111", email: "a@b.test", role: "user", created_at: "2026-01-01T00:00:00Z" };
    const upstream = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async url => url.endsWith("/auth/login") ? new Response(JSON.stringify({ access_token: "late-access", refresh_token: "late-refresh", token_type: "bearer", expires_in: 900 }))
      : url.endsWith("/auth/logout") ? new Response(null, { status: 204 }) : new Response(JSON.stringify(user)));
    const login = handleBff(req("auth/login", "POST", { email: "a@b.test", password: "long-password" }, { cookie: header() }), config, upstream as typeof fetch);
    store(await handleBff(req("auth/logout", "POST", {}, { cookie: header() }), config, upstream as typeof fetch)); // other tab logs out first
    store(await login); // the slow login's Set-Cookie arrives afterwards
    const me = await handleBff(req("auth/me", "GET", undefined, { cookie: header() }), config, upstream as typeof fetch);
    expect(me.status).toBe(401);
    expect(upstream.mock.calls.some(([url]) => String(url).endsWith("/auth/me"))).toBe(false);
    const revocations = upstream.mock.calls.filter(([url]) => String(url).endsWith("/auth/logout"));
    expect(revocations.map(([, init]) => JSON.parse(String(init?.body)))).toContainEqual({ refresh_token: "late-refresh" });
  });
  it("a session bound to the current epoch keeps working", async () => {
    const upstream = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "fresh-access", refresh_token: "fresh-refresh", token_type: "bearer", expires_in: 900 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", email: "a@b.test", role: "user", created_at: "2026-01-01T00:00:00Z" })));
    const login = await handleBff(req("auth/login", "POST", { email: "a@b.test", password: "long-password" }, { cookie: epochCookie }), config, upstream);
    const cookies = login.headers.getSetCookie().map(line => line.split(";")[0]).join("; ");
    const me = await handleBff(req("auth/me", "GET", undefined, { cookie: `${epochCookie}; ${cookies}` }), config, upstream);
    expect(me.status).toBe(200);
    expect(upstream.mock.calls[1][1].headers.Authorization).toBe("Bearer fresh-access");
  });
  // ---------- ERD-SEC-PROXY-01: BFF signs the real browser IP for the API's abuse budget ----------
  it("reads BFF_API_SHARED_SECRET from the environment", () => {
    expect(readBffConfig({ NODE_ENV: "development" }).bffApiSharedSecret).toBe("");
    expect(readBffConfig({ NODE_ENV: "development", BFF_API_SHARED_SECRET: "topsecret" }).bffApiSharedSecret).toBe("topsecret");
  });
  it("signs X-Forwarded-Client-Ip from the first X-Forwarded-For hop when a shared secret is configured", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", email: "a@b.test", role: "user", created_at: "2026-01-01T00:00:00Z" })));
    const signedConfig = { ...config, bffApiSharedSecret: "x".repeat(48) };
    const response = await handleBff(req("auth/me", "GET", undefined, { cookie: `${epochCookie}; erd-access=${EPOCH}~real-access`, "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), signedConfig, upstream);
    expect(response.status).toBe(200);
    const signed = upstream.mock.calls[0][1].headers["X-Forwarded-Client-Ip"] as string;
    expect(signed.startsWith("203.0.113.7.")).toBe(true);
    const mac = signed.slice(signed.length - 64);
    expect(mac).toMatch(/^[0-9a-f]{64}$/);
  });
  it("does not send X-Forwarded-Client-Ip when no shared secret is configured", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", email: "a@b.test", role: "user", created_at: "2026-01-01T00:00:00Z" })));
    const response = await handleBff(req("auth/me", "GET", undefined, { cookie: `${epochCookie}; erd-access=${EPOCH}~real-access`, "x-forwarded-for": "203.0.113.7" }), config, upstream);
    expect(response.status).toBe(200);
    expect(upstream.mock.calls[0][1].headers["X-Forwarded-Client-Ip"]).toBeUndefined();
  });
  it("does not send X-Forwarded-Client-Ip when there is no X-Forwarded-For header", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", email: "a@b.test", role: "user", created_at: "2026-01-01T00:00:00Z" })));
    const signedConfig = { ...config, bffApiSharedSecret: "x".repeat(48) };
    const response = await handleBff(req("auth/me", "GET", undefined, { cookie: `${epochCookie}; erd-access=${EPOCH}~real-access` }), signedConfig, upstream);
    expect(response.status).toBe(200);
    expect(upstream.mock.calls[0][1].headers["X-Forwarded-Client-Ip"]).toBeUndefined();
  });
});
