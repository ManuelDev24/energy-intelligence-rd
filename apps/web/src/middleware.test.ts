// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("probes the session with the access, epoch and revocation cookies only", async () => {
  vi.stubEnv("NEXT_PUBLIC_AUTH_ENABLED", "true");
  const probe = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
  const epoch = "0123456789abcdef0123456789abcdef";
  const response = await middleware(new NextRequest("http://localhost:3000/dashboard", { headers: { cookie: `erd-epoch=${epoch}; erd-access=${epoch}~a; erd-logout=${epoch}~r; other=private` } }));
  expect(response.headers.get("location")).toBeNull();
  const cookie = new Headers(probe.mock.calls[0][1]?.headers).get("cookie") ?? "";
  expect(cookie.split("; ").sort()).toEqual([`erd-access=${epoch}~a`, `erd-epoch=${epoch}`, `erd-logout=${epoch}~r`]);
});

it("pone una CSP con nonce distinto en cada página, también en las públicas y en las redirecciones", async () => {
  vi.stubEnv("NEXT_PUBLIC_AUTH_ENABLED", "true");
  const first = await middleware(new NextRequest("http://localhost:3000/login"));
  const second = await middleware(new NextRequest("http://localhost:3000/login"));
  const nonceOf = (response: Response) => /'nonce-([^']+)'/.exec(response.headers.get("content-security-policy") ?? "")?.[1];
  expect(nonceOf(first)).toBeTruthy();
  expect(nonceOf(first)).not.toBe(nonceOf(second));
  expect(first.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  const redirected = await middleware(new NextRequest("http://localhost:3000/dashboard")); // sin sesión
  expect(redirected.headers.get("location")).toBe("http://localhost:3000/login");
  expect(redirected.headers.get("content-security-policy")).toContain("object-src 'none'");
});

it("las páginas con token en el fragmento (restablecer e invitación) no envían Referer y no se guardan en caché", async () => {
  for (const path of ["/restablecer-contrasena", "/invitacion"]) {
    const response = await middleware(new NextRequest(`http://localhost:3000${path}`));
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
  }
});
