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
