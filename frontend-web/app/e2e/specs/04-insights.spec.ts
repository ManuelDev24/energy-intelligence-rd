// Panel, consumo (por factura y por lecturas, con comparación), metas, equipos, alertas y recomendaciones.
import { addBill, addReading, expect, freshHome, loaded, loginViaUi, openSection, pickHome, test } from "../support/test";

test.describe("panel de una vivienda piloto", () => {
  test("etiquetas de calidad, alerta crítica, proyección y recomendación con su enlace", async ({ page, run }) => {
    await loginViaUi(page, { email: run.pilot_email, password: run.pilot_password });
    await pickHome(page, /Vivienda piloto 01/);
    await loaded(page);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Inicio" })).toBeVisible();
    await expect(main.getByText("Crítica", { exact: true }).first()).toBeVisible();
    await expect(main.getByText(/El consumo subió 50\.00% frente al período anterior/)).toBeVisible();
    await expect(main.getByText("Promedio diario").first()).toBeVisible();
    await expect(main.getByText("ESTIMADO").first()).toBeVisible();
    await expect(main.getByText("PROYECTADO").first()).toBeVisible();
    await expect(main.getByText("Datos de demostración")).toBeVisible();
    await expect(main.getByText("Estado de los datos")).toBeVisible();
    // La recomendación enlaza a «Equipos».
    await expect(main.getByText(/Revise equipos de mayor uso/)).toBeVisible();
    await main.getByRole("link", { name: "Ver qué equipos consumen más" }).click();
    await page.waitForURL("**/equipment");
    await loaded(page);
    await expect(page.getByRole("heading", { name: "Equipos" })).toBeVisible();
  });
});

test.describe("consumo", () => {
  test("por factura: última factura, variación y tabla de datos accesible", async ({ page, run }) => {
    await loginViaUi(page, { email: run.pilot_email, password: run.pilot_password });
    await pickHome(page, /Vivienda piloto 01/);
    await openSection(page, "Consumo", "/consumption");
    await page.getByRole("tab", { name: "Por factura" }).click();
    await loaded(page);
    const main = page.getByRole("main");
    await expect(main.getByText("420 kWh").first()).toBeVisible();
    await expect(main.getByText("+50.00%").first()).toBeVisible();
    await expect(main.getByText("PROYECTADO").first()).toBeVisible();
    await main.getByRole("button", { name: "Ver tabla de datos" }).first().click();
    const table = main.getByRole("table", { name: /Consumo y monto por factura/ });
    await expect(table.getByRole("row")).toHaveCount(4);                       // encabezado + 3 facturas
    await expect(table.getByRole("row", { name: /1–31 ago 2026.*420 kWh.*5,600\.00/ })).toBeVisible();
  });

  test("por lecturas: consumo del rango y comparación con el período anterior", async ({ page, context }) => {
    const { homeId } = await freshHome(page, context, "Casa Lecturas");
    // Lecturas acumuladas del medidor en los dos últimos tramos de 30 días (60 → 0 días atrás).
    for (const [daysAgo, kwh] of [[58, 1000], [45, 1090], [31, 1170], [29, 1185], [15, 1290], [1, 1420]] as const) await addReading(page, homeId, daysAgo, kwh);
    await openSection(page, "Consumo", "/consumption");
    await page.getByRole("button", { name: "Últimos 30 días" }).click();
    await loaded(page);
    await expect(page.getByTestId("consumption-total").or(page.getByText(/Total/).first())).toBeVisible();
    await page.getByRole("checkbox", { name: "Comparar con el período anterior" }).check();
    await loaded(page);
    await expect(page.getByRole("main").getByText(/período anterior/).first()).toBeVisible();
    await expect(page.getByRole("main").getByText("REAL").first()).toBeVisible();   // lo medido por lecturas es REAL
  });

  test("una vivienda sin lecturas no inventa consumo: estado vacío con acción", async ({ page, context }) => {
    await freshHome(page, context, "Casa Sin Lecturas");
    await openSection(page, "Consumo", "/consumption");
    await loaded(page);
    await expect(page.getByText("Sin consumo calculable en este rango")).toBeVisible();
    await expect(page.getByRole("link", { name: "Registrar lectura" }).first()).toBeVisible();
  });
});

test.describe("metas", () => {
  test("definir una meta de consumo la guarda y se recuerda al volver", async ({ page, context }) => {
    await freshHome(page, context, "Casa Meta");
    await openSection(page, "Meta", "/goal");
    await loaded(page);
    await expect(page.getByText("No hay meta mensual definida para esta vivienda.")).toBeVisible();
    await page.getByLabel("Meta de consumo mensual (kWh)").fill("250");
    await page.getByRole("button", { name: "Guardar meta" }).click();
    await expect(page.getByLabel("Meta de consumo mensual (kWh)")).toHaveValue("250.00");
    await expect(page.getByText("No hay meta mensual definida para esta vivienda.")).toHaveCount(0);
    await openSection(page, "Facturas", "/bills");
    await openSection(page, "Meta", "/goal");
    await expect(page.getByLabel("Meta de consumo mensual (kWh)")).toHaveValue("250.00");
  });

  test("una meta inválida se rechaza con mensaje y no se guarda", async ({ page, context }) => {
    await freshHome(page, context, "Casa Meta Mala");
    await openSection(page, "Meta", "/goal");
    await page.getByLabel("Meta de consumo mensual (kWh)").fill("-3");
    await page.getByRole("button", { name: "Guardar meta" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /mayor|número|válid/i }).first()).toBeVisible();
  });
});

test.describe("equipos", () => {
  test("alta con tipo, marca, modelo e icono; el reparto suma 100 %; editar y eliminar con confirmación", async ({ page, context }) => {
    await freshHome(page, context, "Casa Equipos");
    await openSection(page, "Equipos", "/equipment");
    await loaded(page);
    await expect(page.getByText("Sin equipos declarados")).toBeVisible();
    await page.getByRole("button", { name: "Agregar equipo" }).click();
    await page.getByLabel("Nombre", { exact: true }).fill("Aire sala");
    await page.getByLabel("Tipo de equipo").selectOption("air_conditioner");
    await page.getByLabel("Marca (opcional)").fill("Samsung");
    await page.getByLabel("Modelo (opcional)").fill("AR12");
    await page.getByLabel("Potencia (W)").fill("1500");
    await page.getByLabel("Horas de uso por día").fill("6");
    await page.getByRole("button", { name: "Guardar equipo" }).click();
    const card = page.getByRole("article").filter({ hasText: "Aire sala" });
    await expect(card).toContainText("Aire acondicionado");
    await expect(card).toContainText("Samsung AR12");
    await expect(card).toContainText("100% del total estimado".replace("100%", "100.00%"));
    await expect(card).toContainText("ESTIMADO");

    await page.getByRole("button", { name: "Agregar equipo" }).click();
    await page.getByLabel("Nombre", { exact: true }).fill("Nevera");
    await page.getByLabel("Potencia (W)").fill("150");
    await page.getByLabel("Horas de uso por día").fill("24");
    await page.getByRole("button", { name: "Guardar equipo" }).click();
    await expect(page.getByRole("article").filter({ hasText: "Nevera" })).toBeVisible();
    const shares = await page.getByTestId("device-share").allInnerTexts();
    expect(shares.map((s) => Number(s.match(/([\d.]+)%/)![1])).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1);

    await page.getByRole("button", { name: "Editar Nevera" }).click();
    await page.getByLabel("Horas de uso por día").fill("12");
    await page.getByRole("button", { name: "Guardar equipo" }).click();
    await expect(page.getByRole("article").filter({ hasText: "Nevera" })).toContainText("12 h/día");

    await page.getByRole("button", { name: "Eliminar Nevera" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("article").filter({ hasText: "Nevera" })).toBeVisible();
    await page.getByRole("button", { name: "Eliminar Nevera" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
    await expect(page.getByRole("article").filter({ hasText: "Nevera" })).toHaveCount(0);
  });
});

test.describe("alertas", () => {
  test("una subida fuerte de consumo crea una alerta crítica que se puede leer y descartar", async ({ page, context }) => {
    const { homeId } = await freshHome(page, context, "Casa Alertas");
    await addBill(page, homeId, "2026-06-01", "2026-06-30", "200", "2600", 30);
    await addBill(page, homeId, "2026-07-01", "2026-07-31", "320", "4100", 31);   // +60 %: crítica
    await page.reload();
    await pickHome(page, /Casa Alertas/);
    await openSection(page, "Alertas", "/alerts");
    await loaded(page);
    const critical = page.getByRole("article").filter({ hasText: "Consumo más alto que el período anterior" }).or(page.locator("li").filter({ hasText: "Consumo más alto que el período anterior" })).first();
    await expect(critical).toContainText("Crítica");
    await expect(critical).toContainText("+60.00%");
    await expect(critical).toContainText(/nueva/i);
    await critical.getByRole("button", { name: "Marcar leída" }).click();
    await expect(critical).not.toContainText(/nueva/i);
    await critical.getByRole("button", { name: "Descartar" }).click();
    await expect(page.getByText("Consumo más alto que el período anterior")).toHaveCount(0);
  });

  test("sin alertas muestra el estado vacío", async ({ page, context }) => {
    await freshHome(page, context, "Casa Tranquila");
    await openSection(page, "Alertas", "/alerts");
    await loaded(page);
    await expect(page.getByText("Sin alertas")).toBeVisible();
  });
});
