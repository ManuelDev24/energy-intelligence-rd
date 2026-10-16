// ERD-WEB-CROSS-BROWSER: responsive/reflow, teclado y red lenta en motores desktop y emulaciones móviles.
// 640 px representa el viewport CSS aproximado a 200% zoom desde 1280 px; no sustituye zoom manual real.
import { bff, freshHome, openSection, expect, test } from "../support/test";

const VIEWPORTS: Array<[number, number]> = [[320, 740], [375, 812], [640, 900], [768, 1024], [1280, 800]];

async function noHorizontalOverflow(page: import("@playwright/test").Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
}

test.describe("aceptación multi-browser", () => {
  test("login y registro reflow sin desborde desde 320 hasta 1280 CSS px", async ({ page }) => {
    for (const path of ["/login", "/register"]) {
      await page.goto(path);
      for (const [width, height] of VIEWPORTS) await noHorizontalOverflow(page, width, height);
    }
  });

  test("formulario de acceso permite navegar correo→contraseña con teclado", async ({ page }) => {
    await page.goto("/login");
    const email = page.getByLabel("Correo electrónico");
    const password = page.getByLabel("Contraseña");
    await email.focus();
    await expect(email).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(password).toBeFocused();
    for (const [width, height] of VIEWPORTS) await noHorizontalOverflow(page, width, height);
  });

  test("Tomar foto expone cámara trasera y la carga llega a borrador; el selector mantiene PDF", async ({ page, context, run }) => {
    const { homeId } = await freshHome(page, context, "Casa Cámara E2E");
    await openSection(page, "Facturas", "/bills");
    await page.getByRole("link", { name: "Registrar factura" }).click();
    await page.waitForURL("**/bills/new");
    const camera = page.getByLabel("Tomar foto");
    await expect(camera).toHaveAttribute("accept", "image/*");
    await expect(camera).toHaveAttribute("capture", "environment");
    await expect(page.getByLabel("Elegir foto o PDF")).toHaveAttribute("accept", "image/*,application/pdf");
    const before = (await bff<unknown[]>(page, `homes/${homeId}/bills`)).body.length;
    await camera.setInputFiles(run.bill_image);
    await expect(page.getByRole("heading", { name: "Revisa la sugerencia" })).toBeVisible({ timeout: 90_000 });
    expect((await bff<unknown[]>(page, `homes/${homeId}/bills`)).body).toHaveLength(before);
    await page.getByRole("button", { name: "Confirmar y guardar factura" }).click();
    await page.waitForURL("**/dashboard");
    expect((await bff<unknown[]>(page, `homes/${homeId}/bills`)).body).toHaveLength(before + 1);
  });

  test("dashboard conserva estado loading bajo red lenta y termina al responder la API", async ({ page, context }) => {
    const { pick } = await freshHome(page, context, "Casa Red Lenta", "EDESUR", false);
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const reachedApi = new Promise<void>((resolve) => { entered = resolve; });
    await page.route("**/api/bff/homes/*/dashboard*", async (route) => {
      entered();
      await gate;
      await route.continue();
    });
    const selecting = pick();
    try {
      await reachedApi;
      await expect(page.getByText(/^Cargando/).first()).toBeVisible();
      release();
      await selecting;
    } finally {
      release();
    }
    await expect(page.getByRole("main").getByRole("heading", { name: "Inicio" })).toBeVisible();
    for (const [width, height] of VIEWPORTS) await noHorizontalOverflow(page, width, height);
  });
});
