// ERD-SCORE-01: el Energy Score lo calcula el backend; la web solo lo muestra, con sus componentes y sin inventar datos.
import { addBill, bff, createHomeViaApi, expect, freshHome, loaded, openSection, registerViaApi, test } from "../support/test";

type Score = { score: number | null; status: string; coverage_pct: number; components: Array<{ key: string; score: number | null; inputs: Record<string, string> }> };
const AC = { name: "Aire sala", room: "Sala", kind: "air_conditioner", power_w: "1500", hours_per_day: "6" };

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
async function monthlyBills(page: Parameters<typeof addBill>[0], homeId: string, kwh = "300") {
  for (const n of [3, 2, 1, 0]) {
    const end = 20 + 30 * n;
    await addBill(page, homeId, iso(end + 29), iso(end), kwh, "3900", 30);
  }
}
const component = (score: Score, key: string) => score.components.find((c) => c.key === key)!;

test.describe("Energy Score", () => {
  test("una vivienda sin datos no tiene puntaje y lo explica; no dibuja ningún gauge", async ({ page, context }) => {
    const { homeId } = await freshHome(page, context, "Casa Sin Score");
    const api = await bff<Score>(page, `homes/${homeId}/energy-score`);
    expect(api.status).toBe(200);
    expect(api.body).toMatchObject({ score: null, status: "insufficient_data", coverage_pct: 0 });
    await openSection(page, "Inicio", "/dashboard");
    await loaded(page);
    await expect(page.getByTestId("energy-score")).toContainText("Sin puntaje todavía");
    await expect(page.getByRole("meter")).toHaveCount(0);
  });

  test("con facturas, equipo y meta el panel muestra el mismo puntaje que la API, con sus cuatro componentes", async ({ page, context }) => {
    const { homeId } = await freshHome(page, context, "Casa Con Score");
    await monthlyBills(page, homeId);
    expect((await bff(page, `homes/${homeId}/equipment`, "POST", AC)).status).toBe(201);
    expect((await bff(page, `homes/${homeId}/goal`, "PUT", { monthly_kwh: "400" })).status).toBe(200);
    const api = (await bff<Score>(page, `homes/${homeId}/energy-score`)).body;
    expect(api.status).toBe("ok");
    expect(api.score).toBeGreaterThan(0);

    await openSection(page, "Facturas", "/bills");      // los datos se crearon por API: salir y volver monta el panel de nuevo
    await openSection(page, "Inicio", "/dashboard");
    await loaded(page);
    const card = page.getByTestId("energy-score");
    await expect(card.getByRole("meter", { name: "Energy Score" })).toHaveAttribute("aria-valuenow", String(api.score));
    await expect(card.locator('[data-quality="INFERRED"]')).toBeVisible();
    for (const [key, label] of [["consumption", "Consumo"], ["efficiency", "Eficiencia"], ["habits", "Hábitos"], ["consistency", "Consistencia"]] as const) {
      const row = card.getByTestId(`score-${key}`);
      await expect(row).toContainText(label);
      const value = component(api, key).score;
      await expect(row).toContainText(value === null ? "Sin datos" : String(value));
    }
    // Sin lecturas, Hábitos solo mira la factura reciente; nada se rellena con ceros.
    await expect(card.getByRole("link", { name: /Ver cómo mejorarlo en Ahorro/ })).toBeVisible();
  });

  test("aplicar una recomendación mejora Eficiencia y cambiar la meta mueve Consumo", async ({ page, context }) => {
    const { homeId } = await freshHome(page, context, "Casa Mejora");
    await monthlyBills(page, homeId);
    await bff(page, `homes/${homeId}/equipment`, "POST", AC);
    await bff(page, `homes/${homeId}/goal`, "PUT", { monthly_kwh: "250" });
    const before = (await bff<Score>(page, `homes/${homeId}/energy-score`)).body;

    await openSection(page, "Ahorro", "/savings");
    await loaded(page);
    await page.getByRole("button", { name: /Ya la apliqué/ }).click();
    await expect(page.getByRole("list", { name: "Recomendaciones vigentes" })).not.toContainText("aire acondicionado");   // queda la de la meta

    await openSection(page, "Inicio", "/dashboard");
    await loaded(page);
    const after = (await bff<Score>(page, `homes/${homeId}/energy-score`)).body;
    expect(component(after, "efficiency").score!).toBeGreaterThan(component(before, "efficiency").score!);
    expect(component(after, "efficiency").inputs.potential_savings_kwh).toBe("0.00");
    await expect(page.getByTestId("score-efficiency")).toContainText("100");

    await bff(page, `homes/${homeId}/goal`, "PUT", { monthly_kwh: "900" });
    expect(component((await bff<Score>(page, `homes/${homeId}/energy-score`)).body, "consumption").score).toBe(100);
  });

  test("otra persona no puede leer el puntaje y nadie puede escribirlo", async ({ page, context, browser }) => {
    const { homeId } = await freshHome(page, context, "Casa Privada Score");
    await monthlyBills(page, homeId);
    const otherContext = await browser.newContext();
    try {
      const other = await otherContext.newPage();
      await registerViaApi(otherContext);
      await createHomeViaApi(other, "Casa Ajena");
      expect([403, 404]).toContain((await bff(other, `homes/${homeId}/energy-score`)).status);
    } finally {
      await otherContext.close();
    }
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect((await bff(page, `homes/${homeId}/energy-score`, method, {})).status, method).toBe(404);
    }
    expect((await bff<Score>(page, `homes/${homeId}/energy-score`)).status).toBe(200);
  });
});
