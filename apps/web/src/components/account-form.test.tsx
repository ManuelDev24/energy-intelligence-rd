import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AccountForm } from "./account-form";
const authenticate = vi.fn();
vi.mock("@/lib/session", () => ({ useSession: () => ({ authenticate, error: null, user: null }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
it("uses labelled credentials, reports real errors and does not invent recovery", async () => {
  authenticate.mockRejectedValue(new Error("Credenciales inválidas"));
  render(<AccountForm mode="login" />);
  fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "a@b.test" } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "long-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Credenciales inválidas");
  expect(authenticate).toHaveBeenCalledWith("login", "a@b.test", "long-password");
  expect(screen.getByText(/recuperación de contraseña no está disponible/i)).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /recuperar/i })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Contraseña")).toHaveValue("");
});
