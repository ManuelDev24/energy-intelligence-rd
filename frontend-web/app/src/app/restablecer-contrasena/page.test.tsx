// ERD-AUTH-05: restablecer contraseña con el token del fragmento (#token=…).
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ACCOUNT_CHANGE_KEY } from "@/lib/auth/client";
import { metadata } from "./layout";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/navigation", () => ({ hardNavigate: navigate }));
const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ_-01234";
const PASSWORD = "nueva-contraseña-segura";
beforeEach(() => { window.localStorage.clear(); navigate.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); window.history.replaceState(null, "", "/"); });
async function page(enabled = true) {
  vi.stubEnv("NEXT_PUBLIC_AUTH_ENABLED", enabled ? "true" : "false");
  vi.resetModules();
  return (await import("./page")).default;
}
function at(hash: string, search = "") { window.history.replaceState(null, "", `/restablecer-contrasena${search}${hash}`); }
function fill(password: string, confirmation = password) {
  fireEvent.change(screen.getByLabelText("Nueva contraseña"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirmar contraseña"), { target: { value: confirmation } });
}
const submitButton = () => screen.getByRole("button", { name: /restablec.*contraseña/i });

it("removes the token from the URL on mount, before any request, and keeps it out of the DOM", async () => {
  const Page = await page();
  at(`#token=${TOKEN}`, "?utm=x");
  const order: string[] = [];
  const replace = vi.spyOn(window.history, "replaceState").mockImplementation(function (this: History, ...args) {
    order.push("replaceState");
    return History.prototype.replaceState.apply(this, args as Parameters<History["replaceState"]>);
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => { order.push("fetch"); return new Response(null, { status: 204 }); });
  const { container } = render(<Page />);
  expect(replace).toHaveBeenCalledTimes(1);
  expect(replace.mock.calls[0][2]).toBe("/restablecer-contrasena?utm=x");
  expect(window.location.hash).toBe("");
  expect(window.location.href).not.toContain(TOKEN);
  expect(container.innerHTML).not.toContain(TOKEN);
  expect(order).toEqual(["replaceState"]);
  fill(PASSWORD);
  fireEvent.click(submitButton());
  await waitFor(() => expect(navigate).toHaveBeenCalled());
  expect(order).toEqual(["replaceState", "fetch"]);
});

it("survives StrictMode double effects without losing the token", async () => {
  const Page = await page();
  at(`#token=${TOKEN}`);
  const { StrictMode } = await import("react");
  render(<StrictMode><Page /></StrictMode>);
  expect(screen.getByLabelText("Nueva contraseña")).toBeInTheDocument();
  expect(screen.queryByText(/enlace inválido/i)).not.toBeInTheDocument();
});

it.each(["", "#", `#token=${TOKEN.slice(2)}`, `#token=${TOKEN.slice(1)}+`, `#token=${TOKEN}&token=${TOKEN}`])("shows 'enlace inválido' with a link to request another for hash %j", async hash => {
  const Page = await page();
  at(hash);
  const fetchMock = vi.spyOn(globalThis, "fetch");
  render(<Page />);
  expect(screen.getByText(/enlace inválido/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /solicitar otro enlace/i })).toHaveAttribute("href", "/olvide-contrasena");
  expect(screen.queryByLabelText("Nueva contraseña")).not.toBeInTheDocument();
  expect(window.location.hash).toBe("");
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([
  ["corta-11ch", "corta-11ch", /entre 12 y 128/i],
  ["x".repeat(129), "x".repeat(129), /entre 12 y 128/i],
  [PASSWORD, `${PASSWORD}!`, /no coinciden/i],
])("validates %s locally (12-128 and confirmation) without network", async (password, confirmation, message) => {
  const Page = await page();
  at(`#token=${TOKEN}`);
  const fetchMock = vi.spyOn(globalThis, "fetch");
  render(<Page />);
  fill(password, confirmation);
  fireEvent.submit(submitButton().closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(fetchMock).not.toHaveBeenCalled();
  const field = screen.getByLabelText(password === confirmation ? "Nueva contraseña" : "Confirmar contraseña");
  expect(field).toHaveFocus();
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(document.getElementById(field.getAttribute("aria-describedby")!)).toHaveTextContent(message);
});

it("on 204 preserves session state and redirects to /login?restablecida=1", async () => {
  const Page = await page();
  at(`#token=${TOKEN}`);
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
  render(<Page />);
  fill(PASSWORD);
  fireEvent.click(submitButton());
  await waitFor(() => expect(navigate).toHaveBeenCalledWith("/login?restablecida=1"));
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/bff/auth/password/reset");
  expect(JSON.parse(String(init?.body))).toEqual({ token: TOKEN, new_password: PASSWORD });
  expect(window.localStorage.getItem(ACCOUNT_CHANGE_KEY)).toBeNull();
});

it.each(["unmount", "generation", "other-tab"])("ignores late success after %s", async change => {
  const Page = await page();
  const client = await import("@/lib/auth/client");
  at(`#token=${TOKEN}`);
  let resolve!: (response: Response) => void;
  vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>(r => { resolve = r; }));
  const view = render(<Page />);
  fill(PASSWORD); fireEvent.click(submitButton());
  if (change === "unmount") view.unmount();
  if (change === "generation") client.invalidateAccountRequests();
  if (change === "other-tab") window.localStorage.setItem(ACCOUNT_CHANGE_KEY, "login-B");
  const generation = client.accountGeneration();
  const marker = window.localStorage.getItem(ACCOUNT_CHANGE_KEY);
  await act(async () => { resolve(new Response(null, { status: 204 })); });
  expect(navigate).not.toHaveBeenCalled();
  expect(client.accountGeneration()).toBe(generation);
  expect(window.localStorage.getItem(ACCOUNT_CHANGE_KEY)).toBe(marker);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it.each([false, true])("preserves real SessionProvider login B after late reset (unmount=%s)", async unmountPage => {
  const Page = await page();
  const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
  const { SessionProvider, useSession } = await import("@/lib/session");
  const { useState } = await import("react");
  const account = { id: "11111111-1111-4111-8111-111111111111", email: "b@b.test", role: "user", created_at: "2026-01-01T00:00:00Z" };
  let loggedIn = false;
  let resolve!: (response: Response) => void;
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    const url = String(input);
    if (url.endsWith("/password/reset")) return new Promise<Response>(r => { resolve = r; });
    if (url.endsWith("/login")) { loggedIn = true; return new Response(JSON.stringify({ ok: true })); }
    return new Response(JSON.stringify(loggedIn ? account : { code: "http_401" }), { status: loggedIn ? 200 : 401 });
  });
  function Harness() {
    const session = useSession();
    const [show, setShow] = useState(true);
    return <><p>{session.ready ? session.user?.email ?? "anonymous-ready" : "checking"}</p>
      <button onClick={() => { if (unmountPage) setShow(false); void session.authenticate("login", account.email, PASSWORD); }}>Login B</button>
      {show ? <Page /> : null}</>;
  }
  at(`#token=${TOKEN}`);
  const cache = new QueryClient();
  render(<QueryClientProvider client={cache}><SessionProvider authEnabled><Harness /></SessionProvider></QueryClientProvider>);
  await screen.findByText("anonymous-ready");
  fill(PASSWORD); fireEvent.click(submitButton());
  await waitFor(() => expect(resolve).toBeTypeOf("function"));
  fireEvent.click(screen.getByText("Login B"));
  await screen.findByText(account.email);
  cache.setQueryData(["B-private"], "B-data");
  const marker = window.localStorage.getItem(ACCOUNT_CHANGE_KEY);
  await act(async () => { resolve(new Response(null, { status: 204 })); });
  expect(screen.getByText(account.email)).toBeInTheDocument();
  expect(cache.getQueryData(["B-private"])).toBe("B-data");
  expect(window.localStorage.getItem(ACCOUNT_CHANGE_KEY)).toBe(marker);
  expect(navigate).not.toHaveBeenCalled();
  expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/logout"))).toBe(false);
});

it.each(["unmount", "generation"])("ignores late errors after %s", async change => {
  const Page = await page();
  const client = await import("@/lib/auth/client");
  at(`#token=${TOKEN}`);
  let resolve!: (response: Response) => void;
  vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>(r => { resolve = r; }));
  const view = render(<Page />);
  fill(PASSWORD); fireEvent.click(submitButton());
  if (change === "unmount") view.unmount(); else client.invalidateAccountRequests();
  await act(async () => { resolve(new Response(JSON.stringify({ code: "reset_token_invalid" }), { status: 400 })); });
  expect(navigate).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("does not double submit", async () => {
  const Page = await page();
  at(`#token=${TOKEN}`);
  let resolve!: (r: Response) => void;
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>(r => { resolve = r; }));
  render(<Page />);
  fill(PASSWORD);
  fireEvent.click(submitButton()); fireEvent.click(submitButton());
  fireEvent.submit(submitButton().closest("form")!);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(submitButton()).toBeDisabled();
  await act(async () => { resolve(new Response(null, { status: 204 })); });
  await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("on 400 reset_token_invalid shows 'enlace inválido o caducado' with a link and drops the form", async () => {
  const Page = await page();
  at(`#token=${TOKEN}`);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: "private upstream text", code: "reset_token_invalid" }), { status: 400 }));
  render(<Page />);
  fill(PASSWORD);
  fireEvent.click(submitButton());
  expect(await screen.findByText(/enlace inválido o caducado/i)).toHaveTextContent(/caducidad en el correo/i);
  expect(document.body.textContent).not.toMatch(/30 minutos/i);
  expect(screen.getByRole("link", { name: /solicitar otro enlace/i })).toHaveAttribute("href", "/olvide-contrasena");
  expect(screen.queryByLabelText("Nueva contraseña")).not.toBeInTheDocument();
  expect(document.body.textContent).not.toContain("private upstream text");
  expect(navigate).not.toHaveBeenCalled();
});

it("on 429 shows a distinct message and keeps the form for a later retry", async () => {
  const Page = await page();
  at(`#token=${TOKEN}`);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: "private" }), { status: 429 }));
  render(<Page />);
  fill(PASSWORD);
  fireEvent.click(submitButton());
  expect(await screen.findByRole("alert")).toHaveTextContent(/demasiad/i);
  expect(screen.getByLabelText("Nueva contraseña")).toBeInTheDocument();
  expect(screen.queryByText(/enlace inválido/i)).not.toBeInTheDocument();
});

it("is unavailable in the pilot but still strips the token from the URL", async () => {
  const Page = await page(false);
  at(`#token=${TOKEN}`);
  const fetchMock = vi.spyOn(globalThis, "fetch");
  render(<Page />);
  expect(screen.getByText(/no está disponible/i)).toBeInTheDocument();
  expect(screen.queryByLabelText("Nueva contraseña")).not.toBeInTheDocument();
  expect(window.location.hash).toBe("");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("sets referrer policy no-referrer for the route and loads no third-party scripts", () => {
  expect(metadata.referrer).toBe("no-referrer");
  for (const file of ["page.tsx", "layout.tsx"]) {
    const source = readFileSync(path.join(__dirname, file), "utf8");
    expect(source).not.toMatch(/next\/script|<script|https?:\/\//i);
  }
});
