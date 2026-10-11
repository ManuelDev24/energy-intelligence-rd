// ERD-E2E-PLAYWRIGHT: utilidades compartidas. Selectores accesibles (rol/etiqueta) o `data-testid`; NUNCA esperas fijas.
import { expect, type APIRequestContext, type BrowserContext, type Page, test as base } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import { OUTBOX_FILE, RUN_FILE, WEB_URL, type RunData } from "./env";

export { expect };

export const test = base.extend<{ run: RunData; cspGuard: boolean; cspWatch: void }>({
  // eslint-disable-next-line no-empty-pattern
  run: async ({}, use) => use(JSON.parse(fs.readFileSync(RUN_FILE, "utf8")) as RunData),
  // Auditoría C-06: cualquier prueba falla si el navegador bloquea algo por la CSP (un script, estilo, imagen o conexión legítimos
  // bloqueados = pantalla rota para quien usa la app). Una prueba que provoca la violación a propósito lo apaga con `test.use({ cspGuard: false })`.
  cspGuard: [true, { option: true }],
  cspWatch: [async ({ context, cspGuard }, use) => {
    const violations: string[] = [];
    const watch = (page: Page) => page.on("console", (message) => {
      const text = message.text();
      if (/content security policy|violates the following/i.test(text)) violations.push(text.slice(0, 240));
    });
    context.pages().forEach(watch);
    context.on("page", watch);
    await use();
    if (cspGuard) expect(violations, "El navegador bloqueó recursos por la CSP").toEqual([]);
  }, { auto: true }],
});

export const uniqueEmail = (tag = "u") => `${tag}-${crypto.randomBytes(6).toString("hex")}@example.com`;
export const newPassword = () => crypto.randomBytes(18).toString("base64url");

export interface Account {
  email: string;
  password: string;
}

/** Registro por la interfaz (con aceptación de términos). Termina en la pantalla «Mis viviendas». */
export async function registerViaUi(page: Page, account: Account = { email: uniqueEmail(), password: newPassword() }): Promise<Account> {
  await page.goto("/register");
  await page.getByLabel("Correo electrónico").fill(account.email);
  await page.getByLabel("Contraseña").fill(account.password);
  await page.getByRole("checkbox", { name: /acepto/i }).check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL("**/homes");
  return account;
}

/** Registro rápido por el BFF (comparte la cookie con `page`). La primera llamada recibe 428 con la cookie de época; se repite. */
export async function registerViaApi(context: BrowserContext, account: Account = { email: uniqueEmail(), password: newPassword() }): Promise<Account> {
  const send = () => context.request.post("/api/bff/auth/register", {
    data: { email: account.email, password: account.password, accept_terms: true }, headers: { origin: WEB_URL },
  });
  let response = await send();
  if (response.status() === 428) response = await send();
  expect(response.status(), await response.text()).toBe(201);
  return account;
}

export async function loginViaUi(page: Page, account: Account) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(account.email);
  await page.getByLabel("Contraseña").fill(account.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/homes");
}

/** Llamada al BFF desde el navegador (con su cookie). Devuelve estado y cuerpo. */
export async function bff<T = unknown>(page: Page | { request: APIRequestContext }, path: string, method = "GET", body?: unknown): Promise<{ status: number; body: T }> {
  const request = "request" in page ? page.request : (page as Page).request;
  const response = await request.fetch(`/api/bff/${path}`, {
    method, headers: { origin: WEB_URL, "content-type": "application/json" }, data: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status(), body: (text ? JSON.parse(text) : null) as T };
}

export function outbox(to: string): Array<{ to: string; subject: string; text: string; html: string }> {
  if (!fs.existsSync(OUTBOX_FILE)) return [];
  return fs.readFileSync(OUTBOX_FILE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((m) => m.to === to);
}

/** Espera (con reintentos, no con pausa fija) el último correo enviado a `to` que cumpla `match`. */
export async function waitForMail(to: string, match: (subject: string) => boolean = () => true) {
  let found: ReturnType<typeof outbox>[number] | undefined;
  await expect.poll(() => (found = outbox(to).filter((m) => match(m.subject)).at(-1)) !== undefined, { timeout: 30_000, message: `sin correo para ${to}` }).toBe(true);
  return found!;
}

/** Elige la vivienda en «Mis viviendas» (la selección vive en memoria: se navega por enlaces, no con goto). */
export async function pickHome(page: Page, name: string | RegExp) {
  await page.getByRole("button", { name }).first().click();
  await page.waitForURL("**/dashboard");
}

export async function createHomeViaApi(page: Page, name: string, distributor = "EDESUR"): Promise<string> {
  const { status, body } = await bff<{ id: string }>(page, "homes", "POST", { name, distributor });
  expect(status).toBe(201);
  return body.id;
}

/** Cuenta nueva (por el BFF) con una vivienda propia ya seleccionada: termina en el panel. */
export async function freshHome(page: Page, context: BrowserContext, name = "Casa E2E", distributor = "EDESUR", pick = true): Promise<{ account: Account; homeId: string; pick: () => Promise<void> }> {
  const account = await registerViaApi(context);
  const homeId = await createHomeViaApi(page, name, distributor);
  await page.goto("/homes");
  const choose = () => pickHome(page, new RegExp(name));
  if (pick) await choose();
  return { account, homeId, pick: choose };
}

/** Navega por el menú lateral (la vivienda elegida vive en memoria: nunca `goto` entre pantallas internas). */
export async function openSection(page: Page, link: string, path: string) {
  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: new RegExp(`^${link}`) }).click();
  await page.waitForURL(`**${path}`);
}

export async function loaded(page: Page) {
  await expect(page.getByText(/^Cargando/)).toHaveCount(0);
}

export async function addBill(page: Page, homeId: string, start: string, end: string, kwh: string, amount: string, days: number) {
  const { status, body } = await bff(page, `homes/${homeId}/bills`, "POST", { period_start: start, period_end: end, kwh, amount_dop: amount, days });
  expect(status, JSON.stringify(body)).toBe(201);
}

export async function addReading(page: Page, homeId: string, daysAgo: number, kwh: number) {
  const readAt = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  const { status, body } = await bff(page, `homes/${homeId}/readings`, "POST", { read_at: readAt, reading_kwh: String(kwh) });
  expect(status, JSON.stringify(body)).toBe(201);
}

export { test as base };
