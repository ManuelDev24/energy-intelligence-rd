// ERD-AUTH-05: enlace "Olvidé mi contraseña" y confirmación tras restablecer.
import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

let sessionError: string | null = null;
vi.mock("@/lib/session", () => ({ useSession: () => ({ authenticate: vi.fn(), error: sessionError, user: null }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/components/pilot-login", () => ({ PilotLogin: () => <main>Acceso demo</main> }));
afterEach(() => { vi.unstubAllEnvs(); window.history.replaceState(null, "", "/"); sessionError = null; });
async function page(enabled: boolean) {
  vi.stubEnv("NEXT_PUBLIC_AUTH_ENABLED", enabled ? "true" : "false");
  vi.resetModules();
  return (await import("./page")).default;
}

it("links to /olvide-contrasena from the login form when auth is enabled", async () => {
  const Page = await page(true);
  render(<Page />);
  expect(screen.getByRole("link", { name: "Olvidé mi contraseña" })).toHaveAttribute("href", "/olvide-contrasena");
  expect(screen.queryByText(/recuperación de contraseña no está disponible/i)).not.toBeInTheDocument();
});

it("shows the success message after a reset (?restablecida=1)", async () => {
  window.history.replaceState(null, "", "/login?restablecida=1");
  const Page = await page(true);
  render(<Page />);
  expect(screen.getByRole("status")).toHaveTextContent(/contraseña se restableció/i);
  expect(screen.getByRole("status")).toHaveTextContent(/inicia sesión/i);
});

it("shows no success message without the flag", async () => {
  window.history.replaceState(null, "", "/login?restablecida=0");
  const Page = await page(true);
  render(<Page />);
  expect(screen.queryByText(/contraseña se restableció/i)).not.toBeInTheDocument();
});

it("hides the recovery link in the pilot", async () => {
  const Page = await page(false);
  render(<Page />);
  expect(screen.getByText("Acceso demo")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /olvidé/i })).not.toBeInTheDocument();
});

it("suppresses the stale session-expired banner after a reset, since it is explained by the own success message", async () => {
  sessionError = "La sesión venció. Inicia sesión de nuevo.";
  window.history.replaceState(null, "", "/login?restablecida=1");
  const Page = await page(true);
  render(<Page />);
  expect(screen.getByRole("status")).toHaveTextContent(/contraseña se restableció/i);
  expect(screen.queryByText(/sesión venció/i)).not.toBeInTheDocument();
});

it("still shows the session-expired banner on a normal visit without ?restablecida=1", async () => {
  sessionError = "La sesión venció. Inicia sesión de nuevo.";
  const Page = await page(true);
  render(<Page />);
  expect(screen.getByText(/sesión venció/i)).toBeInTheDocument();
});
