// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleBff } from "./bff";

const config = { enabled: true, apiBase: "http://127.0.0.1:8011", origin: "http://localhost:3000", secure: false };
const credentials = { email: "disposable@example.com", password: "test-only-password" };
const registerCredentials = { ...credentials, accept_terms: true };
function request(path: string) {
  return new Request(`${config.origin}/api/bff/${path}`, { method: "POST", headers: {
    origin: config.origin, "content-type": "application/json", cookie: "erd-epoch=0123456789abcdef0123456789abcdef",
  }, body: JSON.stringify(path === "auth/register" ? registerCredentials : credentials) });
}

describe("auth rate limit boundary", () => {
  it.each(["1", "86400"])("accepts the delta-seconds boundary %s", async value => {
    const upstream = vi.fn().mockResolvedValue(new Response("{}", { status: 429, headers: { "Retry-After": value } }));
    const response = await handleBff(request("auth/login"), config, upstream);
    expect(response.headers.get("retry-after")).toBe(value);
  });
  it.each([null, "", "0", "-1", "1.5", "1e2", "01", "86401", "999999999999999999", "57, 58", "Sun, 04 Oct 2026 20:00:00 GMT", "private-text"])("rejects invalid or out-of-contract Retry-After %s", async value => {
    const upstream = vi.fn().mockResolvedValue(new Response("{}", { status: 429, headers: value === null ? {} : { "Retry-After": value } }));
    const response = await handleBff(request("auth/register"), config, upstream);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it.each([401, 503])("does not copy the header for status %s", async status => {
    const upstream = vi.fn().mockResolvedValue(new Response("{}", { status, headers: { "Retry-After": "57" } }));
    const response = await handleBff(request("auth/login"), config, upstream);
    expect(response.status).toBe(status);
    expect(response.headers.get("retry-after")).toBeNull();
  });
  it.each(["auth/login", "auth/register"])("%s preserves a bounded Retry-After without forwarding upstream details or headers", async path => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "private upstream text", code: "auth_rate_limited" }), {
      status: 429, headers: { "Retry-After": "57", "Cache-Control": "public", "X-Private-Upstream": "private", "Set-Cookie": "injected=value" },
    }));
    const response = await handleBff(request(path), config, fetchImpl);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("57");
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("x-private-upstream")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).not.toContain("private upstream text");
  });
});
