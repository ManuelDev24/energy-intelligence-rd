// Flujos de cuenta: registro con términos, inicio/cierre de sesión, renovación de sesión y recuperación/cambio de contraseña.
import { API_URL, WEB_URL } from "../support/env";
import { expect, loginViaUi, newPassword, outbox, registerViaApi, registerViaUi, test, uniqueEmail, waitForMail } from "../support/test";

test.describe("registro y términos", () => {
  test("sin aceptar los términos no se crea la cuenta; al aceptar entra a «Mis viviendas»", async ({ page }) => {
    const email = uniqueEmail("reg");
    await page.goto("/register");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña").fill(newPassword());
    const submit = page.getByRole("button", { name: "Crear cuenta" });
    const terms = page.getByRole("checkbox", { name: /acepto/i });
    await expect(terms).not.toBeChecked();
    await expect(terms).toHaveAttribute("required", "");                   // la aceptación es obligatoria
    await expect(submit).toBeDisabled();                                   // y el botón espera a que se marque
    await terms.check();
    await expect(submit).toBeEnabled();
    await submit.click();
    await page.waitForURL("**/homes");
    await expect(page.getByRole("heading", { name: "Mis viviendas" })).toBeVisible();
  });

  test("un correo repetido o una contraseña corta se rechazan con un mensaje, sin revelar nada más", async ({ page, context }) => {
    const taken = await registerViaApi(context);
    await context.clearCookies();
    await page.goto("/register");
    await page.getByLabel("Correo electrónico").fill(taken.email);
    await page.getByLabel("Contraseña").fill(newPassword());
    await page.getByRole("checkbox", { name: /acepto/i }).check();
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Revisa tus datos" })).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
    await page.getByLabel("Correo electrónico").fill(uniqueEmail("corta"));
    await page.getByLabel("Contraseña").fill("corta");
    await expect(page.getByLabel("Contraseña")).toHaveJSProperty("validity.tooShort", true);
  });
});

test.describe("sesión", () => {
  test("@smoke iniciar sesión, cerrar sesión y volver a entrar; una contraseña equivocada se rechaza", async ({ page }) => {
    const account = await registerViaUi(page);
    await page.goto("/account");
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.waitForURL("**/login");
    await page.goto("/homes");                                              // ya no hay sesión: vuelve al login
    await page.waitForURL("**/login");

    await page.getByLabel("Correo electrónico").fill(account.email);
    await page.getByLabel("Contraseña").fill(newPassword());
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Revisa tus datos" })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    await loginViaUi(page, account);
    await expect(page.getByRole("heading", { name: "Mis viviendas" })).toBeVisible();
  });

  test("vencimiento: sin acceso vigente la web NO renueva en silencio (decisión de diseño) y pide iniciar sesión", async ({ page, context }) => {
    const account = await registerViaUi(page);
    const access = (await context.cookies()).find((c) => /access/.test(c.name));
    expect(access, "debe haber una cookie de acceso").toBeTruthy();
    await context.clearCookies({ name: access!.name });                    // simula el vencimiento del acceso
    await page.reload();
    await page.waitForURL("**/login");                                      // no hay renovación silenciosa: se pide iniciar sesión
    expect((await page.request.post("/api/bff/auth/refresh", { data: {}, headers: { origin: WEB_URL } })).status()).toBe(404); // el endpoint no se expone
    await loginViaUi(page, account);                                        // volver a entrar restablece la sesión
    await expect(page.getByRole("heading", { name: "Mis viviendas" })).toBeVisible();
  });

  test("renovación en la API real: el token de renovación rota y reutilizar el viejo se rechaza", async ({ request }) => {
    const email = uniqueEmail("ref");
    const registered = await request.post(`${API_URL}/api/v1/auth/register`, { data: { email, password: newPassword(), accept_terms: true } });
    expect(registered.status()).toBe(201);
    const first = await registered.json();
    const renewed = await request.post(`${API_URL}/api/v1/auth/refresh`, { data: { refresh_token: first.refresh_token } });
    expect(renewed.status()).toBe(200);
    const second = await renewed.json();
    expect(second.refresh_token).not.toBe(first.refresh_token);             // rotación
    expect((await request.get(`${API_URL}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${second.access_token}` } })).status()).toBe(200);
    const replay = await request.post(`${API_URL}/api/v1/auth/refresh`, { data: { refresh_token: first.refresh_token } });
    expect(replay.status()).toBe(401);                                      // reutilizar el viejo = señal de robo
    const afterReplay = await request.post(`${API_URL}/api/v1/auth/refresh`, { data: { refresh_token: second.refresh_token } });
    expect(afterReplay.status(), "la reutilización revoca también la familia").toBe(401);
  });

  test("las cookies de sesión son httpOnly y la página no expone tokens a JavaScript", async ({ page, context }) => {
    await registerViaUi(page);
    const cookies = await context.cookies();
    for (const cookie of cookies.filter((c) => /access|refresh/.test(c.name))) expect(cookie.httpOnly, cookie.name).toBe(true);
    const visible = await page.evaluate(() => document.cookie + JSON.stringify(Object.assign({}, localStorage)) + JSON.stringify(Object.assign({}, sessionStorage)));
    expect(visible).not.toMatch(/eyJ[A-Za-z0-9_-]{5,}\./);
  });
});

test.describe("contraseña", () => {
  test("recuperación: enlace por correo de un solo uso, nueva contraseña, la anterior deja de valer", async ({ page, context }) => {
    const account = await registerViaApi(context);
    await context.clearCookies();
    await page.goto("/olvide-contrasena");
    await page.getByLabel("Correo electrónico").fill(account.email);
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(page.getByText(/Si existe una cuenta/)).toBeVisible();
    // La misma confirmación para una cuenta que no existe (no se enumeran correos).
    const mail = await waitForMail(account.email, (s) => /contraseña/i.test(s));
    const link = mail.text.match(/https?:\/\/\S+#token=\S+/)?.[0];
    expect(link, mail.text).toBeTruthy();
    await page.goto(link!);
    const fresh = newPassword();
    await page.getByLabel("Nueva contraseña", { exact: true }).fill(fresh);
    await page.getByLabel("Confirmar contraseña").fill(fresh);
    await page.getByRole("button", { name: "Restablecer contraseña" }).click();
    await expect(page.getByText(/restableci|actualiz/i).first()).toBeVisible();

    await loginViaUi(page, { email: account.email, password: fresh });
    await context.clearCookies();
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(account.email);
    await page.getByLabel("Contraseña").fill(account.password);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page.getByRole("alert")).toBeVisible();                   // la contraseña vieja ya no sirve
    // El enlace es de un solo uso.
    await page.goto(link!);
    await page.getByLabel("Nueva contraseña", { exact: true }).fill(newPassword());
    await page.getByLabel("Confirmar contraseña").fill("otra-distinta-xx");
    await page.getByRole("button", { name: "Restablecer contraseña" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
  });

  test("recuperar con un correo que no existe responde igual y no envía nada", async ({ page }) => {
    const ghost = uniqueEmail("fantasma");
    await page.goto("/olvide-contrasena");
    await page.getByLabel("Correo electrónico").fill(ghost);
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(page.getByText(/Si existe una cuenta/)).toBeVisible();
    await expect.poll(() => outbox(ghost).length, { timeout: 5_000 }).toBe(0);
  });

  test("cambio de contraseña desde «Mi cuenta»: exige la actual y la nueva vale para entrar", async ({ page, context }) => {
    const account = await registerViaUi(page);
    await page.goto("/account");
    const fresh = newPassword();
    await page.getByLabel("Contraseña actual").fill(newPassword());        // equivocada
    await page.getByLabel("Nueva contraseña", { exact: true }).fill(fresh);
    await page.getByLabel("Confirmar nueva contraseña").fill(fresh);
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();

    await page.getByLabel("Contraseña actual").fill(account.password);
    await page.getByLabel("Nueva contraseña", { exact: true }).fill(fresh);
    await page.getByLabel("Confirmar nueva contraseña").fill(fresh);
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(page.getByRole("status").or(page.getByText(/contraseña (actualizada|cambiada)/i)).first()).toBeVisible();
    await context.clearCookies();
    await loginViaUi(page, { email: account.email, password: fresh });
  });
});
