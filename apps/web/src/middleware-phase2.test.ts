// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "./middleware";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("las pantallas de fase 2 (/readings, /goal) están protegidas como el resto", async () => {
  vi.stubEnv("NEXT_PUBLIC_AUTH_ENABLED", "true");
  const probe = vi.spyOn(globalThis, "fetch");
  for (const path of ["/readings", "/goal", "/profile"]) {
    const response = await middleware(new NextRequest(`http://localhost:3000${path}`));
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
    expect(config.matcher).toContain(`${path}/:path*`);
  }
  expect(probe).not.toHaveBeenCalled();
});
