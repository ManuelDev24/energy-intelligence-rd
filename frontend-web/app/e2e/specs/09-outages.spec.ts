// ERD-INT-01: registro manual de apagones, historial y resumen mensual contra la API y la base reales.
import { bff, createHomeViaApi, expect, freshHome, loaded, openSection, registerViaApi, test } from "../support/test";

type Outage = { id: string; ongoing: boolean; duration_minutes: number | null };
type Summary = { months: Array<{ month: string; count: number; total_minutes: number; longest_minutes: number }>; totals: { count: number; total_minutes: number } };
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Fecha de RD (UTC−4 fijo) de hoy menos `days` días: AAAA-MM-DD. */
const rdDate = (days: number) => new Date(Date.now() - 4 * 3_600_000 - days * 86_400_000).toISOString().slice(0, 10);
const monthLabel = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;

async function fillOutage(page: import("@playwright/test").Page, start: [string, string], end: [string, string] | null, opts: { cause?: string; note?: string } = {}) {
  await page.getByLabel("Día en que se fue la luz").fill(start[0]);
  await page.getByLabel("Hora en que se fue", { exact: true }).fill(start[1]);
  const ongoing = page.getByLabel("Todavía sin luz");
  if (end === null) await ongoing.check();
  else {
    await ongoing.uncheck();
    await page.getByLabel("Día en que volvió").fill(end[0]);
    await page.getByLabel("Hora en que volvió", { exact: true }).fill(end[1]);
  }
  if (opts.cause) await page.getByLabel("Causa").selectOption(opts.cause);
  if (opts.note) await page.getByLabel("Nota (opcional)").fill(opts.note);
}

test.describe("apagones", () => {
  test("registrar un apagón lo agrega al historial con su duración y al resumen del mes", async ({ page, context }) => {
    await freshHome(page, context, "Casa Apagones");
    await openSection(page, "Apagones", "/outages");
    await loaded(page);
    await expect(page.getByText("Aún no hay apagones registrados")).toBeVisible();
    const day = rdDate(1);
    await fillOutage(page, [day, "10:00"], [day, "12:30"], { cause: "weather", note: "Tormenta fuerte" });
    await page.getByRole("button", { name: "Guardar apagón" }).click();
    await expect(page.getByText("Apagón guardado.")).toBeVisible();
    const item = page.getByTestId("outage");
    await expect(item).toHaveCount(1);
    await expect(item.getByTestId("outage-summary")).toHaveText("2 h 30 min · Clima o tormenta");
    await expect(item).toContainText("Tormenta fuerte");
    const row = page.getByTestId("outage-months").getByRole("row").filter({ hasText: monthLabel(day) });
    await expect(row).toContainText("2 h 30 min");
    await expect(page.getByTestId("outage-months").locator("caption")).toContainText("1 apagón, 2 h 30 min sin luz");
  });

  test("un apagón en curso se cierra con «Ya volvió la luz» y pasa a tener duración", async ({ page, context }) => {
    const { homeId } = await freshHome(page, context, "Casa En Curso");
    await openSection(page, "Apagones", "/outages");
    await loaded(page);
    const day = rdDate(1);
    await fillOutage(page, [day, "22:00"], null);
    await page.getByRole("button", { name: "Guardar apagón" }).click();
    const item = page.getByTestId("outage");
    await expect(item).toContainText("sigue sin luz");
    await expect(item.getByTestId("outage-summary")).toContainText("Todavía sin luz");
    await expect(page.getByTestId("outage-months")).toContainText("(sigue abierto)");
    await item.getByRole("button", { name: /Ya volvió la luz/ }).click();
    await expect(item.getByTestId("outage-summary")).not.toContainText("Todavía sin luz");
    await expect(item.getByRole("button", { name: /Ya volvió la luz/ })).toHaveCount(0);
    const list = (await bff<Outage[]>(page, `homes/${homeId}/outages`)).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ ongoing: false });
    expect(list[0].duration_minutes).toBeGreaterThan(60);
  });

  test("valida las fechas y rechaza un apagón que se solapa con otro sin duplicar nada", async ({ page, context }) => {
    const { homeId } = await freshHome(page, context, "Casa Solapes");
    await openSection(page, "Apagones", "/outages");
    await loaded(page);
    const day = rdDate(2);
    await fillOutage(page, [day, "10:00"], [day, "09:00"]);
    await page.getByRole("button", { name: "Guardar apagón" }).click();
    await expect(page.getByText("Debe ser después de la hora en que se fue.")).toBeVisible();
    await expect(page.getByLabel("Hora en que volvió", { exact: true })).toBeFocused();
    expect((await bff<Outage[]>(page, `homes/${homeId}/outages`)).body).toHaveLength(0);

    await fillOutage(page, [day, "10:00"], [day, "12:00"]);
    await page.getByRole("button", { name: "Guardar apagón" }).click();
    await expect(page.getByTestId("outage")).toHaveCount(1);
    await fillOutage(page, [day, "11:00"], [day, "13:00"]);
    await page.getByRole("button", { name: "Guardar apagón" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "se solapa con ese período" })).toBeVisible();
    expect((await bff<Outage[]>(page, `homes/${homeId}/outages`)).body).toHaveLength(1);
    // Justo a continuación sí se puede (el fin no cuenta como solape).
    await fillOutage(page, [day, "12:00"], [day, "13:00"]);
    await page.getByRole("button", { name: "Guardar apagón" }).click();
    await expect(page.getByTestId("outage")).toHaveCount(2);
  });

  test("editar corrige los datos y eliminar pide confirmación", async ({ page, context }) => {
    await freshHome(page, context, "Casa Edición");
    await openSection(page, "Apagones", "/outages");
    await loaded(page);
    const day = rdDate(1);
    await fillOutage(page, [day, "08:00"], [day, "09:00"]);
    await page.getByRole("button", { name: "Guardar apagón" }).click();
    await expect(page.getByTestId("outage")).toHaveCount(1);

    await page.getByRole("button", { name: /Editar el apagón/ }).click();
    const form = page.getByRole("form", { name: "Editar apagón" });
    await expect(form.getByLabel("Hora en que volvió", { exact: true })).toHaveValue("09:00");
    await form.getByLabel("Hora en que volvió", { exact: true }).fill("10:15");
    await form.getByLabel("Causa").selectOption("scheduled");
    await form.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByTestId("outage-summary")).toHaveText("2 h 15 min · Mantenimiento programado");

    await page.getByRole("button", { name: /Eliminar el apagón/ }).click();
    await page.getByRole("group", { name: /Confirmar eliminación/ }).getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByTestId("outage")).toHaveCount(1);
    await page.getByRole("button", { name: /Eliminar el apagón/ }).click();
    await page.getByRole("group", { name: /Confirmar eliminación/ }).getByRole("button", { name: "Sí, eliminar" }).click();
    await expect(page.getByTestId("outage")).toHaveCount(0);
    await expect(page.getByText("Aún no hay apagones registrados")).toBeVisible();
    await expect(page.getByTestId("outage-months").locator("caption")).toContainText("sin apagones registrados");
  });

  test("el resumen mensual agrupa por mes de inicio (hora de RD) y cuenta bien con varios apagones", async ({ page, context }) => {
    const { homeId } = await freshHome(page, context, "Casa Resumen");
    const day = rdDate(3);
    const iso = (d: string, time: string) => `${d}T${time}:00-04:00`;
    for (const [from, to] of [["08:00", "09:00"], ["13:00", "16:00"]] as const) {
      const r = await bff(page, `homes/${homeId}/outages`, "POST", { started_at: iso(day, from), ended_at: iso(day, to), cause: "utility_fault", note: null });
      expect(r.status).toBe(201);
    }
    const summary = (await bff<Summary>(page, `homes/${homeId}/outages/summary?months=3`)).body;
    expect(summary.months).toHaveLength(3);
    const current = summary.months.find((m) => m.month === day.slice(0, 7))!;
    expect(current).toMatchObject({ count: 2, total_minutes: 240, longest_minutes: 180 });
    expect(summary.totals).toMatchObject({ count: 2, total_minutes: 240 });
    await openSection(page, "Apagones", "/outages");
    await loaded(page);
    await expect(page.getByTestId("outage-months").getByRole("row").filter({ hasText: monthLabel(day) })).toContainText("4 h");
    await expect(page.getByTestId("outage")).toHaveCount(2);
  });

  test("otra persona no puede ver ni cambiar los apagones de una vivienda ajena", async ({ page, context, browser }) => {
    const { homeId } = await freshHome(page, context, "Casa Privada Apagones");
    const day = rdDate(1);
    const created = await bff<Outage>(page, `homes/${homeId}/outages`, "POST", { started_at: `${day}T08:00:00-04:00`, ended_at: `${day}T09:00:00-04:00`, cause: "unknown", note: null });
    expect(created.status).toBe(201);
    const otherContext = await browser.newContext();
    try {
      const other = await otherContext.newPage();
      await registerViaApi(otherContext);
      const mine = await createHomeViaApi(other, "Mi casa");
      const body = { started_at: `${day}T10:00:00-04:00`, ended_at: `${day}T11:00:00-04:00`, cause: "unknown", note: null };
      for (const [path, method, payload] of [
        [`homes/${homeId}/outages`, "GET", undefined], [`homes/${homeId}/outages/summary`, "GET", undefined], [`homes/${homeId}/outages`, "POST", body],
        [`homes/${homeId}/outages/${created.body.id}`, "PUT", body], [`homes/${homeId}/outages/${created.body.id}`, "DELETE", {}],
        [`homes/${mine}/outages/${created.body.id}`, "GET", undefined],   // un id ajeno bajo mi propia vivienda tampoco aparece
      ] as const) {
        expect([403, 404], `${method} ${path}`).toContain((await bff(other, path, method, payload)).status);
      }
    } finally {
      await otherContext.close();
    }
    expect((await bff<Outage[]>(page, `homes/${homeId}/outages`)).body).toHaveLength(1);
  });
});
