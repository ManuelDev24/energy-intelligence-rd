// ERD-PROF-01: cambio de contraseña, preferencias, sesiones activas y descarga de datos.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@energyrd/api-client";
import { DataExportSection, NotificationsSection, PasswordSection, SessionsSection } from "./account-settings";
import * as settings from "@/lib/auth/settings";

vi.mock("@/lib/auth/settings", () => ({
  changePassword: vi.fn(), getPreferences: vi.fn(), savePreferences: vi.fn(), listSessions: vi.fn(),
  revokeSession: vi.fn(), revokeOtherSessions: vi.fn(), exportMyData: vi.fn(),
}));
const m = <T extends keyof typeof settings>(name: T) => vi.mocked(settings[name]) as unknown as ReturnType<typeof vi.fn>;
const OLD = "valid-test-password-123";
const NEW = "another-new-password-789";
const view = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{ui}</QueryClientProvider>);
beforeEach(() => vi.clearAllMocks());

function fillPassword(current = OLD, next = NEW, confirmation = next) {
  fireEvent.change(screen.getByLabelText("Contraseña actual"), { target: { value: current } });
  fireEvent.change(screen.getByLabelText("Nueva contraseña"), { target: { value: next } });
  fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), { target: { value: confirmation } });
}
const submitPassword = () => fireEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

it.each([
  ["actual muy corta", ["short", NEW, NEW], /actual/],
  ["nueva muy corta", [OLD, "short", "short"], /entre 12 y 128/],
  ["nueva igual a la actual", [OLD, OLD, OLD], /distinta de la actual/],
  ["confirmación distinta", [OLD, NEW, NEW + "x"], /no coinciden/],
] as const)("contraseña: %s se rechaza en el cliente sin llamar a la API", async (_n, [c, n, k], message) => {
  render(<PasswordSection />);
  fillPassword(c, n, k);
  submitPassword();
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(settings.changePassword).not.toHaveBeenCalled();
});

it("contraseña: éxito limpia los campos y avisa que se cerraron las demás sesiones", async () => {
  m("changePassword").mockResolvedValue({ ok: true });
  render(<PasswordSection />);
  fillPassword();
  submitPassword();
  await waitFor(() => expect(settings.changePassword).toHaveBeenCalledWith(OLD, NEW));
  expect(await screen.findByRole("status")).toHaveTextContent("Se cerraron las demás sesiones");
  for (const label of ["Contraseña actual", "Nueva contraseña", "Confirmar nueva contraseña"]) expect(screen.getByLabelText(label)).toHaveValue("");
});

it("contraseña: una contraseña actual incorrecta muestra el mensaje local y conserva lo escrito", async () => {
  m("changePassword").mockRejectedValue(new ApiError(403, "La contraseña no es correcta."));
  render(<PasswordSection />);
  fillPassword();
  submitPassword();
  expect(await screen.findByRole("alert")).toHaveTextContent("La contraseña no es correcta.");
  expect(screen.getByLabelText("Nueva contraseña")).toHaveValue(NEW);
});

it("contraseña: un doble envío llama una sola vez", async () => {
  let release: (v: unknown) => void = () => {};
  m("changePassword").mockReturnValue(new Promise((resolve) => { release = resolve; }));
  render(<PasswordSection />);
  fillPassword();
  const form = screen.getByRole("button", { name: "Cambiar contraseña" }).closest("form")!;
  fireEvent.submit(form); fireEvent.submit(form);   // dos envíos seguidos (p. ej. Enter repetido)
  expect(settings.changePassword).toHaveBeenCalledTimes(1);
  release({ ok: true });
  await screen.findByRole("status");
});

it("notificaciones: muestra los valores guardados, guarda solo si hay cambios y confirma", async () => {
  m("getPreferences").mockResolvedValue({ alerts_email: true, alerts_push: false, updated_at: null });
  m("savePreferences").mockResolvedValue({ alerts_email: false, alerts_push: false, updated_at: "2026-10-10T12:00:00Z" });
  view(<NotificationsSection />);
  const email = await screen.findByLabelText("Avisos de consumo por correo");
  expect(email).toBeChecked();
  expect(screen.getByLabelText(/Avisos en el teléfono/)).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Guardar preferencias" })).toBeDisabled();
  expect(screen.getByText(/todavía no se envía ningún aviso/)).toBeInTheDocument();
  fireEvent.click(email);
  fireEvent.click(screen.getByRole("button", { name: "Guardar preferencias" }));
  await waitFor(() => expect(settings.savePreferences).toHaveBeenCalledWith(false, false));
  expect(await screen.findByText("Preferencias guardadas.")).toBeInTheDocument();
});

it("notificaciones: un fallo al cargar permite reintentar y uno al guardar muestra el mensaje local", async () => {
  m("getPreferences").mockRejectedValueOnce(new ApiError(500, "Error del servidor. Inténtalo de nuevo más tarde."))
    .mockResolvedValue({ alerts_email: true, alerts_push: true, updated_at: null });
  view(<NotificationsSection />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Error del servidor");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  const push = await screen.findByLabelText(/Avisos en el teléfono/);
  m("savePreferences").mockRejectedValue(new ApiError(422, "Datos inválidos. Revisa los campos marcados."));
  fireEvent.click(push);
  fireEvent.click(screen.getByRole("button", { name: "Guardar preferencias" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Datos inválidos");
});

const SESSIONS = [
  { id: "11111111-1111-4111-8111-111111111111", created_at: "2026-10-10T12:00:00Z", expires_at: "2026-11-09T12:00:00Z", current: true },
  { id: "22222222-2222-4222-8222-222222222222", created_at: "2026-10-09T08:00:00Z", expires_at: "2026-11-08T08:00:00Z", current: false },
];

it("sesiones: marca la actual (sin botón de cerrar) y cierra otra con confirmación visible", async () => {
  m("listSessions").mockResolvedValue(SESSIONS);
  m("revokeSession").mockResolvedValue(undefined);
  view(<SessionsSection />);
  const items = await screen.findAllByRole("listitem");
  expect(items).toHaveLength(2);
  expect(within(items[0]).getByText(/Esta sesión/)).toBeInTheDocument();
  expect(within(items[0]).queryByRole("button")).not.toBeInTheDocument();
  fireEvent.click(within(items[1]).getByRole("button", { name: /Cerrar la sesión iniciada/ }));
  await waitFor(() => expect(settings.revokeSession).toHaveBeenCalledWith(SESSIONS[1].id));
  expect(await screen.findByText("Sesión cerrada.")).toBeInTheDocument();
});

it("sesiones: «Cerrar las demás» solo aparece si hay otras y las cierra", async () => {
  m("listSessions").mockResolvedValue(SESSIONS);
  m("revokeOtherSessions").mockResolvedValue(undefined);
  view(<SessionsSection />);
  fireEvent.click(await screen.findByRole("button", { name: "Cerrar las demás sesiones" }));
  await waitFor(() => expect(settings.revokeOtherSessions).toHaveBeenCalled());
  expect(await screen.findByText("Se cerraron las demás sesiones.")).toBeInTheDocument();
});

it("sesiones: con una sola sesión no se ofrece cerrar las demás", async () => {
  m("listSessions").mockResolvedValue([SESSIONS[0]]);
  view(<SessionsSection />);
  await screen.findByText(/Esta sesión/);
  expect(screen.queryByRole("button", { name: "Cerrar las demás sesiones" })).not.toBeInTheDocument();
});

it("datos: descarga el archivo con el nombre de la API y sin dejar el enlace en el DOM", async () => {
  m("exportMyData").mockResolvedValue({ text: '{"format_version":1}', filename: "energyrd-datos-2026-10-10.json" });
  const create = vi.fn(() => "blob:fake"); const revoke = vi.fn();
  Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe("energyrd-datos-2026-10-10.json"); });
  render(<DataExportSection />);
  fireEvent.click(screen.getByRole("button", { name: "Descargar mis datos" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Descarga lista");
  expect(click).toHaveBeenCalledTimes(1);
  expect(revoke).toHaveBeenCalledWith("blob:fake");
  expect(document.querySelector("a[download]")).toBeNull();
  click.mockRestore();
});

it("datos: un error muestra el mensaje y permite reintentar", async () => {
  m("exportMyData").mockRejectedValue(new ApiError(429, "Demasiados intentos. Espera un momento e inténtalo de nuevo."));
  render(<DataExportSection />);
  fireEvent.click(screen.getByRole("button", { name: "Descargar mis datos" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Demasiados intentos");
  expect(screen.getByRole("button", { name: "Descargar mis datos" })).toBeEnabled();
});
