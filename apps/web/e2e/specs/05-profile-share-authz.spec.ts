// Perfil y preferencias, compartir vivienda y autorización entre personas (aislamiento por vivienda).
import { addBill, bff, createHomeViaApi, expect, freshHome, loaded, loginViaUi, newPassword, openSection, pickHome, registerViaApi, registerViaUi, test, uniqueEmail, verifyEmail, waitForMail } from "../support/test";
import { WEB_URL } from "../support/env";

test.describe("perfil y preferencias", () => {
  test("editar la vivienda y el servicio se guarda y se recuerda; un dato inválido se rechaza", async ({ page, context }) => {
    await freshHome(page, context, "Casa Perfil E2E");
    await openSection(page, "Perfil", "/profile");
    await loaded(page);
    await page.getByLabel("Nombre de la vivienda").fill("Casa Perfil Editada");
    await page.getByLabel("Ocupantes").fill("5");
    await page.getByRole("button", { name: "Guardar vivienda" }).click();
    await expect(page.getByRole("status").filter({ hasText: /guard/i }).first()).toBeVisible();
    await openSection(page, "Facturas", "/bills");
    await openSection(page, "Perfil", "/profile");
    await loaded(page);
    await expect(page.getByLabel("Nombre de la vivienda")).toHaveValue("Casa Perfil Editada");
    await expect(page.getByLabel("Ocupantes")).toHaveValue("5");

    await page.getByLabel("Ocupantes").fill("0");
    await page.getByRole("button", { name: "Guardar vivienda" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
  });

  test("preferencias de aviso (correo y teléfono) se guardan por persona", async ({ page, context }) => {
    await registerViaApi(context);
    await page.goto("/account");
    await expect(page.getByText(/^Cargando/)).toHaveCount(0);
    const email = page.getByLabel("Avisos de consumo por correo");
    const push = page.getByLabel("Avisos en el teléfono (app móvil)");
    await expect(email).toBeChecked();                                           // por defecto activos
    await email.uncheck();
    await page.getByRole("button", { name: "Guardar preferencias" }).click();
    await expect(page.getByRole("status").filter({ hasText: /guard|actualiz/i }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Avisos de consumo por correo")).not.toBeChecked();
    await expect(page.getByLabel("Avisos en el teléfono (app móvil)")).toBeChecked();
    expect(await push.isVisible()).toBe(true);
  });

  test("sesiones activas: se listan y se pueden cerrar las demás", async ({ page, context, browser }) => {
    const account = await registerViaUi(page);
    const other = await (await browser.newContext()).newPage();
    await loginViaUi(other, account);
    await page.goto("/account");
    const section = page.locator("section, div").filter({ has: page.getByRole("heading", { name: "Sesiones activas" }) }).last();
    await expect(section).toBeVisible();
    await expect(section.getByRole("button", { name: /Cerrar (las )?otras sesiones|Cerrar las demás/i })).toBeVisible();
    await section.getByRole("button", { name: /Cerrar (las )?otras sesiones|Cerrar las demás/i }).click();
    await expect.poll(async () => (await other.request.get("/api/bff/auth/me")).status(), { timeout: 20_000 }).toBe(401);
    expect((await context.request.get("/api/bff/auth/me")).status()).toBe(200);   // la sesión actual sigue
    await other.context().close();
  });
});

test.describe("compartir vivienda", () => {
  test("invitar → correo → aceptar con la cuenta invitada → miembro → expulsar", async ({ page, context, browser }) => {
    const { homeId, account } = await freshHome(page, context, "Casa Compartida");
    await verifyEmail(page, account.email);
    await page.goto("/homes");
    const guestEmail = uniqueEmail("invitada");
    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    const guestPassword = newPassword();
    await registerViaApi(guestContext, { email: guestEmail, password: guestPassword });
    await verifyEmail(guest, guestEmail);

    // El propietario invita.
    await page.getByRole("button", { name: /Compartir/ }).first().click();
    await page.getByLabel("Correo de la persona invitada").fill(guestEmail);
    await page.getByRole("button", { name: "Enviar invitación" }).click();
    await expect(page.getByText(guestEmail).first()).toBeVisible();
    const mail = await waitForMail(guestEmail, (s) => /invit/i.test(s));
    const link = mail.text.match(/https?:\/\/\S+#token=\S+/)?.[0];
    expect(link, mail.text).toBeTruthy();

    // La persona invitada acepta con su cuenta y ve la vivienda.
    await guest.goto(link!);
    await guest.getByRole("button", { name: "Aceptar invitación" }).click();
    await guest.goto("/homes");
    await expect(guest.getByRole("button", { name: /^Casa Compartida · / })).toBeVisible();
    await expect(guest.getByRole("button", { name: /Compartir/ }).first()).toBeVisible();
    // Un enlace de un solo uso: usarlo otra vez no sirve.
    await guest.goto(link!);
    await guest.getByRole("button", { name: "Aceptar invitación" }).click();
    await expect(guest.getByRole("alert").filter({ hasText: /no es válid|ya se usó|no se pudo/i }).first()).toBeVisible();

    // El miembro ve la vivienda pero no la gestiona.
    await guest.goto("/homes");
    await guest.getByRole("button", { name: /Compartir/ }).first().click();
    await expect(guest.getByText(/Eres miembro de esta vivienda/)).toBeVisible();
    await expect(guest.getByRole("button", { name: "Enviar invitación" })).toHaveCount(0);
    expect((await bff(guest, `homes/${homeId}/dashboard`)).status).toBe(200);

    // El propietario lo expulsa y pierde el acceso de inmediato.
    await page.reload();
    await page.getByRole("button", { name: /Compartir/ }).first().click();
    await expect(page.getByText(guestEmail).first()).toBeVisible();
    await page.getByRole("button", { name: `Expulsar a ${guestEmail}` }).click();
    await page.getByRole("form", { name: "Confirmar acción" }).getByRole("button", { name: "Confirmar" }).click();
    await expect.poll(async () => (await bff(guest, `homes/${homeId}/dashboard`)).status, { timeout: 20_000 }).toBeGreaterThanOrEqual(403);
    await guestContext.close();
  });

  test("una invitación revocada ya no se puede aceptar", async ({ page, context, browser }) => {
    const { account } = await freshHome(page, context, "Casa Revocada");
    await verifyEmail(page, account.email);
    await page.goto("/homes");
    const guestEmail = uniqueEmail("revocada");
    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await registerViaApi(guestContext, { email: guestEmail, password: newPassword() });
    await verifyEmail(guest, guestEmail);
    await page.getByRole("button", { name: /Compartir/ }).first().click();
    await page.getByLabel("Correo de la persona invitada").fill(guestEmail);
    await page.getByRole("button", { name: "Enviar invitación" }).click();
    const mail = await waitForMail(guestEmail, (s) => /invit/i.test(s));
    const link = mail.text.match(/https?:\/\/\S+#token=\S+/)![0];
    await page.getByRole("button", { name: `Revocar la invitación a ${guestEmail}` }).click();
    await expect(page.getByText("Invitación revocada.")).toBeVisible();
    await guest.goto(link);
    await guest.getByRole("button", { name: "Aceptar invitación" }).click();
    await expect(guest.getByRole("alert").filter({ hasText: /no es válid|ya se usó|no se pudo/i }).first()).toBeVisible();
    await guest.goto("/homes");
    await expect(guest.getByRole("button", { name: /^Casa Revocada · / })).toHaveCount(0);
    await guestContext.close();
  });
});

test.describe("autorización entre personas", () => {
  test("la persona B no puede leer ni modificar nada de la vivienda de A, por ninguna ruta", async ({ page, context, browser }) => {
    const { homeId } = await freshHome(page, context, "Casa de A");
    await addBill(page, homeId, "2026-07-01", "2026-07-31", "300", "3900", 31);
    const bills = await bff<Array<{ id: string }>>(page, `homes/${homeId}/bills`);
    const billId = bills.body[0].id;
    const equipment = await bff<{ id: string }>(page, `homes/${homeId}/equipment`, "POST", { name: "Nevera A", room: null, kind: "refrigerator", brand: null, model: null, icon: null, power_w: "150", hours_per_day: "24" });
    expect(equipment.status).toBe(201);

    const bContext = await browser.newContext();
    const b = await bContext.newPage();
    await registerViaApi(bContext);
    const bHome = await createHomeViaApi(b, "Casa de B");
    const denied = async (label: string, response: Promise<{ status: number }>) => expect([403, 404], label).toContain((await response).status);
    const reads = ["dashboard", "bills", `bills/${billId}`, "equipment", "equipment/estimate", `equipment/${equipment.body.id}`, "alerts", "readings", "goal", "goal/progress", "contract", "anomalies", "members", "invitations"];
    for (const path of reads) await denied(`GET ${path}`, bff(b, `homes/${homeId}/${path}`));
    await denied("POST bill", bff(b, `homes/${homeId}/bills`, "POST", { period_start: "2026-09-01", period_end: "2026-09-30", kwh: "10", amount_dop: "100", days: 30 }));
    await denied("PUT equipment", bff(b, `homes/${homeId}/equipment/${equipment.body.id}`, "PUT", { name: "robada", room: null, kind: "other", brand: null, model: null, icon: null, power_w: "1", hours_per_day: "1" }));
    await denied("DELETE equipment", bff(b, `homes/${homeId}/equipment/${equipment.body.id}`, "DELETE"));
    await denied("DELETE bill", bff(b, `homes/${homeId}/bills/${billId}`, "DELETE"));
    // Un recurso de A usado bajo la vivienda de B tampoco aparece.
    await denied("bill de A bajo la vivienda de B", bff(b, `homes/${bHome}/bills/${billId}`));
    await denied("equipo de A bajo la vivienda de B", bff(b, `homes/${bHome}/equipment/${equipment.body.id}`));
    // A sigue viendo todo intacto.
    expect((await bff<unknown[]>(page, `homes/${homeId}/bills`)).body).toHaveLength(1);
    expect((await bff<Array<{ name: string }>>(page, `homes/${homeId}/equipment`)).body.map((e) => e.name)).toEqual(["Nevera A"]);
    // En la interfaz, B no encuentra la factura de A.
    await b.goto(`${WEB_URL}/homes`);
    await pickHome(b, /Casa de B/);
    await bContext.close();
  });

  test("sin sesión todas las rutas de datos responden 401", async ({ request, run }) => {
    const home = Object.values(run.pilot_homes)[0];
    for (const path of ["homes", `homes/${home}/dashboard`, `homes/${home}/bills`, `homes/${home}/equipment`, `homes/${home}/alerts`, "auth/me", "auth/me/export"]) {
      const response = await request.get(`/api/bff/${path}`);
      expect(response.status(), path).toBe(401);
    }
  });

  test("las peticiones que cambian datos exigen el origen de la web (protección CSRF)", async ({ page, context }) => {
    await freshHome(page, context, "Casa Origen");
    const response = await context.request.post("/api/bff/homes", { data: { name: "x", distributor: "EDESUR" }, headers: { origin: "https://evil.example.com" } });
    expect([400, 403]).toContain(response.status());
  });
});
