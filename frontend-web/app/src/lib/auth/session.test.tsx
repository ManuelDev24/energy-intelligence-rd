import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SessionProvider, useSession } from "../session";
import { bffFetch } from "./client";
import { resetPassword } from "./recovery";
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
it("a post-reset 401 still clears the revoked account and cache without a second logout", async () => {
  let revoked = false;
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    if (String(input).endsWith("/password/reset")) { revoked = true; return new Response(null, { status: 204 }); }
    return revoked ? new Response(JSON.stringify({ code: "http_401" }), { status: 401 }) : new Response(JSON.stringify(user));
  });
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><SessionProvider authEnabled><Probe /></SessionProvider></QueryClientProvider>);
  await screen.findByText(user.email);
  fireEvent.click(screen.getByText("Select"));
  client.setQueryData(["private"], "revoked account data");
  await act(async () => {
    await resetPassword("A".repeat(43), "new-long-password");
    // The real transport dispatches expiry; the provider advances the generation, so
    // the same response is discarded instead of leaking old account data.
    await expect(bffFetch("/api/v1/homes")).rejects.toMatchObject({ code: "account_changed" });
  });
  expect(screen.getByText("anonymous")).toBeInTheDocument();
  expect(screen.getByText("no home")).toBeInTheDocument();
  expect(client.getQueryData(["private"])).toBeUndefined();
  expect(fetcher.mock.calls.some(([url]) => /logout|refresh/.test(String(url)))).toBe(false);
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
it("passes acceptTerms through to the register request", async () => {
  const calls: { path: string; body: string }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input); calls.push({ path, body: String(init?.body ?? "") });
    if (path.endsWith("/register")) return new Response(JSON.stringify({ ok: true }));
    return new Response(JSON.stringify(user));
  });
  function Register() {
    const session = useSession();
    return <button onClick={() => void session.authenticate("register", user.email, "long-password", true)}>Register</button>;
  }
  render(<QueryClientProvider client={new QueryClient()}><SessionProvider authEnabled><Probe /><Register /></SessionProvider></QueryClientProvider>);
  await screen.findByText("anonymous");
  fireEvent.click(screen.getByText("Register"));
  await waitFor(() => expect(screen.getByText(user.email)).toBeInTheDocument());
  const register = calls.find(c => c.path.endsWith("/register"))!;
  expect(JSON.parse(register.body)).toEqual({ email: user.email, password: "long-password", accept_terms: true });
});
it("deleteAccount clears session and cached data on success and rethrows on failure without clearing it", async () => {
  const client = new QueryClient();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = String(input);
    if (path.endsWith("/me") && !path.includes("DELETE")) return new Response(JSON.stringify(user));
    return new Response(JSON.stringify(user));
  });
  function Delete({ password }: { password: string }) {
    const session = useSession();
    return <button onClick={() => { session.deleteAccount(password).catch(() => {}); }}>Delete</button>;
  }
  render(<QueryClientProvider client={client}><SessionProvider authEnabled><Probe /><Delete password="correct-horse-battery" /></SessionProvider></QueryClientProvider>);
  await screen.findByText(user.email);
  client.setQueryData(["private"], "secret");
  const deleteSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input);
    if (init?.method === "DELETE" && path.endsWith("/auth/me")) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(user));
  });
  fireEvent.click(screen.getByText("Delete"));
  await waitFor(() => expect(screen.getByText("anonymous")).toBeInTheDocument());
  expect(client.getQueryData(["private"])).toBeUndefined();
  deleteSpy.mockRestore();
});
