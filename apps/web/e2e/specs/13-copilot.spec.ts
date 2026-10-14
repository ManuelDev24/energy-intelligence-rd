// ERD-AI-CHAT: Energy Copilot contra PostgreSQL + API + web reales, con el proveedor determinista de la API (COPILOT_PROVIDER=fake,
// sin red). Cubre acciones rápidas, streaming, fuentes con calidad, Markdown seguro, cancelación, valoraciones, gestión y privacidad.
import { addBill, bff, expect, freshHome, loaded, openSection, registerViaApi, test } from "../support/test";
import { axeProblems } from "../support/axe";


type Conversation = { id: string; title: string };

test.describe("Energy Copilot", () => {
  test("una acción rápida responde con datos reales, fuentes y calidad, y queda en el historial", async ({ page, context }) => {
    const { homeId } = await freshHome(page, context, "Casa Copilot");
    await addBill(page, homeId, "2026-08-01", "2026-08-31", "320", "4100.50", 31);
    const [bill] = (await bff<Array<{ id: string }>>(page, `homes/${homeId}/bills`)).body;
    await openSection(page, "Copilot", "/copilot");
    await loaded(page);
    await expect(page.getByTestId("copilot-usage")).toHaveText("Hoy: 0 de 40 preguntas.");

    await page.getByRole("group", { name: "Preguntas rápidas" }).getByRole("button", { name: "Analiza mi factura" }).click();
    const messages = page.getByRole("list", { name: "Mensajes" });
    const answer = messages.getByRole("listitem").filter({ hasText: "Copilot" }).last();
    await expect(answer).toContainText("Tienes 1 facturas registradas.", { timeout: 15_000 });
    await expect(answer.locator("strong", { hasText: "1" })).toBeVisible();
    await answer.getByText("Fuentes consultadas (1)").click();
    const source = answer.getByRole("link", { name: "Factura 01/08/2026–31/08/2026" });
    await expect(source).toHaveAttribute("href", `/bills/${bill.id}`);
    await expect(answer.locator('[data-quality="REAL"]')).toBeVisible();
    await answer.getByRole("button", { name: "Útil", exact: true }).click();
    await expect(answer.getByRole("button", { name: "Útil", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("copilot-usage")).toHaveText("Hoy: 1 de 40 preguntas.");

    // Con una respuesta a la vista (fuentes desplegadas, valoración marcada, acciones rápidas): sin violaciones de axe ni desborde.
    for (const [width, height] of [[360, 740], [768, 1024], [1280, 800]] as const) {
      await page.setViewportSize({ width, height });
      const found = await axeProblems(page, `copilot@${width}`);
      expect(found, found.join("\n")).toEqual([]);
    }

    // La conversación queda guardada con la pregunta como título.
    await expect(page.getByRole("navigation", { name: "Conversaciones" }).getByRole("button", { name: /^Analiza mi última factura/ })).toBeVisible();
    const conversations = (await bff<Conversation[]>(page, `homes/${homeId}/copilot/conversations`)).body;
    expect(conversations).toHaveLength(1);
    expect(conversations[0].title).toMatch(/^Analiza mi última factura/);
  });

  test("Markdown seguro: solo enlaces internos; detener conserva lo recibido y se puede reintentar", async ({ page, context }) => {
    const { homeId } = await freshHome(page, context, "Casa Enlaces");
    await addBill(page, homeId, "2026-08-01", "2026-08-31", "200", "2500", 31);
    await openSection(page, "Copilot", "/copilot");
    await loaded(page);
    await page.getByLabel("Tu pregunta").fill("¿Cuántas facturas tengo? [enlace]");
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    const answer = page.getByRole("list", { name: "Mensajes" }).getByRole("listitem").filter({ hasText: "Copilot" }).last();
    await expect(answer).toContainText("este sitio", { timeout: 15_000 });
    await expect(answer.getByRole("link", { name: "tus facturas" })).toHaveAttribute("href", "/bills");
    await expect(answer.getByRole("link", { name: "este sitio" })).toHaveCount(0);

    await page.getByLabel("Tu pregunta").fill("¿Cuánto pagaré? [lento]");
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Detener respuesta" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Respuesta en curso" })).toContainText("Según tus datos", { timeout: 15_000 });
    await page.getByRole("button", { name: "Detener respuesta" }).click();
    await expect(page.getByText("Respuesta cancelada.").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();
  });

  test("renombrar y borrar con confirmación; otra cuenta no ve ni usa las conversaciones", async ({ page, context, browser }) => {
    const { homeId } = await freshHome(page, context, "Casa Privada");
    const created = await bff<Conversation>(page, `homes/${homeId}/copilot/conversations`, "POST", { title: "Plan de ahorro" });
    expect(created.status).toBe(201);
    await openSection(page, "Copilot", "/copilot");
    await loaded(page);
    await page.getByRole("button", { name: "Renombrar «Plan de ahorro»" }).click();
    await page.getByLabel("Nuevo título").fill("Ahorro de octubre");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByRole("button", { name: "Ahorro de octubre", exact: true })).toBeVisible();

    const other = await browser.newContext({ baseURL: new URL(page.url()).origin });
    try {
      await registerViaApi(other);
      const stranger = await other.newPage();
      await stranger.goto("/homes");
      expect((await bff(stranger, `homes/${homeId}/copilot/conversations`)).status).toBe(404);
      expect((await bff(stranger, `homes/${homeId}/copilot/conversations/${created.body.id}/messages`)).status).toBe(404);
      expect((await bff(stranger, `homes/${homeId}/copilot/conversations/${created.body.id}/messages`, "POST", { content: "hola" })).status).toBe(404);
    } finally {
      await other.close();
    }

    await page.getByRole("button", { name: "Borrar «Ahorro de octubre»" }).click();
    const dialog = page.getByRole("dialog", { name: "Borrar conversación" });
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("button", { name: "Ahorro de octubre", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Borrar «Ahorro de octubre»" }).click();
    await dialog.getByRole("button", { name: "Borrar" }).click();
    await expect(page.getByText("Aún no tienes conversaciones.")).toBeVisible();
  });
});
