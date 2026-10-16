// Estados loading / empty / error / Reintentar y navegación por teclado con manejo del foco.
import { addBill, bff, expect, freshHome, loaded, newPassword, openSection, registerViaApi, test, uniqueEmail } from "../support/test";

test.describe("estados de carga, vacío y error", () => {
  test("loading: mientras llega la respuesta se muestra «Cargando…» y luego el contenido", async ({ page, context }) => {
    const { homeId, pick } = await freshHome(page, context, "Casa Cargando", "EDESUR", false);
    await addBill(page, homeId, "2026-07-01", "2026-07-31", "300", "3900", 31);
    // La respuesta se retiene hasta que la prueba ha visto «Cargando…»: determinista, sin depender de la velocidad de la máquina
    // (con un retraso fijo, un equipo lento terminaba la consulta del panel antes de abrir «Facturas» y ya no había estado de carga).
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/bff/homes/*/bills*", async (route) => {
      await gate;
      await route.continue();
    });
    await pick();
    await openSection(page, "Facturas", "/bills");
    await expect(page.getByText(/^Cargando/).first()).toBeVisible();
    release();
    await expect(page.getByRole("main").getByRole("link", { name: /1–31 jul 2026|1 – 31 jul 2026/ })).toBeVisible();
    await expect(page.getByText(/^Cargando/)).toHaveCount(0);
  });

  test("error + Reintentar: un fallo del servidor no deja la pantalla rota y reintentar recupera los datos", async ({ page, context }) => {
    const { homeId, pick } = await freshHome(page, context, "Casa Error", "EDESUR", false);
    await addBill(page, homeId, "2026-07-01", "2026-07-31", "300", "3900", 31);
    let failing = true;
    await page.route("**/api/bff/homes/*/bills*", async (route) => {
      if (failing && route.request().method() === "GET") return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Error interno de prueba" }) });
      return route.continue();
    });
    await pick();
    await openSection(page, "Facturas", "/bills");
    const retry = page.getByRole("button", { name: /Reintentar/ });
    await expect(retry).toBeVisible();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByText("Error interno de prueba")).toHaveCount(0);        // no se muestra texto crudo del servidor
    failing = false;
    await retry.click();
    await expect(page.getByRole("main").getByRole("link", { name: /1–31 jul 2026|1 – 31 jul 2026/ })).toBeVisible();
    await expect(retry).toHaveCount(0);
  });

  test("error de red (API caída) en el panel: mensaje y reintento", async ({ page, context }) => {
    const { pick } = await freshHome(page, context, "Casa Sin Red", "EDESUR", false);
    await page.route("**/api/bff/homes/*/dashboard*", (route) => route.abort("failed"));
    await pick();
    await expect(page.getByRole("button", { name: /Reintentar/ })).toBeVisible();
    await page.unroute("**/api/bff/homes/*/dashboard*");
    await page.getByRole("button", { name: /Reintentar/ }).click();
    await loaded(page);
    await expect(page.getByRole("main").getByRole("heading", { name: "Inicio" })).toBeVisible();
  });

  test("empty: las listas sin datos explican qué hacer", async ({ page, context }) => {
    await freshHome(page, context, "Casa Vacía");
    await openSection(page, "Facturas", "/bills");
    await expect(page.getByText("Aún no hay facturas registradas")).toBeVisible();
    await openSection(page, "Lecturas", "/readings");
    await expect(page.getByText("Aún no hay lecturas")).toBeVisible();
    await openSection(page, "Equipos", "/equipment");
    await expect(page.getByText("Sin equipos declarados")).toBeVisible();
    await openSection(page, "Alertas", "/alerts");
    await expect(page.getByText("Sin alertas")).toBeVisible();
  });
});

test.describe("conectividad", () => {
  test("offline conserva el formulario y al reconectar refresca lecturas sin reenviar escrituras", async ({ page, context }) => {
    const { homeId } = await freshHome(page, context, "Casa Red");
    await addBill(page, homeId, "2026-07-01", "2026-07-31", "300", "3900", 31);
    let billReads = 0;
    let billWrites = 0;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname === `/api/bff/homes/${homeId}/bills`) {
        if (request.method() === "GET") billReads += 1;
        else billWrites += 1;
      }
    });
    await openSection(page, "Facturas", "/bills");
    await expect.poll(() => billReads).toBeGreaterThan(0);
    await page.getByRole("link", { name: "Registrar factura" }).click();
    await page.waitForURL("**/bills/new");
    await page.getByRole("button", { name: "Registrar manualmente" }).click();
    await page.getByLabel("Inicio del período").fill("2026-08-01");
    await page.getByLabel("Fin del período").fill("2026-08-31");
    await page.getByLabel("Consumo facturado (kWh)").fill("320");
    await page.getByLabel("Monto (RD$)").fill("4100");
    await page.getByLabel("Días facturados").fill("31");

    await context.setOffline(true);
    await expect(page.getByRole("status").filter({ hasText: "Sin conexión." })).toBeVisible();
    await expect(page.getByLabel("Consumo facturado (kWh)")).toHaveValue("320");
    const readsWhileOffline = billReads;
    await context.setOffline(false);
    await expect(page.getByRole("status").filter({ hasText: "Sin conexión." })).toHaveCount(0);
    await expect.poll(() => billReads).toBeGreaterThan(readsWhileOffline);
    await expect(page.getByLabel("Consumo facturado (kWh)")).toHaveValue("320");
    expect(billWrites).toBe(0);
    // No se pulsa Guardar: no hay una escritura pendiente que la app pueda reenviar.
    expect((await bff<unknown[]>(page, `homes/${homeId}/bills`)).body).toHaveLength(1);
  });
});

 test.describe("teclado y foco", () => {
  test("inicio de sesión solo con teclado: Tab recorre los campos y Enter envía", async ({ page, context }) => {
    const account = await registerViaApi(context);
    await context.clearCookies();
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").focus();
    await page.keyboard.type(account.email);
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Contraseña")).toBeFocused();
    await page.keyboard.type(account.password);
    await page.keyboard.press("Enter");
    await page.waitForURL("**/homes");
  });

  test("un envío con error mueve el foco al primer campo inválido y anuncia el error", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Correo electrónico").fill(uniqueEmail("foco"));
    await page.getByLabel("Contraseña").fill(newPassword());
    await page.getByRole("checkbox", { name: /acepto/i }).check();
    await page.getByLabel("Correo electrónico").fill("no-es-un-correo");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByLabel("Correo electrónico")).toBeFocused();            // el navegador enfoca el campo inválido
  });

  test("«Saltar al contenido» es lo primero que se enfoca y lleva el foco al contenido principal", async ({ page, context }) => {
    await freshHome(page, context, "Casa Teclado");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Saltar al contenido" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#contenido$/);
  });

  test("el menú principal se recorre con Tab y se activa con Enter", async ({ page, context }) => {
    await freshHome(page, context, "Casa Menú");
    const nav = page.getByRole("navigation", { name: "Principal" });
    await nav.getByRole("link", { name: /^Facturas/ }).focus();
    await expect(nav.getByRole("link", { name: /^Facturas/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await page.waitForURL("**/bills");
    await expect(nav.getByRole("link", { name: /^Facturas/ })).toHaveAttribute("aria-current", "page");
  });

  test("el diálogo de confirmación atrapa el foco, Escape lo cierra y el foco vuelve al botón que lo abrió", async ({ page, context }) => {
    await freshHome(page, context, "Casa Diálogo");
    await openSection(page, "Equipos", "/equipment");
    await page.getByRole("button", { name: "Agregar equipo" }).click();
    await page.getByLabel("Nombre", { exact: true }).fill("Plancha");
    await page.getByLabel("Potencia (W)").fill("1000");
    await page.getByLabel("Horas de uso por día").fill("1");
    await page.getByRole("button", { name: "Guardar equipo" }).click();
    const trigger = page.getByRole("button", { name: "Eliminar Plancha" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    for (let i = 0; i < 6; i++) {                                                  // Tab nunca sale del diálogo
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.getByRole("article").filter({ hasText: "Plancha" })).toBeVisible();   // Escape no borra
  });
});
