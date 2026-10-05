import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SessionProvider, useSession } from "../session";
const user = { id: "11111111-1111-4111-8111-111111111111", email: "a@b.test", role: "user", created_at: "2026-01-01T00:00:00Z" };
afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });
function Probe() {
  const session = useSession();
  return <><p>{session.user?.email ?? "anonymous"}</p><p>{session.homeId ?? "no home"}</p><button onClick={() => session.signIn("owned-home")}>Select</button><button onClick={() => void session.signOut()}>Logout</button></>;
}
it("never restores pilot home in account mode and clears home and cache on logout", async () => {
  window.localStorage.setItem("energyrd.homeId", "pilot-home");
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => new Response(JSON.stringify(String(input).endsWith("/me") ? user : { ok: true })));
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><SessionProvider authEnabled><Probe /></SessionProvider></QueryClientProvider>);
  await screen.findByText(user.email);
  expect(screen.getByText("no home")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Select"));
  client.setQueryData(["private"], "account data");
  fireEvent.click(screen.getByText("Logout"));
  await waitFor(() => expect(screen.getByText("anonymous")).toBeInTheDocument());
  expect(screen.getByText("no home")).toBeInTheDocument();
  expect(client.getQueryData(["private"])).toBeUndefined();
  expect(fetcher.mock.calls.some(([path]) => String(path).endsWith("/logout"))).toBe(true);
  expect(window.localStorage.getItem("energyrd.homeId")).toBeNull();
});
it("clears home and cached data on expiry without calling refresh", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(user)));
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><SessionProvider authEnabled><Probe /></SessionProvider></QueryClientProvider>);
  await screen.findByText(user.email); fireEvent.click(screen.getByText("Select"));
  client.setQueryData(["private"], "expired account");
  fireEvent(window, new Event("energyrd.session-expired"));
  expect(screen.getByText("anonymous")).toBeInTheDocument(); expect(screen.getByText("no home")).toBeInTheDocument();
  expect(client.getQueryData(["private"])).toBeUndefined();
  expect(fetcher.mock.calls.some(([path]) => String(path).includes("refresh"))).toBe(false);
});
it("drops private data immediately when another tab changes account", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(user)));
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><SessionProvider authEnabled><Probe /></SessionProvider></QueryClientProvider>);
  await screen.findByText(user.email);
  client.setQueryData(["private"], "old account");
  fireEvent(window, new StorageEvent("storage", { key: "energyrd.account-change", newValue: "new" }));
  expect(client.getQueryData(["private"])).toBeUndefined();
  expect(screen.getByText("no home")).toBeInTheDocument();
});
it("a login that completes after another tab changed the session never publishes its user and is swept", async () => {
  let released = false;
  let release!: () => void;
  const calls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = String(input); calls.push(path);
    if (path.endsWith("/login")) return new Promise<Response>(done => { release = () => { released = true; done(new Response(JSON.stringify({ ok: true }))); }; });
    if (path.endsWith("/me")) return released ? new Response(JSON.stringify(user)) : new Response(JSON.stringify({ detail: "La sesión venció." }), { status: 401 });
    return new Response(JSON.stringify({ ok: true }));
  });
  let outcome = "pending";
  function Login() {
    const session = useSession();
    return <button onClick={() => { session.authenticate("login", user.email, "long-password").then(() => { outcome = "resolved"; }, () => { outcome = "rejected"; }); }}>Login</button>;
  }
  render(<QueryClientProvider client={new QueryClient()}><SessionProvider authEnabled><Probe /><Login /></SessionProvider></QueryClientProvider>);
  await waitFor(() => expect(calls.filter(path => path.endsWith("/me"))).toHaveLength(1));
  fireEvent.click(screen.getByText("Login"));
  await waitFor(() => expect(calls.some(path => path.endsWith("/login"))).toBe(true));
  fireEvent(window, new StorageEvent("storage", { key: "energyrd.account-change", newValue: "logged-out-elsewhere" }));
  await waitFor(() => expect(calls.filter(path => path.endsWith("/me"))).toHaveLength(2));
  const before = calls.length;
  release();
  await waitFor(() => expect(outcome).toBe("rejected"));
  expect(screen.getByText("anonymous")).toBeInTheDocument();
  expect(calls.slice(before).some(path => path.endsWith("/me"))).toBe(true); // stale session swept so the BFF revokes it
});
