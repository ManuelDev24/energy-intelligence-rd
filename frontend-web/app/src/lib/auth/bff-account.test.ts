// @vitest-environment node
// ERD-AUTH-03: aceptación de términos en el registro, versiones legales públicas y
// eliminación de cuenta con reautenticación a través del BFF.
import { describe, expect, it, vi } from "vitest";
import { handleBff } from "./bff";

const config = { enabled: true, apiBase: "http://127.0.0.1:8000", origin: "http://localhost:3000", secure: false };
const EPOCH = "0123456789abcdef0123456789abcdef";
const epochCookie = `erd-epoch=${EPOCH}`;
const accessCookie = `erd-access=${EPOCH}~real-access`;
const req = (path: string, method = "GET", body?: unknown, headers = {}) =>
  new Request(`http://localhost:3000/api/bff/${path}`, {
    method,
    headers: { origin: config.origin, "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe("GET /legal passthrough", () => {
  it("returns the public draft legal versions without requiring a session", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ terms_version: "2026-10-draft", privacy_version: "2026-10-draft", status: "draft" })));
    const response = await handleBff(new Request("http://localhost:3000/api/bff/legal", { method: "GET" }), config, upstream);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ terms_version: "2026-10-draft", privacy_version: "2026-10-draft", status: "draft" });
    expect(upstream.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
  it("rejects a non-draft or malformed legal response from upstream", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ terms_version: "x", privacy_version: "y", status: "final" })));
    const response = await handleBff(new Request("http://localhost:3000/api/bff/legal", { method: "GET" }), config, upstream);
    expect(response.status).toBe(502);
  });
  it("rejects any query string or non-GET method on /legal", async () => {
    const upstream = vi.fn();
    expect((await handleBff(new Request("http://localhost:3000/api/bff/legal?x=1", { method: "GET" }), config, upstream)).status).toBe(400);
    expect((await handleBff(req("legal", "POST", {}), config, upstream)).status).toBeGreaterThanOrEqual(400);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("DELETE /auth/me (account deletion)", () => {
  it("deletes the account with a strict password body and clears cookies + rotates the epoch on success", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const response = await handleBff(req("auth/me", "DELETE", { password: "correct-horse-battery" }, { cookie: `${epochCookie}; ${accessCookie}` }), config, upstream);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    const cookies = response.headers.get("set-cookie")!;
    expect(cookies).toContain("erd-access=;"); expect(cookies).toContain("Max-Age=0");
    expect(cookies).toMatch(/erd-epoch=[0-9a-f]{32}/);
    expect(upstream.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/v1/auth/me");
    expect(upstream.mock.calls[0][1].method).toBe("DELETE");
    expect(upstream.mock.calls[0][1].headers.Authorization).toBe("Bearer real-access");
    expect(JSON.parse(upstream.mock.calls[0][1].body)).toEqual({ password: "correct-horse-battery" });
  });
  it("rejects unknown fields and short passwords locally before contacting upstream", async () => {
    const upstream = vi.fn();
    for (const body of [{ password: "short" }, { password: "correct-horse-battery", confirm: "x" }, {}]) {
      const response = await handleBff(req("auth/me", "DELETE", body, { cookie: `${epochCookie}; ${accessCookie}` }), config, upstream);
      expect(response.status).toBe(422);
    }
    expect(upstream).not.toHaveBeenCalled();
  });
  it("requires a valid session and never clears cookies on a failed deletion", async () => {
    const response = await handleBff(req("auth/me", "DELETE", { password: "correct-horse-battery" }), config, vi.fn());
    expect(response.status).toBe(401);
    expect(response.headers.has("set-cookie")).toBe(false);
  });
  it("maps wrong password to a local Spanish message and does not clear the session", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "upstream secret", code: "reauthentication_failed" }), { status: 403 }));
    const response = await handleBff(req("auth/me", "DELETE", { password: "correct-horse-battery" }, { cookie: `${epochCookie}; ${accessCookie}` }), config, upstream);
    expect(response.status).toBe(403);
    expect(response.headers.has("set-cookie")).toBe(false);
    const text = await response.text();
    expect(text).not.toContain("upstream secret");
    expect(JSON.parse(text).detail).toBe("La contraseña no es correcta.");
  });
  it("maps sole-owner ownership conflict to a local Spanish message without clearing the session", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "upstream secret", code: "ownership_transfer_required" }), { status: 409 }));
    const response = await handleBff(req("auth/me", "DELETE", { password: "correct-horse-battery" }, { cookie: `${epochCookie}; ${accessCookie}` }), config, upstream);
    expect(response.status).toBe(409);
    expect(response.headers.has("set-cookie")).toBe(false);
    const detail = (await response.json()).detail;
    expect(detail).not.toContain("upstream secret");
    expect(typeof detail).toBe("string");
  });
  it("preserves a bounded Retry-After on 429 without forwarding upstream details", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "upstream secret" }), { status: 429, headers: { "Retry-After": "30" } }));
    const response = await handleBff(req("auth/me", "DELETE", { password: "correct-horse-battery" }, { cookie: `${epochCookie}; ${accessCookie}` }), config, upstream);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
  });
});
