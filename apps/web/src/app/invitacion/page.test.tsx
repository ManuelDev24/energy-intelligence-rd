// ERD-SHARE-01: aceptar una invitación con el token del fragmento (#token=…).
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@energyrd/api-client";
import InvitationPage from "./page";
import * as sharing from "@/lib/auth/sharing";

const push = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({ value: { ready: true, user: null as { email: string } | null, authEnabled: true, signIn: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/session", () => ({ useSession: () => session.value }));
vi.mock("@/components/app-shell", () => ({ Logo: () => <span>logo</span> }));
vi.mock("@/lib/auth/sharing", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth/sharing")>()), acceptInvitation: vi.fn() }));
const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ_-01234";
const HOME = { id: "11111111-1111-4111-8111-111111111111", name: "Casa" };

function open(hash = `#token=${TOKEN}`, search = "") { window.history.replaceState(null, "", `/invitacion${search}${hash}`); }
function view() {
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}><InvitationPage /></QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); session.value = { ready: true, user: { email: "bob@example.com" }, authEnabled: true, signIn: vi.fn() }; });
afterEach(() => window.history.replaceState(null, "", "/"));

it("borra el token de la URL antes de cualquier petición y lo mantiene fuera del DOM", () => {
  open(undefined, "?utm=x");
  const replace = vi.spyOn(window.history, "replaceState");
  const { container } = view();
  expect(replace).toHaveBeenCalledTimes(1);
  expect(replace.mock.calls[0][2]).toBe("/invitacion?utm=x");
  expect(window.location.href).not.toContain(TOKEN);
  expect(container.innerHTML).not.toContain(TOKEN);
  expect(sharing.acceptInvitation).not.toHaveBeenCalled();
  replace.mockRestore();
});

it.each(["", "#token=corto", `#token=${TOKEN}&token=${TOKEN}`, `#otro=${TOKEN}`])("un enlace malformado (%s) se declara inválido sin llamar a la API", (hash) => {
  open(hash);
  view();
  expect(screen.getByRole("alert")).toHaveTextContent(/no es válido o ya se usó/);
  expect(screen.queryByRole("button", { name: "Aceptar invitación" })).not.toBeInTheDocument();
});

it("sin sesión pide iniciar sesión con el correo invitado y NO guarda el token", () => {
  session.value.user = null;
  open();
  view();
  expect(screen.getByText(/mismo correo al que llegó la invitación/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/login");
  expect(screen.getByRole("link", { name: "Crear cuenta" })).toHaveAttribute("href", "/register");
  expect(JSON.stringify({ ...window.localStorage, ...window.sessionStorage })).not.toContain(TOKEN);
});

it("con sesión acepta, selecciona la vivienda y va al panel", async () => {
  vi.mocked(sharing.acceptInvitation).mockResolvedValue(HOME as never);
  open();
  view();
  expect(screen.getByText("bob@example.com")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Aceptar invitación" }));
  await waitFor(() => expect(sharing.acceptInvitation).toHaveBeenCalledWith(TOKEN));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  expect(session.value.signIn).toHaveBeenCalledWith(HOME.id);
});

it("un doble clic acepta una sola vez", async () => {
  let release: (home: never) => void = () => {};
  vi.mocked(sharing.acceptInvitation).mockReturnValue(new Promise((resolve) => { release = resolve as never; }));
  open();
  view();
  const button = screen.getByRole("button", { name: "Aceptar invitación" });
  fireEvent.click(button); fireEvent.click(button);
  expect(sharing.acceptInvitation).toHaveBeenCalledTimes(1);
  release(HOME as never);
  await waitFor(() => expect(push).toHaveBeenCalled());
});

it("un error al aceptar muestra el mensaje local y permite reintentar", async () => {
  vi.mocked(sharing.acceptInvitation).mockRejectedValueOnce(new ApiError(400, "La invitación no es válida o ha caducado. Pide al propietario que te envíe una nueva."));
  open();
  view();
  fireEvent.click(screen.getByRole("button", { name: "Aceptar invitación" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("no es válida o ha caducado");
  expect(push).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Aceptar invitación" })).toBeEnabled();
});

it("en modo piloto explica que las invitaciones no están disponibles", () => {
  session.value.authEnabled = false;
  open();
  view();
  expect(screen.getByText(/no están disponibles en el modo piloto/)).toBeInTheDocument();
});
