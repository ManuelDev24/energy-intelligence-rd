// ERD-ADM-BILLS-WEB: calidad de datos de facturas y facturas de UNA vivienda contra PostgreSQL + API + consola reales. Solo lectura y auditada.
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

test('una persona sin scopes no ve facturas y la API responde 403', async ({ page }) => {
  await login(page, user);
  await expect(page.getByRole('link', { name: 'Facturas' })).toHaveCount(0);
  expect(await status(page, '/bills/summary')).toBe(403);
  expect(await status(page, '/homes/00000000-0000-4000-8000-000000000000/bills')).toBe(403);
  await page.goto('/facturas');
  await expect(page.getByText('No tienes permiso para ver esta sección (403).')).toBeVisible();
});

test('el admin ve la calidad de los datos y las facturas de una vivienda, de solo lectura y auditado', async ({ page }) => {
  await login(page, admin);
  // El identificador sale de la consulta de viviendas (nunca se escribe a ciegas).
  await page.getByRole('link', { name: 'Viviendas' }).click();
  await page.getByRole('region', { name: 'Viviendas' }).getByRole('link', { name: 'E2E-HOME-01' }).click();
  await page.waitForURL(/\/viviendas\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Vivienda', level: 1, exact: true })).toBeVisible();
  const homeId = new URL(page.url()).pathname.split('/').pop()!;

  await page.getByRole('link', { name: 'Facturas' }).click();
  await expect(page.getByRole('heading', { name: 'Facturas', level: 1 })).toBeVisible();
  const totals = page.getByRole('list', { name: 'Totales de facturas' });
  await expect(totals.getByRole('listitem').filter({ hasText: 'Facturas' }).first()).toContainText('2');
  const quality = page.getByRole('region', { name: 'Completitud de facturas' });
  await expect(quality.getByRole('row').filter({ hasText: 'Con original' })).toContainText('50 %');
  await expect(quality.getByRole('row').filter({ hasText: 'Con 0 kWh' })).toContainText('0 %');
  await expect(page.getByRole('region', { name: 'Estado del OCR' }).getByRole('row').filter({ hasText: 'Fallidos' })).toContainText('2');
  for (const hidden of ['Vivienda sintética', 'Calle Sintética', '3.900', '5.460']) await expect(page.locator('main').getByText(hidden)).toHaveCount(0);

  await page.getByLabel('Identificador de la vivienda').fill('PILOT-01');
  await page.getByRole('button', { name: 'Ver facturas' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'identificador completo' })).toBeVisible();
  await page.getByLabel('Identificador de la vivienda').fill(homeId);
  await page.getByRole('button', { name: 'Ver facturas' }).click();
  await expect(page.getByRole('heading', { name: 'Facturas de la vivienda', level: 1 })).toBeVisible();
  const table = page.getByRole('region', { name: 'Facturas de la vivienda' });
  await expect(table.getByRole('caption')).toHaveText('Mostrando 1–2 de 2');
  const rows = table.getByRole('row');
  await expect(rows.nth(1)).toContainText('01/08/2026 – 30/08/2026'); // la más reciente primero
  await expect(rows.nth(1)).toContainText('390 kWh');
  await expect(rows.nth(2)).toContainText('Falló'); // OCR fallido del original de julio
  for (const hidden of ['Vivienda sintética', 'Calle Sintética', '@']) await expect(page.locator('main').getByText(hidden)).toHaveCount(0);
  expect([404, 405]).toContain(await status(page, `/homes/${homeId}/bills`, 'DELETE'));

  await page.getByRole('link', { name: 'Auditoría' }).click();
  await page.getByLabel('Filtrar por acción').fill('bills.list');
  await expect(page.getByRole('row').filter({ hasText: 'bills.list' }).first()).toContainText('admin.bills.read');
  await page.getByLabel('Filtrar por acción').fill('bills.summary');
  await expect(page.getByRole('row').filter({ hasText: 'bills.summary' }).first()).toBeVisible();
});

test('una vivienda sin registro muestra un estado claro', async ({ page }) => {
  await login(page, admin);
  await page.goto('/facturas/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('alert').filter({ hasText: 'Esta vivienda no existe.' })).toBeVisible();
});
