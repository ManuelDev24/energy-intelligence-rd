// ERD-SHARE-01: panel de compartir (propietario vs. miembro, invitar, revocar, expulsar, transferir, salir).
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@energyrd/api-client";
import { SharePanel } from "./share-panel";
import * as sharing from "@/lib/auth/sharing";

vi.mock("@/lib/auth/sharing", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth/sharing")>();
  return { ...real, listMembers: vi.fn(), listInvitations: vi.fn(), createInvitation: vi.fn(), revokeInvitation: vi.fn(),
    removeMember: vi.fn(), leaveHome: vi.fn(), transferOwnership: vi.fn() };
});
const HOME = { id: "11111111-1111-4111-8111-111111111111", name: "Casa Playa", distributor: "EDESUR" };
const BOB = "22222222-2222-4222-8222-222222222222";
const ALICE = "33333333-3333-4333-8333-333333333333";
const INV = "44444444-4444-4444-8444-444444444444";
const members = [
  { user_id: ALICE, email: "alice@example.com", role: "owner", joined_at: "2026-01-01T00:00:00Z" },
  { user_id: BOB, email: "bob@example.com", role: "member", joined_at: "2026-01-02T00:00:00Z" },
];
const pendingInvitation = { id: INV, email: "carol@example.com", created_at: "2026-01-01T00:00:00Z", expires_at: "2026-01-08T00:00:00Z" };
const mocked = <T extends keyof typeof sharing>(name: T) => vi.mocked(sharing[name]) as unknown as ReturnType<typeof vi.fn>;

function renderPanel(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><SharePanel home={HOME as never} onClose={onClose} /></QueryClientProvider>);
  return onClose;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocked("listMembers").mockResolvedValue(members);
  mocked("listInvitations").mockResolvedValue([pendingInvitation]);
});

it("el propietario ve miembros, invitaciones pendientes y el formulario de invitar", async () => {
  renderPanel();
  expect(await screen.findByText(/bob@example.com/)).toBeInTheDocument();
  expect(screen.getByText(/Propietario/)).toBeInTheDocument();
  expect(await screen.findByText(/carol@example.com/)).toBeInTheDocument();
  expect(screen.getByLabelText("Correo de la persona invitada")).toBeInTheDocument();
  // El propietario no se ofrece expulsar ni transferirse a sí mismo.
  expect(screen.queryByRole("button", { name: /Expulsar a alice/ })).not.toBeInTheDocument();
});

it("un miembro (403) solo ve cómo salir y nunca el formulario de invitar", async () => {
  mocked("listMembers").mockRejectedValue(new ApiError(403, "Solo el propietario de la vivienda puede hacer esto."));
  renderPanel();
  expect(await screen.findByRole("button", { name: /Salir de la vivienda/ })).toBeInTheDocument();
  expect(screen.queryByLabelText("Correo de la persona invitada")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(sharing.listInvitations).not.toHaveBeenCalled();
});

it("un fallo real al cargar muestra el mensaje local y permite reintentar", async () => {
  mocked("listMembers").mockRejectedValueOnce(new ApiError(500, "Error del servidor. Inténtalo de nuevo más tarde."));
  renderPanel();
  expect(await screen.findByRole("alert")).toHaveTextContent("Error del servidor");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByText(/bob@example.com/)).toBeInTheDocument();
});

it("invitar valida el correo en el cliente y confirma con el correo normalizado", async () => {
  mocked("createInvitation").mockResolvedValue({ ...pendingInvitation, email: "dave@example.com" });
  renderPanel();
  await screen.findByText(/bob@example.com/);
  fireEvent.change(screen.getByLabelText("Correo de la persona invitada"), { target: { value: "no-es-correo" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("correo electrónico válido");
  expect(sharing.createInvitation).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Correo de la persona invitada"), { target: { value: "Dave@Example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
  await waitFor(() => expect(sharing.createInvitation).toHaveBeenCalledWith(HOME.id, "Dave@Example.com"));
  expect(await screen.findByRole("status")).toHaveTextContent("Invitación enviada a dave@example.com");
  expect(screen.getByLabelText("Correo de la persona invitada")).toHaveValue("");
});

it("un conflicto al invitar muestra el mensaje local del BFF", async () => {
  mocked("createInvitation").mockRejectedValue(new ApiError(409, "Ya hay una invitación pendiente para ese correo. Revócala para enviar otra."));
  renderPanel();
  await screen.findByText(/bob@example.com/);
  fireEvent.change(screen.getByLabelText("Correo de la persona invitada"), { target: { value: "carol@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("invitación pendiente");
});

it("revoca una invitación pendiente", async () => {
  mocked("revokeInvitation").mockResolvedValue(undefined);
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: /Revocar la invitación a carol@example.com/ }));
  await waitFor(() => expect(sharing.revokeInvitation).toHaveBeenCalledWith(HOME.id, INV));
  expect(await screen.findByText("Invitación revocada.")).toBeInTheDocument();
});

it("expulsar pide confirmación y no actúa hasta confirmar", async () => {
  mocked("removeMember").mockResolvedValue(undefined);
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: /Expulsar a bob@example.com/ }));
  expect(sharing.removeMember).not.toHaveBeenCalled();
  const dialog = screen.getByRole("form", { name: "Confirmar acción" });
  expect(dialog).toHaveTextContent("Perderá el acceso de inmediato");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
  expect(sharing.removeMember).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Expulsar a bob@example.com/ }));
  fireEvent.click(within(screen.getByRole("form", { name: "Confirmar acción" })).getByRole("button", { name: "Confirmar" }));
  await waitFor(() => expect(sharing.removeMember).toHaveBeenCalledWith(HOME.id, BOB));
  expect(await screen.findByText("Miembro expulsado.")).toBeInTheDocument();
});

it("transferir exige la contraseña y no la conserva tras el éxito", async () => {
  mocked("transferOwnership").mockResolvedValue(undefined);
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: /Transferir la propiedad a bob@example.com/ }));
  const form = screen.getByRole("form", { name: "Confirmar acción" });
  fireEvent.click(within(form).getByRole("button", { name: "Confirmar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Escribe tu contraseña");
  expect(sharing.transferOwnership).not.toHaveBeenCalled();
  fireEvent.change(within(form).getByLabelText("Tu contraseña"), { target: { value: "valid-test-password-123" } });
  fireEvent.click(within(form).getByRole("button", { name: "Confirmar" }));
  await waitFor(() => expect(sharing.transferOwnership).toHaveBeenCalledWith(HOME.id, BOB, "valid-test-password-123"));
  expect(await screen.findByText(/Propiedad transferida/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Tu contraseña")).not.toBeInTheDocument();
});

it("contraseña incorrecta al transferir muestra el error y mantiene la confirmación abierta", async () => {
  mocked("transferOwnership").mockRejectedValue(new ApiError(403, "La contraseña no es correcta."));
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: /Transferir la propiedad a bob@example.com/ }));
  const form = screen.getByRole("form", { name: "Confirmar acción" });
  fireEvent.change(within(form).getByLabelText("Tu contraseña"), { target: { value: "otra-contraseña-larga-1" } });
  fireEvent.click(within(form).getByRole("button", { name: "Confirmar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("La contraseña no es correcta.");
  expect(screen.getByRole("form", { name: "Confirmar acción" })).toBeInTheDocument();
});

it("salir de la vivienda confirma, llama a la API y cierra el panel", async () => {
  mocked("listMembers").mockRejectedValue(new ApiError(403, "x"));
  mocked("leaveHome").mockResolvedValue(undefined);
  const onClose = renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: /Salir de la vivienda/ }));
  fireEvent.click(within(screen.getByRole("form", { name: "Confirmar acción" })).getByRole("button", { name: "Confirmar" }));
  await waitFor(() => expect(sharing.leaveHome).toHaveBeenCalledWith(HOME.id));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
});

it("el único propietario que intenta salir ve la explicación del conflicto", async () => {
  mocked("leaveHome").mockRejectedValue(new ApiError(409, "Eres el propietario: transfiere la propiedad a otro miembro antes de salir."));
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: /Salir de la vivienda/ }));
  fireEvent.click(within(screen.getByRole("form", { name: "Confirmar acción" })).getByRole("button", { name: "Confirmar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("transfiere la propiedad");
});
