// Auditoría C-10: la página de verificación lee el token del fragmento, lo borra de la URL y canjea el enlace.
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Page from "./page";
import { metadata } from "./layout";

const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ_-01234";
afterEach(() => { vi.restoreAllMocks(); window.history.replaceState(null, "", "/"); });
const at = (hash: string) => window.history.replaceState(null, "", `/verificar-correo${hash}`);

it("borra el token de la URL, lo canjea y confirma", async () => {
  at(`#token=${TOKEN}`);
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
  render(<Page />);
  expect(window.location.hash).toBe("");
  await waitFor(() => expect(screen.getByText(/correo quedó confirmado/i)).toBeInTheDocument());
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/bff/auth/email/verify");
  expect(JSON.parse(String(init?.body))).toEqual({ token: TOKEN });
  expect(document.body.innerHTML).not.toContain(TOKEN);
});

it("sin token válido no hace ninguna petición", async () => {
  at("#token=corto");
  const fetchMock = vi.spyOn(globalThis, "fetch");
  render(<Page />);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/no es válido o caducó/i));
  expect(fetchMock).not.toHaveBeenCalled();
});

it("un enlace caducado o ya usado muestra el mensaje local", async () => {
  at(`#token=${TOKEN}`);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: "x", code: "verification_token_invalid" }), { status: 400, headers: { "content-type": "application/json" } }));
  render(<Page />);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/no es válido o caducó/i));
});

it("la página no se indexa ni envía Referer", () => {
  expect(metadata.referrer).toBe("no-referrer");
  expect(metadata.robots).toEqual({ index: false, follow: false });
});
