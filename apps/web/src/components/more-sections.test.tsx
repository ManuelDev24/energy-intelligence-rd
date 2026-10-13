import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MOBILE_EXTRA_SECTIONS, MoreSections } from "./app-shell";

describe("MoreSections (navegación en pantallas estrechas)", () => {
  it("ofrece Meta, Ahorro y Apagones, que la barra inferior no muestra", () => {
    render(<MoreSections />);
    const nav = screen.getByRole("navigation", { name: "Más secciones" });
    const links = within(nav).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([["Meta", "/goal"], ["Ahorro", "/savings"], ["Apagones", "/outages"]]);
  });

  it("solo se muestra en <768 px (en escritorio ya están en la barra lateral) y cada enlace mide 44 px", () => {
    render(<MoreSections />);
    expect(screen.getByRole("navigation", { name: "Más secciones" })).toHaveClass("md:hidden");
    for (const link of screen.getAllByRole("link")) expect(link).toHaveClass("min-h-11");
  });

  it("no repite Perfil, desde donde se llega a esta lista", () => {
    expect(MOBILE_EXTRA_SECTIONS.map((s) => s.href)).not.toContain("/profile");
  });
});
