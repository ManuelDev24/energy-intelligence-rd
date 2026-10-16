// ERD-WEB-RELEASE-QA: recorrido integrado de la misma cuenta contra PostgreSQL, API, worker y BFF reales.
// Las facturas y el perfil son sintéticos; no representa aceptación de staging ni datos de clientes.
import { addBill, addReading, bff, expect, loaded, openSection, registerViaUi, test } from "../support/test";
import type { Page } from "@playwright/test";

async function completeOnboarding(page: Page, name: string) {
  await page.getByRole("button", { name: "Empezar" }).click();
  await page.getByLabel("Nombre de la vivienda").fill(name);
  await page.getByLabel("Provincia").fill("Santo Domingo");
  await page.getByLabel("Municipio").fill("Santo Domingo Este");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await page.getByLabel("Selecciona tu distribuidora").selectOption("EDESUR");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await page.getByLabel("Tipo de usuario").fill("Residencial");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await page.getByLabel("Ocupantes").fill("4");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await page.getByLabel("Número de cuenta").fill("1234567890");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await page.getByLabel("Meta de consumo mensual (kWh)").fill("300");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(page.getByText(`${name} · Santo Domingo, Santo Domingo Este · EDESUR`)).toBeVisible();
  await page.getByRole("button", { name: "Ir al panel" }).click();
  await page.waitForURL("**/dashboard");
}

const rdYesterday = () => new Date(Date.now() - 4 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);

test("ERD-WEB-RELEASE-QA: registro→vivienda→OCR→consumo→meta/Ahorro/Score→alertas/apagones→Copilot→informe→reclamación→ayuda→perfil", async ({ page, run }) => {
  test.setTimeout(300_000);
  const name = "Casa Release QA";
  await registerViaUi(page);
  await expect(page.getByRole("heading", { name: "Mis viviendas" })).toBeVisible();
  await completeOnboarding(page, name);

  const homes = await bff<Array<{ id: string }>>(page, "homes?limit=10&offset=0");
  expect(homes.status).toBe(200);
  const homeId = homes.body.find((home) => home.id)?.id;
  expect(homeId).toBeTruthy();
  // Historial sintético de meses previos para ejercitar consumo, alerta y score antes del OCR actual.
  await addBill(page, homeId!, "2026-04-01", "2026-04-30", "120", "1560.00", 30);
  await addBill(page, homeId!, "2026-05-01", "2026-05-31", "130", "1690.00", 31);
  await addBill(page, homeId!, "2026-06-01", "2026-06-30", "140", "1820.00", 30);
  await addBill(page, homeId!, "2026-07-01", "2026-07-31", "150", "1950.00", 31);

  // OCR crea un borrador, no una factura; la factura aparece solo al confirmar.
  await page.getByRole("link", { name: "Facturas" }).first().click();
  await page.waitForURL("**/bills");
  await page.getByRole("link", { name: "Registrar factura" }).click();
  await page.waitForURL("**/bills/new");
  const before = await bff<Array<{ id: string }>>(page, `homes/${homeId}/bills`);
  await page.getByLabel("Elegir foto o PDF").setInputFiles(run.bill_image);
  await expect(page.getByRole("heading", { name: "Revisa la sugerencia" })).toBeVisible({ timeout: 90_000 });
  expect((await bff<unknown[]>(page, `homes/${homeId}/bills`)).body).toHaveLength(before.body.length);
  await page.getByRole("button", { name: "Confirmar y guardar factura" }).click();
  await page.waitForURL("**/dashboard");
  expect((await bff<unknown[]>(page, `homes/${homeId}/bills`)).body).toHaveLength(5);

  await addReading(page, homeId!, 20, 1000);
  await addReading(page, homeId!, 10, 1060);
  await addReading(page, homeId!, 1, 1120);
  await openSection(page, "Consumo", "/consumption");
  await loaded(page);
  await expect(page.getByRole("heading", { name: "Consumo" })).toBeVisible();

  await openSection(page, "Meta", "/goal");
  await loaded(page);
  await page.getByLabel("Meta de consumo mensual (kWh)").fill("280");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByLabel("Meta de consumo mensual (kWh)")).toHaveValue("280.00");

  await openSection(page, "Equipos", "/equipment");
  await loaded(page);
  await page.getByRole("button", { name: "Agregar equipo" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Aire sala");
  await page.getByLabel("Tipo de equipo").selectOption("air_conditioner");
  await page.getByLabel("Potencia (W)").fill("1500");
  await page.getByLabel("Horas de uso por día").fill("6");
  await page.getByRole("button", { name: "Guardar equipo" }).click();
  await openSection(page, "Ahorro", "/savings");
  await loaded(page);
  await expect(page.getByTestId("recommendation").filter({ hasText: "Una hora menos de aire acondicionado" })).toBeVisible();
  await expect(page.getByTestId("goal-proposal")).toBeVisible();
  await openSection(page, "Inicio", "/dashboard");
  await loaded(page);
  await expect(page.getByTestId("energy-score")).toBeVisible();
  const score = await bff<{ status: string; score: number | null }>(page, `homes/${homeId}/energy-score`);
  expect(score.status).toBe(200);
  expect(["ok", "insufficient_data"]).toContain(score.body.status);

  await openSection(page, "Alertas", "/alerts");
  await loaded(page);
  await expect(page.getByText("Consumo más alto que el período anterior").first()).toBeVisible();

  await openSection(page, "Apagones", "/outages");
  await loaded(page);
  const day = rdYesterday();
  await page.getByLabel("Día en que se fue la luz").fill(day);
  await page.getByLabel("Hora en que se fue", { exact: true }).fill("10:00");
  await page.getByLabel("Todavía sin luz").uncheck();
  await page.getByLabel("Día en que volvió").fill(day);
  await page.getByLabel("Hora en que volvió", { exact: true }).fill("10:30");
  await page.getByRole("button", { name: "Guardar apagón" }).click();
  await expect(page.getByTestId("outage")).toHaveCount(1);

  await openSection(page, "Copilot", "/copilot");
  await loaded(page);
  await page.getByRole("group", { name: "Preguntas rápidas" }).getByRole("button", { name: "Analiza mi factura" }).click();
  const copilotAnswer = page.getByRole("list", { name: "Mensajes" }).getByRole("listitem").filter({ hasText: "Copilot" }).last();
  await expect(copilotAnswer).toContainText("facturas registradas", { timeout: 20_000 });
  await expect(copilotAnswer.getByText(/Fuentes consultadas/)).toBeVisible();

  await openSection(page, "Informes", "/reports");
  await loaded(page);
  await page.getByLabel("Desde").fill("2026-07-01");
  await page.getByLabel("Hasta").fill("2026-09-30");
  await expect(page.getByTestId("energy-report")).toBeVisible();
  await expect(page.getByTestId("energy-report").getByRole("region", { name: "Resumen" })).toContainText("Consumo total");

  await openSection(page, "Reclamaciones", "/claims");
  await loaded(page);
  await page.getByRole("button", { name: /Nueva reclamación/ }).click();
  await page.getByRole("button", { name: "Crear reclamación" }).click();
  await page.getByLabel("¿De qué se trata?").selectOption("other");
  await page.getByLabel("Asunto").fill("Consulta de prueba de release");
  await page.getByLabel("Qué pasó").fill("Recorrido automatizado de aceptación usando datos sintéticos.");
  await page.getByRole("button", { name: "Crear reclamación" }).click();
  await expect(page.getByRole("list", { name: "Reclamaciones" })).toContainText("Consulta de prueba de release");

  await openSection(page, "Ayuda", "/help");
  await loaded(page);
  await page.getByRole("searchbox", { name: "Buscar" }).fill("contrasena");
  await expect(page.getByRole("list", { name: "Artículos de ayuda" })).toContainText("Olvidé mi contraseña");

  await openSection(page, "Perfil", "/profile");
  await loaded(page);
  await expect(page.getByLabel("Nombre de la vivienda")).toHaveValue(name);
});
