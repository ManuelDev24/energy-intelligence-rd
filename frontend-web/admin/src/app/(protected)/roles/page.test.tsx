import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SessionProvider } from "@/lib/session";
import RolesPage from "./page";

afterEach(() => vi.unstubAllGlobals());
it.each([
  [[], false],
  [["admin.roles.manage"], true],
])("role management UI reflects granted scopes %j", async (extra, canManage) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/session") || url.endsWith("/auth/refresh")) return Response.json({ ok: true });
    if (url.endsWith("/proxy/me")) return Response.json({ user_id: "u", email: "a@example.com", roles: ["auditor"], scopes: ["admin.roles.read", ...extra] });
    if (url.endsWith("/proxy/roles")) return Response.json([{ id: "role", name: "auditor", description: "Read-only", scopes: ["admin.roles.read"] }]);
    if (url.endsWith("/proxy/role-assignments")) return Response.json({ items: [{ id: "assignment", user_id: "u", role_name: "auditor", reason: "review", granted_at: "2026-01-01", expires_at: null, revoked_at: null, status: "active" }] });
    return Response.json({ error: "unknown" }, { status: 404 });
  }));
  render(<SessionProvider><RolesPage /></SessionProvider>);
  await waitFor(() => expect(screen.getByText("Asignaciones")).toBeTruthy());
  await waitFor(() => expect(screen.getByText("review")).toBeTruthy());
  expect(!!screen.queryByText("Asignar rol")).toBe(canManage);
  expect(!!screen.queryByText("Revocar")).toBe(canManage);
});
