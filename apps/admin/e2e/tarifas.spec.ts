// ERD-ADM-TARIFFS-WEB: cobertura y versiones de tarifas (datos públicos de la SIE) contra PostgreSQL + API + consola reales. Solo lectura.
import { test, expect, type Page } from '@playwright/test';

const admin = { email: process.env.ADMIN_E2E_ADMIN_EMAIL!, password: process.env.ADMIN_E2E_ADMIN_PASSWORD! };
const user = { email: process.env.ADMIN_E2E_USER_EMAIL!, password: process.env.ADMIN_E2E_USER_PASSWORD! };

async function login(page: Page, account: typeof admin) {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(account.email);
  await page.getByLabel('Contraseña').fill(account.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Mi acceso' })).toBeVisible();
}
const status = (page: Page, path: string, method = 'GET') => page.evaluate(async ({ path, method }) =>
  (await fetch(`/api/admin/proxy${path}`, { method, credentials: 'same-origin', ...(method === 'GET' ? {} : { headers: { 'Content-Type': 'application/json' }, body: '{}' }) })).status, { path, method });

test('una persona sin scopes no ve tarifas y la API responde 403', async ({ page }) => {
  await login(page, user);
  await expect(page.getByRole('link', { name: 'Tarifas' })).toHaveCount(0);
  expect(await status(page, '/tariffs')).toBe(403);
  await page.goto('/tarifas');
  await expect(page.getByText('No tienes permiso para ver esta sección (403).')).toBeVisible();
});

test('el admin ve la cobertura por distribuidora y el detalle de una versión, de solo lectura', async ({ page }) => {
  await login(page, admin);
  await page.getByRole('link', { name: 'Tarifas' }).click();
  await expect(page.getByRole('heading', { name: 'Tarifas', level: 1, exact: true })).toBeVisible();
  const coverage = page.getByRole('region', { name: 'Cobertura de tarifas' });
  // La migración carga BTS-1 para las tres distribuidoras; el estado depende de la fecha, así que se comprueba que cada una tenga uno conocido.
  for (const distributor of ['EDESUR', 'EDENORTE', 'EDEESTE']) {
    await expect(coverage.getByRole('row').filter({ hasText: distributor })).toContainText(/Vigente|Vence pronto sin reemplazo|Aún sin tarifa vigente|Sin tarifa vigente/);
  }
  const edesur = page.locator('details').filter({ hasText: 'EDESUR · BTS-1' });
  await edesur.getByText(/EDESUR · BTS-1/).click();
  await expect(edesur.getByRole('link', { name: /SIE-121-2026-TF/ })).toHaveAttribute('href', /^https:\/\/sie\.gob\.do\//);
  await expect(edesur.getByRole('link', { name: /SIE-121-2026-TF/ })).toHaveAttribute('rel', /noopener/);
  const prices = edesur.getByRole('table', { name: 'Precio por kWh' });
  await expect(prices.getByRole('row')).toHaveCount(5); // encabezado + 4 bloques
  await expect(prices).toContainText('RD$ 6,05');
  await expect(prices).toContainText('RD$ 13,09');
  await expect(prices).toContainText('más de 700 kWh');
  await expect(edesur.getByRole('table', { name: 'Cargo fijo mensual' })).toContainText('RD$ 42,10');
  expect([404, 405]).toContain(await status(page, '/tariffs', 'DELETE'));
  expect([404, 405]).toContain(await status(page, '/tariffs', 'POST'));
});
