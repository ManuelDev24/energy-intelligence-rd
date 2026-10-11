import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AccountPage from "./page";

const deleteAccount = vi.fn();
const signOut = vi.fn();
const replace = vi.fn();
const clear = vi.fn();
vi.mock("@/lib/session", () => ({
  useSession: () => ({ user: { email: "a@b.test" }, error: null, signOut, deleteAccount }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ clear }) }));
// Las secciones de ajustes tienen sus propias pruebas (components/account-settings.test.tsx); aquí se aísla la baja de cuenta.
vi.mock("@/components/account-settings", () => ({ AccountSettings: () => null }));

afterEach(() => { vi.clearAllMocks(); });

it("requires confirmation and password before deleting, then redirects to login with a message", async () => {
  deleteAccount.mockResolvedValue(undefined);
  render(<AccountPage />);
  expect(screen.queryByLabelText(/confirma tu contraseña/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /eliminar cuenta/i }));
  const passwordInput = screen.getByLabelText(/confirma tu contraseña/i);
  const confirmButton = screen.getByRole("button", { name: /confirmar eliminación/i });
  expect(confirmButton).toBeDisabled();
  fireEvent.change(passwordInput, { target: { value: "correct-horse-battery" } });
  expect(confirmButton).toBeEnabled();
  fireEvent.click(confirmButton);
  await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith("correct-horse-battery"));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?deleted=1"));
  expect(clear).toHaveBeenCalled();
});

it("shows the local error message and keeps the account on a failed deletion (wrong password)", async () => {
  deleteAccount.mockRejectedValue(new Error("La contraseña no es correcta."));
  render(<AccountPage />);
  fireEvent.click(screen.getByRole("button", { name: /eliminar cuenta/i }));
  fireEvent.change(screen.getByLabelText(/confirma tu contraseña/i), { target: { value: "wrong-password-here" } });
  fireEvent.click(screen.getByRole("button", { name: /confirmar eliminación/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent("La contraseña no es correcta.");
  expect(replace).not.toHaveBeenCalled();
});
