// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "./middleware";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
// El matcher es ahora global (CSP en toda página): una ruta «entra» si el patrón la admite.
const matches = (path: string) => config.matcher.some(pattern => new RegExp(`^${pattern}$`).test(path));

it("las pantallas de fase 2 (/readings, /goal) están protegidas como el resto", async () => {
  vi.stubEnv("NEXT_PUBLIC_AUTH_ENABLED", "true");
  const probe = vi.spyOn(globalThis, "fetch");
  for (const path of ["/readings", "/goal", "/profile"]) {
    const response = await middleware(new NextRequest(`http://localhost:3000${path}`));
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
    expect(matches(path), path).toBe(true);
  }
  expect(probe).not.toHaveBeenCalled();
});

it("el matcher cubre las páginas y deja fuera el BFF y los recursos estáticos", () => {
  for (const path of ["/login", "/register", "/legal", "/invitacion", "/restablecer-contrasena", "/dashboard", "/bills/new"]) expect(matches(path), path).toBe(true);
  for (const path of ["/api/bff/auth/me", "/api/bff/homes", "/_next/static/chunks/main.js", "/_next/image", "/brand/logo-96.png", "/favicon.ico"]) expect(matches(path), path).toBe(false);
});
