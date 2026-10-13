// ERD-QA-A11Y: accesibilidad (axe: WCAG 2.0/2.1/2.2 A y AA + buenas prácticas) y desborde horizontal en las páginas públicas
// y en las 11 pantallas con sesión, a 360, 768 y 1280 px. Convierte en prueba permanente el barrido manual del cierre de UI/QA:
// hallazgos como el desborde de Apagones a 768 px, las casillas de 16 px o las tablas con scroll sin teclado se habrían atrapado aquí.
import fs from "node:fs";
import type { Page } from "@playwright/test";
import { addBill, addReading, bff, createHomeViaApi, expect, pickHome, registerViaApi, test } from "../support/test";

const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const WIDTHS: Array<[number, number]> = [[360, 740], [768, 1024], [1280, 800]];
const PUBLIC = ["login", "register", "olvide-contrasena", "restablecer-contrasena", "verificar-correo", "invitacion", "legal"];

interface Violation { id: string; impact: string | null; help: string; nodes: Array<{ target: string[] }> }

/** Ejecuta axe y mide el desborde horizontal; devuelve un texto por problema (vacío = sin problemas). */
async function problems(page: Page, name: string): Promise<string[]> {
  await page.evaluate(AXE);
  const result = await page.evaluate(async () => {
    // @ts-expect-error axe lo inyecta la propia prueba
    const res = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
    return { violations: res.violations as Violation[], overflow: document.documentElement.scrollWidth - window.innerWidth };
  });
  const found = result.violations.map((v) => `${name}: ${v.id} (${v.impact}) ${v.help} → ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  if (result.overflow > 0) found.push(`${name}: desborde horizontal de ${result.overflow}px`);
  return found;
}

test.describe("accesibilidad y desbordes: páginas públicas", () => {
  for (const [width, height] of WIDTHS) {
    test(`sin violaciones de axe ni desborde a ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const found: string[] = [];
      for (const path of PUBLIC) {
        await page.goto(`/${path}`);
        await page.waitForLoadState("networkidle");
        found.push(...(await problems(page, `/${path}`)));
      }
      expect(found, found.join("\n")).toEqual([]);
    });
  }
});

test.describe("accesibilidad y desbordes: pantallas con sesión", () => {
  for (const [width, height] of WIDTHS) {
    test(`11 pantallas sin violaciones de axe ni desborde a ${width}px`, async ({ page, context }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width, height });
      await registerViaApi(context);
      const homeId = await createHomeViaApi(page, "Casa A11y");
      const bills: Array<[string, string, string, string, number]> = [
        ["2026-03-01", "2026-03-31", "310", "5200.00", 31], ["2026-04-01", "2026-04-30", "295", "4950.00", 30],
        ["2026-05-01", "2026-05-31", "330", "5600.00", 31], ["2026-06-01", "2026-06-30", "355", "6100.00", 30],
        ["2026-07-01", "2026-07-31", "380", "6600.00", 31], ["2026-08-01", "2026-08-31", "402", "7050.00", 31],
      ];
      for (const bill of bills) await addBill(page, homeId, ...bill);
      await addReading(page, homeId, 6, 1000);
      await addReading(page, homeId, 3, 1040);
      await addReading(page, homeId, 1, 1068);
      await bff(page, `homes/${homeId}/equipment`, "POST", { name: "Nevera", kind: "refrigerator", power_w: "150", hours_per_day: "24" });
      await page.goto("/homes");
      await pickHome(page, /Casa A11y/);

      const narrow = width < 768;
      const found: string[] = [];
      const visit = async (name: string, path: string, via: "nav" | "header" | "more", label: string) => {
        if (via === "nav") {
          await page.getByRole("navigation", { name: "Principal" }).filter({ visible: true }).getByRole("link", { name: new RegExp(`^${label}`) }).click();
        } else if (via === "header") {
          await page.getByRole("link", { name: new RegExp(`^${label}$`) }).filter({ visible: true }).first().click();
        } else {
          await page.getByRole("navigation", { name: "Más secciones" }).getByRole("link", { name: label }).click();
        }
        await page.waitForURL(`**${path}`);
        await expect(page.getByText(/^Cargando/)).toHaveCount(0);
        found.push(...(await problems(page, name)));
      };

      await expect(page.getByText(/^Cargando/)).toHaveCount(0);
      found.push(...(await problems(page, "dashboard")));
      await visit("consumption", "/consumption", "nav", "Consumo");
      await visit("readings", "/readings", "nav", "Lecturas");
      await visit("bills", "/bills", "nav", "Facturas");
      await visit("equipment", "/equipment", "nav", "Equipos");
      await visit("alerts", "/alerts", "nav", "Alertas");
      if (narrow) {
        // En pantallas estrechas Meta, Ahorro y Apagones solo se alcanzan desde «Más secciones» (en Perfil).
        await visit("profile", "/profile", "header", "Perfil");
        await visit("savings", "/savings", "more", "Ahorro");
        await visit("profile", "/profile", "header", "Perfil");
        await visit("outages", "/outages", "more", "Apagones");
        await visit("profile", "/profile", "header", "Perfil");
        await visit("goal", "/goal", "more", "Meta");
      } else {
        await visit("savings", "/savings", "nav", "Ahorro");
        await visit("outages", "/outages", "nav", "Apagones");
        await visit("goal", "/goal", "nav", "Meta");
        await visit("profile", "/profile", "nav", "Perfil");
      }
      await page.getByRole("link", { name: /^(Mi cuenta|Cuenta)$/ }).filter({ visible: true }).first().click();
      await page.waitForURL("**/account");
      found.push(...(await problems(page, "account")));
      expect(found, found.join("\n")).toEqual([]);
    });
  }
});
