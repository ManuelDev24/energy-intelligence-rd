// @vitest-environment node
// ERD-AUTH-05: las pantallas de recuperación son públicas y la de restablecer no filtra el Referer.
import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "./middleware";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it.each(["true", "false"])("never redirects the recovery pages to /login (auth=%s) and never probes the session", async enabled => {
  vi.stubEnv("NEXT_PUBLIC_AUTH_ENABLED", enabled);
  const probe = vi.spyOn(globalThis, "fetch");
  for (const path of ["/olvide-contrasena", "/restablecer-contrasena", "/login", "/login?restablecida=1"]) {
    const response = await middleware(new NextRequest(`http://localhost:3000${path}`));
    expect(response.headers.get("location"), path).toBeNull();
    expect(response.status, path).toBe(200);
  }
  expect(probe).not.toHaveBeenCalled();
});

it("sends Referrer-Policy: no-referrer and no-store on the reset page", async () => {
  vi.stubEnv("NEXT_PUBLIC_AUTH_ENABLED", "true");
  const response = await middleware(new NextRequest("http://localhost:3000/restablecer-contrasena?x=1"));
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(config.matcher).toContain("/restablecer-contrasena");
});

it("does not treat lookalike paths as the reset page nor as public protected routes", async () => {
  vi.stubEnv("NEXT_PUBLIC_AUTH_ENABLED", "true");
  const response = await middleware(new NextRequest("http://localhost:3000/dashboard"));
  expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  expect(response.headers.get("referrer-policy")).toBeNull();
});
