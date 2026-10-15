import { afterEach, expect, it, vi } from "vitest";
import { apiFetch, ApiError } from "./api";

afterEach(() => vi.unstubAllGlobals());
it("uses same-origin BFF without bearer or browser storage and sanitizes errors", async () => {
  const mock = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ detail: "sensitive stack", code: "SECRET" }, { status: 403 }));
  vi.stubGlobal("fetch", mock);
  await expect(apiFetch("/api/v1/admin/roles")).rejects.toMatchObject({ status: 403, message: "No tienes permiso para esta operación." } satisfies Partial<ApiError>);
  expect(mock).toHaveBeenCalledWith("/api/admin/proxy/roles", expect.objectContaining({ cache: "no-store", credentials: "same-origin" }));
  const init = mock.mock.calls[0][1] as RequestInit;
  expect(new Headers(init.headers).has("Authorization")).toBe(false);
});

it("coalesces concurrent refreshes so rotation cannot invalidate the session family", async () => {
  let probes = 0;
  let refreshes = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/admin/auth/refresh") {
      refreshes += 1;
      await new Promise(resolve => setTimeout(resolve, 5));
      return Response.json({ ok: true });
    }
    probes += 1;
    return probes <= 2 ? Response.json({}, { status: 401 }) : Response.json({ roles: [] });
  }));
  await Promise.all([apiFetch("/api/v1/admin/roles"), apiFetch("/api/v1/admin/roles")]);
  expect(refreshes).toBe(1);
});
