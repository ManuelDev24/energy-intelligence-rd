import type { Metadata } from "next";
import { describe, expect, it } from "vitest";
import { metadata as root } from "./layout";

// ERD-WEB-QUALITY H3: cada pantalla declara su propio <title> ("Facturas · Energy RD").
const pages: Record<string, () => Promise<{ metadata?: Metadata }>> = {
  "Inicio": () => import("./(app)/dashboard/page"),
  "Consumo": () => import("./(app)/consumption/page"),
  "Lecturas": () => import("./(app)/readings/page"),
  "Facturas": () => import("./(app)/bills/page"),
  "Nueva factura": () => import("./(app)/bills/new/page"),
  "Detalle de factura": () => import("./(app)/bills/[id]/page"),
  "Meta mensual": () => import("./(app)/goal/page"),
  "Equipos": () => import("./(app)/equipment/page"),
  "Alertas": () => import("./(app)/alerts/page"),
  "Perfil": () => import("./(app)/profile/layout"),
  "Mi cuenta": () => import("./(account)/account/layout"),
  "Mis viviendas": () => import("./(account)/homes/layout"),
  "Iniciar sesión": () => import("./login/layout"),
  "Crear cuenta": () => import("./register/layout"),
  "Recuperar contraseña": () => import("./olvide-contrasena/layout"),
  "Términos y privacidad": () => import("./legal/layout"),
  "Restablecer contraseña": () => import("./restablecer-contrasena/layout"),
};

describe("títulos por pantalla", () => {
  it("la raíz usa la plantilla '%s · Energy RD' con 'Energy RD' por defecto", () => {
    expect(root.title).toEqual({ default: "Energy RD", template: "%s · Energy RD" });
  });

  it.each(Object.entries(pages))("%s declara su título", async (title, load) => {
    const mod = await load();
    expect(mod.metadata?.title).toBe(title);
  });

  it("los títulos son únicos", () => {
    const titles = Object.keys(pages);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
