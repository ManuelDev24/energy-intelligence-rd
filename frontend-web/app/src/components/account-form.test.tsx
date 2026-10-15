import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AccountForm } from "./account-form";
const authenticate = vi.fn();
vi.mock("@/lib/session", () => ({ useSession: () => ({ authenticate, error: null, user: null }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
afterEach(() => { authenticate.mockReset(); });
it("uses labelled credentials, reports real errors and links to password recovery only from login", async () => {
  authenticate.mockRejectedValue(new Error("Credenciales inválidas"));
  render(<AccountForm mode="login" />);
  fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "a@b.test" } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "long-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Credenciales inválidas");
  expect(authenticate).toHaveBeenCalledWith("login", "a@b.test", "long-password");
  // ERD-AUTH-05: la recuperación existe; ya no se afirma lo contrario.
  expect(screen.queryByText(/recuperación de contraseña no está disponible/i)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Olvidé mi contraseña" })).toHaveAttribute("href", "/olvide-contrasena");
  expect(screen.getByLabelText("Contraseña")).toHaveValue("");
});
it("blocks registration until terms acceptance is checked and links to the draft legal notice", async () => {
  authenticate.mockResolvedValue(undefined);
  render(<AccountForm mode="register" />);
  fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "a@b.test" } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "long-password" } });
  const submit = screen.getByRole("button", { name: "Crear cuenta" });
  expect(submit).toBeDisabled();
  fireEvent.click(submit);
  expect(authenticate).not.toHaveBeenCalled();
  const link = screen.getByRole("link", { name: /términos|privacidad/i });
  expect(link).toHaveAttribute("href", "/legal");
  expect(screen.getByText(/borrador/i)).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /olvidé/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
  expect(authenticate).toHaveBeenCalledWith("register", "a@b.test", "long-password", true);
});
