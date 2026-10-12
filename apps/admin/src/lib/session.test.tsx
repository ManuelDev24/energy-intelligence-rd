import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SessionProvider, useSession } from "./session";

function Controls() {
  const { access, login, logout, loading } = useSession();
  return <div><span>{loading ? "loading" : access?.email || "signed out"}</span>
    <button onClick={() => void login("a@example.com", "pass").catch(() => {})}>login</button>
    <button onClick={logout}>logout</button></div>;
}
afterEach(() => vi.unstubAllGlobals());
it("logout prevents a late login from restoring UI state without browser storage", async () => {
  let complete!: (value: Response) => void;
  const pending = new Promise<Response>(resolve => { complete = resolve; });
  const mock = vi.fn(async (url: string) => {
    if (url.endsWith("/session")) return Response.json({ ok: true });
    if (url.endsWith("/auth/refresh")) return Response.json({ error: "Sesión no válida." }, { status: 401 });
    if (url.endsWith("/auth/login")) return pending;
    if (url.endsWith("/auth/logout")) return Response.json({ ok: true });
    return Response.json({ user_id: "u", email: "a@example.com", roles: ["admin"], scopes: [] });
  });
  vi.stubGlobal("fetch", mock);
  const storage = vi.spyOn(Storage.prototype, "setItem");
  render(<SessionProvider><Controls /></SessionProvider>);
  await waitFor(() => expect(screen.getByText("signed out")).toBeTruthy());
  await act(async () => { screen.getByText("login").click(); });
  await waitFor(() => expect(mock.mock.calls.some(([url]) => url.endsWith("/auth/login"))).toBe(true));
  await act(async () => { screen.getByText("logout").click(); });
  await act(async () => { complete(Response.json({ ok: true })); });
  expect(screen.getByText("signed out")).toBeTruthy();
  expect(storage).not.toHaveBeenCalled();
  storage.mockRestore();
});
