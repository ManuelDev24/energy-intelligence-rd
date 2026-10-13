// Facturas: creación manual, carga OCR (foto → borrador → revisión → confirmación), detalle e historial.
import { API_URL } from "../support/env";
import { type Account, bff, createHomeViaApi, expect, registerViaApi, test } from "../support/test";

let account: Account;

test.beforeEach(async ({ page, context }) => {
  account = await registerViaApi(context);
  await createHomeViaApi(page, "Casa Facturas");
  await page.goto("/homes");
  await page.getByRole("button", { name: /Casa Facturas/ }).first().click();
  await page.waitForURL("**/dashboard");
  await page.getByRole("link", { name: "Facturas" }).first().click();
  await page.waitForURL("**/bills");
});

async function manualForm(page: import("@playwright/test").Page, values: { start: string; end: string; kwh: string; amount: string; days?: string; due?: string }) {
  await page.getByRole("link", { name: "Registrar factura" }).click();
  await page.waitForURL("**/bills/new");
  await page.getByRole("button", { name: "Registrar manualmente" }).click();
  await page.getByLabel("Inicio del período").fill(values.start);
  await page.getByLabel("Fin del período").fill(values.end);
  await page.getByLabel("Consumo facturado (kWh)").fill(values.kwh);
  await page.getByLabel("Monto (RD$)").fill(values.amount);
  if (values.days) await page.getByLabel("Días facturados").fill(values.days);
  if (values.due) await page.getByLabel("Fecha límite de pago (opcional)").fill(values.due);
}

test.describe("factura manual", () => {
  test("@smoke estado vacío, validación, creación, historial y detalle", async ({ page }) => {
    await expect(page.getByText("Aún no hay facturas registradas")).toBeVisible();
    await manualForm(page, { start: "2026-08-12", end: "2026-09-07", kwh: "-5", amount: "1304.05", days: "27" });
    await page.getByRole("button", { name: "Confirmar y guardar factura" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Número mayor o igual a 0" })).toBeVisible();
    await expect(page).toHaveURL(/\/bills\/new$/);                            // una factura inválida no se guarda

    await page.getByLabel("Consumo facturado (kWh)").fill("240");
    await page.getByRole("button", { name: "Confirmar y guardar factura" }).click();
    await page.waitForURL("**/dashboard");

    await page.getByRole("link", { name: "Facturas" }).first().click();
    await page.waitForURL("**/bills");
    const row = page.getByRole("main").getByRole("link", { name: /12 ago – 7 sep 2026/ });
    await expect(row).toContainText("240 kWh · RD$ 1,304.05");
    await expect(row).toContainText("manual");
    await row.click();
    await page.waitForURL(/\/bills\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Detalle de factura" })).toBeVisible();
    await expect(page.getByText("240.00 kWh")).toBeVisible();
    await expect(page.getByText("RD$ 1,304.05").first()).toBeVisible();
  });

  test("un período solapado con otra factura se rechaza y no duplica", async ({ page }) => {
    await manualForm(page, { start: "2026-08-01", end: "2026-08-31", kwh: "300", amount: "3900", days: "31" });
    await page.getByRole("button", { name: "Confirmar y guardar factura" }).click();
    await page.waitForURL("**/dashboard");
    await page.getByRole("link", { name: "Facturas" }).first().click();
    await page.waitForURL("**/bills");
    await manualForm(page, { start: "2026-08-15", end: "2026-09-14", kwh: "310", amount: "4000", days: "31" });
    await page.getByRole("button", { name: "Confirmar y guardar factura" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    const homes = await bff<Array<{ id: string }>>(page, "homes?limit=10&offset=0");
    const bills = await bff<unknown[]>(page, `homes/${homes.body[0].id}/bills`);
    expect(bills.body).toHaveLength(1);
  });

  test("editar y eliminar (con confirmación) desde el detalle", async ({ page }) => {
    await manualForm(page, { start: "2026-08-01", end: "2026-08-31", kwh: "300", amount: "3900", days: "31" });
    await page.getByRole("button", { name: "Confirmar y guardar factura" }).click();
    await page.waitForURL("**/dashboard");
    await page.getByRole("link", { name: "Facturas" }).first().click();
    await page.getByRole("main").getByRole("link", { name: /1 – 31 ago 2026|1–31 ago 2026/ }).click();
    await page.waitForURL(/\/bills\/[0-9a-f-]{36}$/);
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await page.getByLabel("Consumo facturado (kWh)").fill("320");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await page.waitForURL("**/bills");                                          // al guardar vuelve al historial con el dato nuevo
    const edited = page.getByRole("main").getByRole("link", { name: /1–31 ago 2026/ });
    await expect(edited).toContainText("320 kWh");
    await edited.click();
    await page.waitForURL(/\/bills\/[0-9a-f-]{36}$/);
    await expect(page.getByText("320.00 kWh")).toBeVisible();

    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("320.00 kWh")).toBeVisible();                  // cancelar no borra
    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
    await page.waitForURL("**/bills");
    await expect(page.getByText("Aún no hay facturas registradas")).toBeVisible();
  });
});

test.describe("carga OCR", () => {
  test("@smoke foto → progreso → borrador revisable → confirmar guarda UNA factura con su original", async ({ page, request, run }) => {
    await page.getByRole("link", { name: "Registrar factura" }).click();
    await page.waitForURL("**/bills/new");
    await page.locator("input[type=file]").setInputFiles(run.bill_image);
    await expect(page.getByRole("heading", { name: "Revisa la sugerencia" })).toBeVisible({ timeout: 90_000 });
    // La lectura NO crea la factura por sí sola.
    const homes = await bff<Array<{ id: string }>>(page, "homes?limit=10&offset=0");
    expect((await bff<unknown[]>(page, `homes/${homes.body[0].id}/bills`)).body).toHaveLength(0);
    // El borrador precarga lo leído y la persona puede corregirlo.
    const expected = run.bill_expected;
    await expect(page.getByLabel("Inicio del período")).toHaveValue(expected.period_start);
    await expect(page.getByLabel("Fin del período")).toHaveValue(expected.period_end);
    await expect(page.getByLabel("Consumo facturado (kWh)")).toHaveValue(/^240(\.00)?$/);
    await expect(page.getByLabel("Monto (RD$)")).toHaveValue(/^1304\.05$/);
    await expect(page.getByLabel("Fecha límite de pago (opcional)")).toHaveValue(expected.due_date);
    await page.getByRole("button", { name: "Confirmar y guardar factura" }).click();
    await page.waitForURL("**/dashboard");
    const bills = await bff<Array<{ id: string; kwh: string; source: string }>>(page, `homes/${homes.body[0].id}/bills`);
    expect(bills.body).toHaveLength(1);
    // El BFF no expone el listado de documentos a propósito: se consulta la API real con la misma cuenta.
    const login = await request.post(`${API_URL}/api/v1/auth/login`, { data: { email: account.email, password: account.password } });
    const { access_token } = await login.json();
    const documents = await request.get(`${API_URL}/api/v1/homes/${homes.body[0].id}/documents`, { headers: { Authorization: `Bearer ${access_token}` } });
    expect((await documents.json()).map((d: { bill_id: string | null }) => d.bill_id)).toEqual([bills.body[0].id]); // el original queda ligado a la factura confirmada
    await page.getByRole("link", { name: "Facturas" }).first().click();
    await expect(page.getByRole("main").getByRole("link", { name: /12 ago – 7 sep 2026/ })).toBeVisible();
  });

  test("un archivo que no es una factura legible da un mensaje claro y no crea nada", async ({ page }) => {
    await page.getByRole("link", { name: "Registrar factura" }).click();
    await page.waitForURL("**/bills/new");
    await page.locator("input[type=file]").setInputFiles({ name: "falso.png", mimeType: "image/png", buffer: Buffer.from("esto no es una imagen") });
    await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Revisa la sugerencia" })).toHaveCount(0);
    const homes = await bff<Array<{ id: string }>>(page, "homes?limit=10&offset=0");
    expect((await bff<unknown[]>(page, `homes/${homes.body[0].id}/bills`)).body).toHaveLength(0);
  });
});
