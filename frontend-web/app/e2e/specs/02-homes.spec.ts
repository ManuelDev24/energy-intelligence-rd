// Onboarding, creación/selección de vivienda y acceso a las cinco viviendas piloto (con sus valores sembrados).
import { expect, loginViaUi, pickHome, registerViaUi, test } from "../support/test";

async function completeOnboarding(page: import("@playwright/test").Page, name: string, province = "Santo Domingo", distributor = "EDESUR") {
  await page.getByRole("button", { name: "Empezar" }).click();
  await page.getByLabel("Nombre de la vivienda").fill(name);
  await page.getByLabel("Provincia").fill(province);
  await page.getByLabel("Municipio").fill("Santo Domingo Este");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await page.getByLabel("Selecciona tu distribuidora").selectOption(distributor);
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await page.getByLabel("Tipo de usuario").fill("Residencial");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await page.getByLabel("Ocupantes").fill("4");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await page.getByLabel("Número de cuenta").fill("1234567890");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await page.getByLabel("Meta de consumo mensual (kWh)").fill("300");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(page.getByText(`${name} · ${province}, Santo Domingo Este · ${distributor}`)).toBeVisible();
  await page.getByRole("button", { name: "Ir al panel" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("onboarding y viviendas propias", () => {
  test("@smoke una cuenta nueva no ve viviendas del piloto; el onboarding de 6 etapas crea la vivienda y entra al panel", async ({ page }) => {
    await registerViaUi(page);
    await expect(page.getByText(/Las viviendas del piloto no se asignan al registrarte/)).toBeVisible();
    await expect(page.getByText("Vivienda piloto")).toHaveCount(0);
    await expect(page.getByText("Configura tu vivienda")).toBeVisible();
    await completeOnboarding(page, "Casa Onboarding");
    await expect(page.getByRole("main").getByText("Casa Onboarding · EDESUR", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Cargando/)).toHaveCount(0);
    // Panel de una vivienda sin facturas: invita a registrar la primera, sin inventar cifras.
    await expect(page.getByRole("link", { name: /Registrar factura/ }).first()).toBeVisible();
    await expect(page.getByText(/Próxima factura estimada/)).toHaveCount(0);
  });

  test("los datos del onboarding quedan guardados (perfil, contrato y meta)", async ({ page }) => {
    await registerViaUi(page);
    await completeOnboarding(page, "Casa Perfil", "Santiago", "EDENORTE");
    await page.getByRole("link", { name: "Perfil" }).first().click();
    await page.waitForURL("**/profile");
    await expect(page.getByLabel("Nombre de la vivienda")).toHaveValue("Casa Perfil");
    await expect(page.getByLabel("Provincia")).toHaveValue("Santiago");
    await expect(page.getByLabel("Ocupantes")).toHaveValue("4");
    await page.getByRole("link", { name: "Meta" }).first().click();
    await page.waitForURL("**/goal");
    await expect(page.getByLabel("Meta de consumo mensual (kWh)")).toHaveValue("300.00");
  });

  test("crear una segunda vivienda y alternar entre ambas", async ({ page }) => {
    await registerViaUi(page);
    await completeOnboarding(page, "Casa Uno");
    await page.getByRole("link", { name: /Mis viviendas|Cambiar vivienda/ }).first().click();
    await page.waitForURL("**/homes");
    await page.getByRole("button", { name: "Añadir vivienda" }).click();
    await completeOnboarding(page, "Casa Dos", "La Altagracia", "EDEESTE");
    await expect(page.getByRole("main").getByText("Casa Dos · EDEESTE", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: /Mis viviendas|Cambiar vivienda/ }).first().click();
    await page.waitForURL("**/homes");
    await expect(page.getByRole("button", { name: /Casa Uno · EDESUR/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Casa Dos · EDEESTE/ })).toBeVisible();
    await pickHome(page, /Casa Uno/);
    await expect(page.getByRole("main").getByText("Casa Uno · EDESUR", { exact: true })).toBeVisible();
  });

  test("el onboarding valida los campos obligatorios antes de avanzar", async ({ page }) => {
    await registerViaUi(page);
    await page.getByRole("button", { name: "Empezar" }).click();
    await page.getByRole("button", { name: "Guardar y continuar" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByText("Etapa 1 de 6")).toBeVisible();             // no avanzó
  });
});

// Valores sembrados de las 5 viviendas piloto (docs/DEMO_GUIDE.md): proyección de la próxima factura y variación.
const PILOTS: Array<[number, string, string, string, string]> = [
  [1, "EDESUR", "486.67 kWh", "+15.87%", "Crítica"],
  [2, "EDENORTE", "315 kWh", "0.00%", ""],
  [3, "EDEESTE", "270 kWh", "+20.00%", ""],
  [4, "Otra", "366.67 kWh", "−10.57%", ""],
  [5, "EDESUR", "260 kWh", "+8.33%", ""],
];

test.describe("acceso a las cinco viviendas piloto", () => {
  test("la cuenta de pruebas ve exactamente las cinco y cada una muestra sus valores", async ({ page, run }) => {
    await loginViaUi(page, { email: run.pilot_email, password: run.pilot_password });
    await expect(page.getByText(/^Cargando/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Vivienda piloto 0\d \(demo\) · / })).toHaveCount(5);
    for (const [n, distributor, projected, delta, severity] of PILOTS) {
      await pickHome(page, new RegExp(`Vivienda piloto 0${n}`));
      await expect(page.getByRole("main").getByText(`Vivienda piloto 0${n} (demo) · ${distributor}`, { exact: true })).toBeVisible();
      await expect(page.getByText("Datos de demostración")).toBeVisible();   // los datos demo se rotulan como tal
      await expect(page.getByRole("main").getByText(projected, { exact: true }).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByText("PROYECTADO").first()).toBeVisible();      // lo proyectado nunca se presenta como real
      await expect(page.getByRole("main").getByText(delta, { exact: true }).filter({ visible: true }).first()).toBeVisible();
      if (severity) await expect(page.getByText(severity, { exact: true }).first()).toBeVisible();
      else await expect(page.getByText("Crítica", { exact: true })).toHaveCount(0);
      await page.getByRole("link", { name: /Mis viviendas|Cambiar vivienda/ }).first().click();
      await page.waitForURL("**/homes");
    }
  });

  test("una persona sin acceso a las viviendas piloto no las ve ni por el BFF", async ({ page, context, run }) => {
    await registerViaUi(page);
    const response = await context.request.get("/api/bff/homes?limit=100&offset=0");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);
    const pilot = Object.values(run.pilot_homes)[0];
    for (const path of [`homes/${pilot}/dashboard`, `homes/${pilot}/bills`, `homes/${pilot}/equipment`]) {
      const denied = await context.request.get(`/api/bff/${path}`);
      expect([403, 404], path).toContain(denied.status());
    }
  });
});
