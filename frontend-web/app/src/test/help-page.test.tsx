// ERD-HELP-01 (web): búsqueda, categorías, artículos desplegables y contacto honesto.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HelpPage from "@/app/(app)/help/page";
import { getApi } from "@/lib/api";
import { HOME_A } from "./mock-api";
import { renderWithApp } from "./render";

vi.mock("@/lib/api", async () => {
  const { createMockApi } = await import("./mock-api");
  const api = createMockApi();
  return { getApi: () => api };
});

const index = (over: Record<string, unknown> = {}) => ({
  content_version: "2026-10-15.1", categories: [{ id: "cuenta", label: "Cuenta y privacidad" }, { id: "datos", label: "Calidad de los datos" }],
  articles: [{ id: "olvide-contrasena", category: "cuenta", title: "Olvidé mi contraseña", summary: "Puedes restablecerla con tu correo." },
    { id: "real-estimado", category: "datos", title: "¿Qué significan REAL, ESTIMADO…?", summary: "Cada cifra indica de dónde sale." }],
  contact: { email: null, note: "El correo de soporte aún no está configurado en este entorno." }, query: null, ...over,
});

describe("HelpPage", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("lista artículos y abre uno cargando su contenido al desplegarlo", async () => {
    vi.spyOn(getApi(), "getHelp").mockResolvedValue(index() as never);
    const article = vi.spyOn(getApi(), "getHelpArticle").mockResolvedValue({ id: "olvide-contrasena", category: "cuenta", title: "Olvidé mi contraseña", summary: "s", body: ["Elige «Olvidé mi contraseña»."], tags: [] } as never);
    renderWithApp(<HelpPage />, HOME_A);
    const list = await screen.findByRole("list", { name: "Artículos de ayuda" });
    expect(article).not.toHaveBeenCalled();
    const item = within(list).getAllByRole("listitem")[0];
    fireEvent.click(within(item).getByText("Olvidé mi contraseña"));
    (item.querySelector("details") as HTMLDetailsElement).open = true;
    fireEvent(item.querySelector("details")!, new Event("toggle"));
    expect(await within(item).findByText("Elige «Olvidé mi contraseña».")).toBeInTheDocument();
    expect(article).toHaveBeenCalledWith("olvide-contrasena", expect.anything());
  });

  it("busca con retraso (no por cada tecla) y anuncia la cantidad de resultados", async () => {
    const spy = vi.spyOn(getApi(), "getHelp").mockImplementation((async (opts: { q?: string }) => index(opts?.q ? { query: opts.q, articles: [index().articles[0]] } : {})) as never);
    renderWithApp(<HelpPage />, HOME_A);
    await screen.findByRole("list", { name: "Artículos de ayuda" });
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "contraseña" } });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 resultado(s) para «contraseña»"));
    expect(spy.mock.calls.filter(([opts]) => (opts as { q?: string }).q === "contraseña")).toHaveLength(1);
  });

  it("filtra por categoría y marca el botón activo", async () => {
    const spy = vi.spyOn(getApi(), "getHelp").mockResolvedValue(index() as never);
    renderWithApp(<HelpPage />, HOME_A);
    const group = await screen.findByRole("group", { name: "Categorías" });
    fireEvent.click(within(group).getByRole("button", { name: "Cuenta y privacidad" }));
    await waitFor(() => expect(within(group).getByRole("button", { name: "Cuenta y privacidad" })).toHaveAttribute("aria-pressed", "true"));
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ category: "cuenta" }), expect.anything());
  });

  it("sin correo configurado no inventa uno; con correo ofrece mailto", async () => {
    const spy = vi.spyOn(getApi(), "getHelp").mockResolvedValue(index() as never);
    const first = renderWithApp(<HelpPage />, HOME_A);
    const contact = await screen.findByTestId("help-contact");
    expect(contact).toHaveTextContent("aún no está configurado");
    expect(within(contact).queryByRole("link")).toBeNull();
    first.unmount();
    spy.mockResolvedValue(index({ contact: { email: "soporte@example.com", note: "Escríbenos." } }) as never);
    renderWithApp(<HelpPage />, HOME_A);
    expect(await screen.findByRole("link", { name: "soporte@example.com" })).toHaveAttribute("href", "mailto:soporte@example.com");
  });

  it("sin resultados lo dice", async () => {
    vi.spyOn(getApi(), "getHelp").mockResolvedValue(index({ articles: [] }) as never);
    renderWithApp(<HelpPage />, HOME_A);
    expect(await screen.findByText(/No encontramos nada/)).toBeInTheDocument();
  });
});
