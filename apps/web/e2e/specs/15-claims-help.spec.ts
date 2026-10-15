// ERD-CLAIM-01 y ERD-HELP-01 contra PostgreSQL + API + web reales: caso con resumen congelado, notas, referencia, cierre, privacidad entre
// cuentas, ayuda con búsqueda sin acentos y contacto honesto; axe en tres anchos.
import { addBill, bff, expect, freshHome, loaded, openSection, registerViaApi, test } from "../support/test";
import { axeProblems } from "../support/axe";

test.describe("Reclamaciones", () => {
  test("crear caso con resumen neutral, anotar, guardar referencia y cerrar; accesible en 3 anchos", async ({ page, context }) => {
    const { homeId } = await freshHome(page, context, "Casa Reclamo");
    await addBill(page, homeId, "2026-07-01", "2026-07-31", "300", "3900.00", 31);
    await addBill(page, homeId, "2026-08-01", "2026-08-31", "390", "5460.00", 31);
    await openSection(page, "Reclamaciones", "/claims");
    await loaded(page);
    await expect(page.getByText("Aún no tienes reclamaciones")).toBeVisible();

    await page.getByRole("button", { name: /Nueva reclamación/ }).click();
    await page.getByRole("button", { name: "Crear reclamación" }).click();
    await expect(page.getByText("Elige de qué se trata.")).toBeVisible();
    await page.getByLabel("¿De qué se trata?").selectOption("billing_error");
    await page.getByLabel("Factura", { exact: true }).selectOption({ label: "1–31 ago 2026" });
    await page.getByLabel("Asunto").fill("Cobro de agosto mayor al esperado");
    await page.getByLabel("Qué pasó").fill("Creo que el cobro de agosto es más alto de lo normal.");
    await page.getByRole("button", { name: "Crear reclamación" }).click();

    const item = page.getByRole("list", { name: "Reclamaciones" }).getByRole("listitem").first();
    await expect(item.getByTestId("claim-status")).toHaveText("Abierta");
    await item.getByRole("link", { name: "Cobro de agosto mayor al esperado" }).click();
    await page.waitForURL("**/claims/*");
    const evidence = page.getByRole("region", { name: "Resumen de tus datos" });
    await expect(evidence.getByText("Consumo facturado").locator("xpath=following-sibling::dd[1]")).toHaveText("390 kWh");
    await expect(evidence.getByText("Cambio de consumo (estimado)")).toBeVisible();
    await expect(page.getByText(/no afirma que la distribuidora haya cometido un error/)).toBeVisible();

    await page.getByLabel("Agregar una nota").fill("Llamé a la distribuidora y me dieron un número.");
    await page.getByRole("button", { name: "Guardar nota" }).click();
    await expect(page.getByRole("region", { name: "Historial" })).toContainText("Llamé a la distribuidora");
    await page.getByLabel("Número de referencia de la distribuidora").fill("DIST-2026-55");
    await page.getByRole("button", { name: "Guardar número" }).click();
    await expect(page.getByTestId("claim-reference")).toHaveText("DIST-2026-55");

    for (const [width, height] of [[360, 740], [768, 1024], [1280, 800]] as const) {
      await page.setViewportSize({ width, height });
      const found = await axeProblems(page, `claim@${width}`);
      expect(found, found.join("\n")).toEqual([]);
    }

    await page.getByRole("button", { name: "Cerrar caso" }).click();
    await page.getByRole("button", { name: "Sí, cerrar" }).click();
    await expect(page.getByTestId("claim-status")).toHaveText("Cerrada");
    await expect(page.getByRole("button", { name: "Cerrar caso" })).toHaveCount(0);
  });

  test("un caso no se ve ni se toca desde otra cuenta; el duplicado abierto se rechaza", async ({ page, context, browser }) => {
    const { homeId } = await freshHome(page, context, "Casa Privada");
    const body = { kind: "other", subject: "Asunto privado", description: "Descripción privada suficiente." };
    const created = await bff<{ id: string }>(page, `homes/${homeId}/claims`, "POST", body);
    expect(created.status).toBe(201);
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await registerViaApi(other);
    await otherPage.goto("/homes");
    expect((await bff(otherPage, `homes/${homeId}/claims/${created.body.id}`)).status).toBe(404);
    expect((await bff(otherPage, `homes/${homeId}/claims`)).status).toBe(404);
    expect((await bff(otherPage, `homes/${homeId}/claims/${created.body.id}/close`, "POST", {})).status).toBe(404);
    await other.close();
  });
});

test.describe("Ayuda", () => {
  test("busca sin acentos, abre un artículo y no inventa un correo de soporte; accesible en 3 anchos", async ({ page, context }) => {
    await freshHome(page, context, "Casa Ayuda");
    await openSection(page, "Ayuda", "/help");
    await loaded(page);
    await expect(page.getByRole("list", { name: "Artículos de ayuda" })).toBeVisible();
    await page.getByRole("searchbox", { name: "Buscar" }).fill("contrasena");
    await expect(page.getByRole("status").filter({ hasText: /artículo|resultado/ })).toContainText("resultado(s) para «contrasena»");
    const article = page.getByRole("list", { name: "Artículos de ayuda" }).getByRole("listitem").first();
    await expect(article).toContainText("Olvidé mi contraseña");
    await article.getByText("Olvidé mi contraseña").click();
    await expect(article).toContainText("enlace de un solo uso");
    await expect(page.getByTestId("help-contact")).toContainText("aún no está configurado");
    await expect(page.getByTestId("help-contact").getByRole("link")).toHaveCount(0);
    await page.getByRole("searchbox", { name: "Buscar" }).fill("zzzzzz");
    await expect(page.getByText(/No encontramos nada/)).toBeVisible();
    await page.getByRole("searchbox", { name: "Buscar" }).fill("");
    await expect(page.getByRole("list", { name: "Artículos de ayuda" })).toBeVisible();
    for (const [width, height] of [[360, 740], [768, 1024], [1280, 800]] as const) {
      await page.setViewportSize({ width, height });
      const found = await axeProblems(page, `help@${width}`);
      expect(found, found.join("\n")).toEqual([]);
    }
  });
});
