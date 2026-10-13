// @vitest-environment node
// ERD-AUTH-05: recuperación de contraseña a través del BFF (rutas públicas, sin sesión).
import { describe, expect, it, vi } from "vitest";
import { handleBff } from "./bff";

const config = { enabled: true, apiBase: "http://127.0.0.1:8011", origin: "http://localhost:3000", secure: false };
const EPOCH = "0123456789abcdef0123456789abcdef";
const TOKEN = "A".repeat(40) + "_-9";
const PASSWORD = "nueva-contraseña-segura";
const req = (path: string, body: unknown, headers: Record<string, string> = {}, method = "POST") => new Request(`http://localhost:3000/api/bff/${path}`, {
  method, headers: { origin: config.origin, "content-type": "application/json", ...headers }, ...(method === "GET" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
});
const json = (body: unknown, status: number, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("POST /auth/password/forgot", () => {
  it("forwards only the strict email body, without cookies or Authorization, and returns 202 accepted", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ status: "accepted" }, 202));
    const response = await handleBff(req("auth/password/forgot", { email: "a@b.test" }, { cookie: `erd-epoch=${EPOCH}; erd-access=${EPOCH}~acc; erd-logout=${EPOCH}~ref` }), config, upstream);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "accepted" });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8011/api/v1/auth/password/forgot");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ email: "a@b.test" });
    const sent = new Headers(init.headers);
    expect(sent.get("authorization")).toBeNull();
    expect(sent.get("cookie")).toBeNull();
    expect(init.redirect).toBe("manual");
  });
  it("does not require the auth epoch handshake (no session is issued)", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ status: "accepted" }, 202));
    const response = await handleBff(req("auth/password/forgot", { email: "a@b.test" }), config, upstream);
    expect(response.status).toBe(202);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it.each([
    [{}], [{ email: "not-an-email" }], [{ email: "a@b.test", extra: 1 }], [{ email: `${"a".repeat(250)}@b.test` }], [{ email: 5 }],
  ])("rejects non-strict body %j with 422 before contacting the API", async body => {
    const upstream = vi.fn();
    const response = await handleBff(req("auth/password/forgot", body), config, upstream);
    expect(response.status).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("keeps Origin, Sec-Fetch-Site and JSON content-type checks", async () => {
    const upstream = vi.fn();
    expect((await handleBff(req("auth/password/forgot", { email: "a@b.test" }, { origin: "https://evil.test" }), config, upstream)).status).toBe(403);
    expect((await handleBff(req("auth/password/forgot", { email: "a@b.test" }, { "sec-fetch-site": "cross-site" }), config, upstream)).status).toBe(403);
    expect((await handleBff(req("auth/password/forgot", { email: "a@b.test" }, { "content-type": "text/plain" }), config, upstream)).status).toBe(415);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("only allows POST on the exact path and no query string", async () => {
    const upstream = vi.fn();
    for (const [path, method] of [["auth/password/forgot", "GET"], ["auth/password/forgot", "PUT"], ["auth/password/forgot/", "POST"], ["auth/password", "POST"], ["auth/password/change", "POST"], ["auth/password/forgot?next=x", "POST"]] as const) {
      const response = await handleBff(req(path, { email: "a@b.test" }, {}, method), config, upstream);
      expect(response.status, `${method} ${path}`).toBeGreaterThanOrEqual(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });
  it("rejects a non-202 success or a body outside the contract as 502", async () => {
    for (const reply of [json({ status: "accepted" }, 200), json({ status: "sent", email: "a@b.test" }, 202), new Response(null, { status: 204 })]) {
      const response = await handleBff(req("auth/password/forgot", { email: "a@b.test" }), config, vi.fn().mockResolvedValue(reply));
      expect(response.status).toBe(502);
    }
  });
  it("maps 429 to a local message with a bounded Retry-After and never forwards upstream detail", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ detail: "private upstream text a@b.test", code: "rate_limited" }, 429, { "Retry-After": "120", "X-Private": "1" }));
    const response = await handleBff(req("auth/password/forgot", { email: "a@b.test" }), config, upstream);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("120");
    expect(response.headers.get("x-private")).toBeNull();
    const text = await response.text();
    expect(text).not.toContain("private upstream text");
    expect(JSON.parse(text).detail).toMatch(/demasiad/i);
  });
  it("drops an out-of-contract Retry-After", async () => {
    const upstream = vi.fn().mockResolvedValue(json({}, 429, { "Retry-After": "Sun, 04 Oct 2026 20:00:00 GMT" }));
    const response = await handleBff(req("auth/password/forgot", { email: "a@b.test" }), config, upstream);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeNull();
  });
});

describe("POST /auth/password/reset", () => {
  it("preserves login B cookies when reset A completes late", async () => {
    let finish!: (response: Response) => void;
    const jar = new Map([["erd-epoch", EPOCH], ["erd-access", `${EPOCH}~accessA`], ["erd-logout", `${EPOCH}~refreshA`]]);
    const cookies = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const apply = (response: Response) => {
      for (const cookie of response.headers.getSetCookie()) {
        const [name, value] = cookie.split(";")[0].split("=");
        if (/Max-Age=0/i.test(cookie)) jar.delete(name); else jar.set(name, value);
      }
    };
    const upstream = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith("/password/reset")) return new Promise<Response>(resolve => { finish = resolve; });
      if (url.endsWith("/login")) return json({ access_token: "accessB", refresh_token: "refreshB", token_type: "bearer", expires_in: 900 }, 200);
      return new Headers(init.headers).get("authorization") === "Bearer accessB"
        ? json({ id: "11111111-1111-4111-8111-111111111111", email: "b@b.test", role: "user", created_at: "2026-01-01T00:00:00Z" }, 200)
        : json({}, 401);
    });
    const reset = handleBff(req("auth/password/reset", { token: TOKEN, new_password: PASSWORD }, { cookie: cookies() }), config, upstream);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    const login = await handleBff(req("auth/login", { email: "b@b.test", password: PASSWORD }, { cookie: cookies() }), config, upstream);
    expect(login.status).toBe(200); apply(login);
    const before = cookies();
    finish(new Response(null, { status: 204 }));
    const late = await reset; apply(late);
    expect(late.status).toBe(204);
    expect(cookies()).toBe(before);
    expect(jar.get("erd-access")).toBe(`${EPOCH}~accessB`);
    const me = await handleBff(req("auth/me", undefined, { cookie: cookies() }, "GET"), config, upstream);
    expect(me.status).toBe(200);
    expect((await me.json()).email).toBe("b@b.test");
    // Model the API rejecting A after its revocation. The BFF must preserve this 401,
    // but its late response must not mutate B's cookies either.
    const old = await handleBff(req("auth/me", undefined, { cookie: `erd-epoch=${EPOCH}; erd-access=${EPOCH}~accessA` }, "GET"), config, upstream);
    expect(old.status).toBe(401); apply(old);
    expect(cookies()).toBe(before);
    expect(upstream.mock.calls.some(([url]) => url.endsWith("/logout"))).toBe(false);
  });
  const sessionCookies = `erd-epoch=${EPOCH}; erd-access=${EPOCH}~acc; erd-logout=${EPOCH}~ref`;
  it("forwards only {token,new_password}, returns 204 without parsing a body, does not mutate browser cookies", async () => {
    const upstream = vi.fn().mockImplementation(async (url: string) => url.endsWith("/auth/password/reset") ? new Response(null, { status: 204 }) : json({}, 401));
    const response = await handleBff(req("auth/password/reset", { token: TOKEN, new_password: PASSWORD }, { cookie: sessionCookies }), config, upstream);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8011/api/v1/auth/password/reset");
    expect(JSON.parse(init.body)).toEqual({ token: TOKEN, new_password: PASSWORD });
    expect(new Headers(init.headers).get("authorization")).toBeNull();
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(response.headers.get("cache-control")).toContain("no-store");
    // La API ya revocó todas las sesiones: no se añade otro write/await que pueda hacer vencer
    // el timeout del cliente después de que el token haya sido consumido.
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("works without any cookie (no epoch handshake required)", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const response = await handleBff(req("auth/password/reset", { token: TOKEN, new_password: PASSWORD }), config, upstream);
    expect(response.status).toBe(204);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
  it.each([
    [{ token: TOKEN }],
    [{ new_password: PASSWORD }],
    [{ token: TOKEN.slice(1), new_password: PASSWORD }],
    [{ token: `${TOKEN.slice(1)}=`, new_password: PASSWORD }],
    [{ token: `${TOKEN.slice(1)}+`, new_password: PASSWORD }],
    [{ token: TOKEN, new_password: "short" }],
    [{ token: TOKEN, new_password: "x".repeat(129) }],
    [{ token: TOKEN, new_password: PASSWORD, email: "a@b.test" }],
    [{ token: TOKEN, password: PASSWORD }],
  ])("rejects non-strict body %j with 422 before contacting the API", async body => {
    const upstream = vi.fn();
    const response = await handleBff(req("auth/password/reset", body), config, upstream);
    expect(response.status).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("names the field locally on a malformed token or weak password, never echoing input", async () => {
    const response = await handleBff(req("auth/password/reset", { token: "bad", new_password: "short" }), config, vi.fn());
    const body = await response.json();
    expect(body.code).toBe("validation_error");
    expect(body.detail.map((d: { loc: string[] }) => d.loc.at(-1)).sort()).toEqual(["new_password", "token"]);
    expect(JSON.stringify(body)).not.toContain("short");
  });
  it("maps 400 reset_token_invalid to a local Spanish message, keeps the code and does not touch cookies", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ detail: "token row 42 used at 10:00 by user@x", code: "reset_token_invalid", request_id: "req-1" }, 400));
    const response = await handleBff(req("auth/password/reset", { token: TOKEN, new_password: PASSWORD }, { cookie: sessionCookies }), config, upstream);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("reset_token_invalid");
    expect(body.request_id).toBe("req-1");
    expect(body.detail).toMatch(/enlace/i);
    expect(JSON.stringify(body)).not.toContain("user@x");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("maps an upstream 422 to allowlisted local field messages only", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ detail: [{ loc: ["body", "new_password"], msg: "upstream secret msg" }, { loc: ["body", "internal_field"], msg: "x" }], code: "validation_error" }, 422));
    const response = await handleBff(req("auth/password/reset", { token: TOKEN, new_password: PASSWORD }), config, upstream);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.detail).toEqual([{ loc: ["body", "new_password"], msg: expect.stringMatching(/12 y 128/) }]);
    expect(JSON.stringify(body)).not.toContain("upstream secret msg");
  });
  it("maps 429 with a bounded Retry-After", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ detail: "private" }, 429, { "Retry-After": "86400" }));
    const response = await handleBff(req("auth/password/reset", { token: TOKEN, new_password: PASSWORD }), config, upstream);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("86400");
    expect(await response.text()).not.toContain("private");
  });
  it("treats a non-204 success as a contract error (502) and does not clear cookies", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ ok: true }, 200));
    const response = await handleBff(req("auth/password/reset", { token: TOKEN, new_password: PASSWORD }, { cookie: sessionCookies }), config, upstream);
    expect(response.status).toBe(502);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("never puts the token in the upstream URL", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await handleBff(req("auth/password/reset", { token: TOKEN, new_password: PASSWORD }), config, upstream);
    for (const [url] of upstream.mock.calls) expect(String(url)).not.toContain(TOKEN);
  });
  it("is unavailable when auth is disabled (pilot)", async () => {
    const upstream = vi.fn();
    const response = await handleBff(req("auth/password/reset", { token: TOKEN, new_password: PASSWORD }), { ...config, enabled: false }, upstream);
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
});
