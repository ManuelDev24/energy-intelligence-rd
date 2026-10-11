// ERD-SAVE-01: recomendaciones de ahorro explicables, estimadas, idempotentes y privadas.
import { addBill, bff, expect, freshHome, loaded, openSection, registerViaApi, test } from "../support/test";

const AC = { name: "Aire sala", room: "Sala", kind: "air_conditioner", power_w: "1500", hours_per_day: "6" };
type Reco = { id: string; rule_id: string; status: string; savings_kwh_month: string | null };
type RecoList = { items: Reco[] };

test.describe("recomendaciones de ahorro", () => {
  test("declarar un aire acondicionado genera una recomendación estimada que se explica, se aplica y se reactiva", async ({ page, context }) => {
    const { homeId } = await freshHome(page, context, "Casa Ahorro");
    await addBill(page, homeId, "2026-07-01", "2026-07-30", "300", "3900", 30);
    await openSection(page, "Equipos", "/equipment");
    await loaded(page);
    await page.getByRole("button", { name: "Agregar equipo" }).click();
    await page.getByLabel("Nombre", { exact: true }).fill(AC.name);
    await page.getByLabel("Tipo de equipo").selectOption(AC.kind);
    await page.getByLabel("Potencia (W)").fill(AC.power_w);
    await page.getByLabel("Horas de uso por día").fill(AC.hours_per_day);
    await page.getByRole("button", { name: "Guardar equipo" }).click();
    await expect(page.getByRole("article").filter({ hasText: AC.name })).toBeVisible();

    await openSection(page, "Ahorro", "/savings");
    await loaded(page);
    const item = page.getByTestId("recommendation").filter({ hasText: "Una hora menos de aire acondicionado" });
    await expect(item).toBeVisible();
    await expect(item.getByTestId("recommendation-savings")).toContainText("≈ 45 kWh al mes");
    await expect(item.getByTestId("recommendation-savings")).toContainText("≈ RD$ 585.00 al mes");   // precio medio 13,00 RD$/kWh
    await expect(item.locator('[data-quality="ESTIMATED"]')).toBeVisible();
    await expect(page.getByTestId("savings-total")).toContainText("≈ 45 kWh al mes");

    // Explicación a un clic: supuestos y regla versionada.
    await item.getByText("¿Por qué se recomienda?").click();
    await expect(item.getByText(/potencia nominal declarada/)).toBeVisible();
    await expect(item.getByText("Regla: ac-one-hour v1")).toBeVisible();

    // Aplicarla la saca de las vigentes y la deja en «Aplicadas y descartadas».
    await item.getByRole("button", { name: /Marcar como aplicada/ }).click();
    await expect(page.getByText("Sin recomendaciones por ahora")).toBeVisible();
    await page.getByText(/Aplicadas y descartadas \(1\)/).click();
    await page.getByRole("button", { name: /Volver a activar/ }).click();
    await expect(page.getByTestId("savings-total")).toContainText("≈ 45 kWh al mes");
    await expect(page.getByText("Sin recomendaciones por ahora")).toHaveCount(0);
  });

  test("cambiar o quitar el equipo actualiza la misma recomendación y recalcular no la duplica", async ({ page, context }) => {
    const { homeId } = await freshHome(page, context, "Casa Cambios");
    const created = await bff<{ id: string }>(page, `homes/${homeId}/equipment`, "POST", AC);
    expect(created.status).toBe(201);
    const first = (await bff<RecoList>(page, `homes/${homeId}/recommendations`)).body.items;
    expect(first).toHaveLength(1);
    for (let i = 0; i < 3; i++) expect((await bff(page, `homes/${homeId}/recommendations/refresh`, "POST", {})).status).toBe(200);
    const again = (await bff<RecoList>(page, `homes/${homeId}/recommendations`)).body.items;
    expect(again.map((r) => r.id)).toEqual(first.map((r) => r.id));

    expect((await bff(page, `homes/${homeId}/equipment/${created.body.id}`, "PUT", { ...AC, power_w: "2000", hours_per_day: "8" })).status).toBe(200);
    const updated = (await bff<RecoList>(page, `homes/${homeId}/recommendations`)).body.items;
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ id: first[0].id, savings_kwh_month: "60.00" });

    await openSection(page, "Ahorro", "/savings");
    await expect(page.getByTestId("recommendation-savings")).toContainText("≈ 60 kWh al mes");

    expect((await bff(page, `homes/${homeId}/equipment/${created.body.id}`, "DELETE")).status).toBe(204);
    expect((await bff<RecoList>(page, `homes/${homeId}/recommendations`)).body.items).toHaveLength(0);
    const resolved = (await bff<RecoList>(page, `homes/${homeId}/recommendations?status=resolved`)).body.items;
    expect(resolved.map((r) => r.id)).toEqual([first[0].id]);
  });

  test("lo descartado no reaparece aunque cambie el equipo", async ({ page, context }) => {
    const { homeId } = await freshHome(page, context, "Casa Descarte");
    const created = await bff<{ id: string }>(page, `homes/${homeId}/equipment`, "POST", AC);
    const [rec] = (await bff<RecoList>(page, `homes/${homeId}/recommendations`)).body.items;
    expect((await bff(page, `homes/${homeId}/recommendations/${rec.id}`, "PATCH", { status: "dismissed" })).status).toBe(200);
    await bff(page, `homes/${homeId}/equipment/${created.body.id}`, "PUT", { ...AC, power_w: "1800" });
    await bff(page, `homes/${homeId}/recommendations/refresh`, "POST", {});
    expect((await bff<RecoList>(page, `homes/${homeId}/recommendations`)).body.items).toHaveLength(0);
    const dismissed = (await bff<RecoList>(page, `homes/${homeId}/recommendations?status=dismissed`)).body.items;
    expect(dismissed).toEqual([expect.objectContaining({ id: rec.id, savings_kwh_month: "45.00" })]);   // congelada: no se recalcula
  });

  test("sin equipos, con una factura, pide declararlos; sin datos no inventa nada", async ({ page, context }) => {
    const { homeId } = await freshHome(page, context, "Casa Vacía Ahorro");
    await openSection(page, "Ahorro", "/savings");
    await expect(page.getByText("Sin recomendaciones por ahora")).toBeVisible();
    await addBill(page, homeId, "2026-07-01", "2026-07-30", "300", "3900", 30);
    await openSection(page, "Inicio", "/dashboard");
    await openSection(page, "Ahorro", "/savings");
    await expect(page.getByTestId("recommendation").filter({ hasText: "Declara tus equipos" })).toBeVisible();
    await expect(page.getByTestId("savings-total")).toHaveCount(0);
  });

  test("otra persona no puede leer, recalcular ni cambiar las recomendaciones", async ({ page, context, browser }) => {
    const { homeId } = await freshHome(page, context, "Casa Privada");
    await bff(page, `homes/${homeId}/equipment`, "POST", AC);
    const [rec] = (await bff<RecoList>(page, `homes/${homeId}/recommendations`)).body.items;
    const otherContext = await browser.newContext();
    try {
      const other = await otherContext.newPage();
      await registerViaApi(otherContext);
      for (const [path, method, body] of [
        [`homes/${homeId}/recommendations`, "GET", undefined],
        [`homes/${homeId}/recommendations/refresh`, "POST", {}],
        [`homes/${homeId}/recommendations/${rec.id}`, "PATCH", { status: "dismissed" }],
      ] as const) {
        expect([403, 404], `${method} ${path}`).toContain((await bff(other, path, method, body)).status);
      }
    } finally {
      await otherContext.close();
    }
    expect((await bff<RecoList>(page, `homes/${homeId}/recommendations`)).body.items.map((r) => r.status)).toEqual(["active"]);
  });
});
