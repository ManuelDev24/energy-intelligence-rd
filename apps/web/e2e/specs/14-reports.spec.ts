// ERD-RPT-01: informe energético contra PostgreSQL + API + web reales. Cifras por período, calidad por dato, vacío honesto,
// impresión (diálogo del navegador), accesibilidad en tres anchos y privacidad entre cuentas.
import { addBill, bff, expect, freshHome, loaded, openSection, registerViaApi, test } from "../support/test";
import { axeProblems } from "../support/axe";

async function setPeriod(page: import("@playwright/test").Page, from: string, to: string) {
  await page.getByLabel("Desde").fill(from);
  await page.getByLabel("Hasta").fill(to);
}

test.describe("Informes", () => {
  test("totales reales, comparación y estimados marcados; accesible en 360, 768 y 1280", async ({ page, context }) => {
    const { homeId } = await freshHome(page, context, "Casa Informe");
    await addBill(page, homeId, "2026-05-01", "2026-05-31", "280", "3640.00", 31);
    await addBill(page, homeId, "2026-07-01", "2026-07-31", "300", "3900.00", 31);
    await addBill(page, homeId, "2026-08-01", "2026-08-31", "340", "4420.00", 31);
    expect((await bff(page, `homes/${homeId}/equipment`, "POST", { name: "Aire sala", room: "Sala", power_w: "1500", hours_per_day: "6", kind: "air_conditioner" })).status).toBe(201);
    await openSection(page, "Informes", "/reports");
    await setPeriod(page, "2026-07-01", "2026-08-31");
    const report = page.getByTestId("energy-report");
    await expect(report).toBeVisible();
    await loaded(page);

    const summary = report.getByRole("region", { name: "Resumen" });
    await expect(summary.getByText("Consumo total").locator("xpath=following-sibling::dd[1]")).toHaveText("640 kWh");
    await expect(summary.getByText("Gasto total").locator("xpath=following-sibling::dd[1]")).toContainText("8,320.00");
    await expect(summary.getByText("Precio medio").locator("xpath=following-sibling::dd[1]")).toContainText("ESTIMADO");
    await expect(report.getByRole("region", { name: /Frente al período anterior/ })).toContainText("Consumo anterior");
    await expect(report.getByRole("region", { name: "Equipos que más pesan (estimado)" })).toContainText("Aire sala (Sala)");
    await expect(report.getByRole("region", { name: "Fuentes" })).toContainText("registradas por ti — real");
    await expect(report.getByRole("region", { name: "Notas" })).toContainText("no tiene medición diaria ni por hora");

    // Imprimir abre el diálogo del navegador; aquí se intercepta para comprobar que se invoca.
    await page.evaluate(() => { (window as unknown as { __printed: number }).__printed = 0; window.print = () => { (window as unknown as { __printed: number }).__printed += 1; }; });
    await page.getByRole("button", { name: /Imprimir o guardar PDF/ }).click();
    expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);

    for (const [width, height] of [[360, 740], [768, 1024], [1280, 800]] as const) {
      await page.setViewportSize({ width, height });
      const found = await axeProblems(page, `reports@${width}`);
      expect(found, found.join("\n")).toEqual([]);
    }
  });

  test("sin facturas en el período no inventa cifras; un período inválido se explica", async ({ page, context }) => {
    await freshHome(page, context, "Casa Vacía");
    await openSection(page, "Informes", "/reports");
    await setPeriod(page, "2026-01-01", "2026-01-31");
    const report = page.getByTestId("energy-report");
    await expect(report.getByText("No hay facturas registradas en este período.")).toBeVisible();
    await expect(report.getByText("Consumo total")).toHaveCount(0);
    await setPeriod(page, "2025-01-01", "2026-06-01");
    await expect(page.getByText(/hasta 366 días/)).toBeVisible();
    await expect(page.getByTestId("energy-report")).toHaveCount(0);
  });

  test("el informe de una vivienda no se puede leer desde otra cuenta", async ({ page, context, browser }) => {
    const { homeId } = await freshHome(page, context, "Casa Privada");
    expect((await bff(page, `homes/${homeId}/reports/energy`)).status).toBe(200);
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await registerViaApi(other);
    await otherPage.goto("/homes");
    expect((await bff(otherPage, `homes/${homeId}/reports/energy`)).status).toBe(404);
    await other.close();
  });
});
