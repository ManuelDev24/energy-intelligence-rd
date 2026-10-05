// ERD-AUTH-05: solicitar enlace de recuperación. Respuesta idéntica exista o no la cuenta.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PilotPage from "./page";

const CONFIRMATION = /si existe una cuenta con ese correo, te enviamos un enlace.*caducidad en el correo/i;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
async function enabledPage() {
  vi.stubEnv("NEXT_PUBLIC_AUTH_ENABLED", "true");
  vi.resetModules();
  return (await import("./page")).default;
}
const accepted = () => new Response(JSON.stringify({ status: "accepted" }), { status: 202, headers: { "content-type": "application/json" } });
function submit(email: string) {
  fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /enviar enlace/i }));
}

it("is unavailable in the pilot (auth disabled) and never calls the network", () => {
  const fetchMock = vi.spyOn(globalThis, "fetch");
  render(<PilotPage />);
  expect(screen.getByText(/no está disponible/i)).toBeInTheDocument();
  expect(screen.queryByLabelText("Correo electrónico")).not.toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("always shows the same confirmation text after 202, without echoing the address", async () => {
  const Page = await enabledPage();
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => accepted());
  const texts: string[] = [];
  for (const email of ["existe@b.test", "nadie@b.test"]) {
    const { unmount } = render(<Page />);
    submit(email);
    const status = await screen.findByText(CONFIRMATION);
    texts.push(status.textContent ?? "");
    expect(document.body.textContent).not.toContain(email);
    expect(screen.queryByLabelText("Correo electrónico")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /iniciar sesión/i })).toHaveAttribute("href", "/login");
    unmount();
  }
  expect(texts[0]).toBe(texts[1]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/bff/auth/password/forgot");
});

it("does not double submit while a request is pending", async () => {
  const Page = await enabledPage();
  let resolve!: (r: Response) => void;
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>(r => { resolve = r; }));
  render(<Page />);
  fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "a@b.test" } });
  const button = screen.getByRole("button", { name: /enviar enlace/i });
  fireEvent.click(button); fireEvent.click(button);
  fireEvent.submit(button.closest("form")!);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: /enviando/i })).toBeDisabled();
  resolve(accepted());
  expect(await screen.findByText(CONFIRMATION)).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("shows a distinct rate-limit message on 429 (not the confirmation) and keeps the form", async () => {
  const Page = await enabledPage();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: "private upstream text" }), { status: 429, headers: { "Retry-After": "60" } }));
  render(<Page />);
  submit("a@b.test");
  expect(await screen.findByRole("alert")).toHaveTextContent(/demasiadas solicitudes/i);
  expect(screen.queryByText(CONFIRMATION)).not.toBeInTheDocument();
  expect(document.body.textContent).not.toContain("private upstream text");
  expect(screen.getByLabelText("Correo electrónico")).toBeEnabled();
});

it("reports server/network failures with a local message, never upstream text", async () => {
  const Page = await enabledPage();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: "private upstream text" }), { status: 502 }));
  render(<Page />);
  submit("a@b.test");
  expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo enviar/i);
  expect(document.body.textContent).not.toContain("private upstream text");
  expect(screen.queryByText(CONFIRMATION)).not.toBeInTheDocument();
});

it("validates the email locally without network", async () => {
  const Page = await enabledPage();
  const fetchMock = vi.spyOn(globalThis, "fetch");
  render(<Page />);
  fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "sin-arroba" } });
  fireEvent.submit(screen.getByRole("button", { name: /enviar enlace/i }).closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent(/correo electrónico válido/i);
  const field = screen.getByLabelText("Correo electrónico");
  expect(field).toHaveFocus();
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(document.getElementById(field.getAttribute("aria-describedby")!)).toHaveTextContent(/correo electrónico válido/i);
  expect(fetchMock).not.toHaveBeenCalled();
});
