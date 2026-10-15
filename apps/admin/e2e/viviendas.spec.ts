// ERD-ADM-HOMES-WEB: consulta de viviendas contra PostgreSQL + API + consola reales. Solo lectura, auditada, sin datos de identificación.
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

test('una persona sin scopes no ve la consulta de viviendas y la API responde 403', async ({ page }) => {
  await login(page, user);
  await expect(page.getByRole('link', { name: 'Viviendas' })).toHaveCount(0);
  expect(await status(page, '/homes')).toBe(403);
  await page.goto('/viviendas');
  await expect(page.getByText('No tienes permiso para ver esta sección (403).')).toBeVisible();
});

test('el admin busca por código, abre una ficha de solo lectura sin datos de identificación y todo queda auditado', async ({ page }) => {
  await login(page, admin);
  await page.getByRole('link', { name: 'Viviendas' }).click();
  await expect(page.getByRole('heading', { name: 'Viviendas', level: 1 })).toBeVisible();
  const table = page.getByRole('region', { name: 'Viviendas' });
  await expect(table.getByRole('row').filter({ hasText: 'E2E-HOME-01' })).toContainText('Distrito Nacional');

  await page.getByLabel('Código o identificador').fill('a b');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Usa el código o el identificador' })).toBeVisible();
  await page.getByLabel('Código o identificador').fill('E2E-HOME');
  await page.getByLabel('Distribuidora').selectOption('EDENORTE');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByText('No hay viviendas con estos criterios.')).toBeVisible();
  await page.getByLabel('Distribuidora').selectOption('EDESUR');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(table.getByRole('caption')).toHaveText('Mostrando 1–1 de 1');
  for (const hidden of ['Vivienda sintética', 'Calle Sintética']) await expect(page.locator('main').getByText(hidden)).toHaveCount(0);

  await table.getByRole('link', { name: 'E2E-HOME-01' }).click();
  await expect(page.getByRole('heading', { name: 'Vivienda', level: 1 })).toBeVisible();
  await expect(page.getByText('Documentos', { exact: true }).locator('xpath=following-sibling::dd[1]')).toHaveText('3');
  await expect(page.getByText('Miembros', { exact: true }).locator('xpath=following-sibling::dd[1]')).toHaveText('0');
  for (const hidden of ['Vivienda sintética', 'Calle Sintética', '@']) await expect(page.locator('main').getByText(hidden)).toHaveCount(0);
  expect([404, 405]).toContain(await status(page, `/homes/${new URL(page.url()).pathname.split('/').pop()}`, 'DELETE'));

  await page.getByRole('link', { name: 'Auditoría' }).click();
  await page.getByLabel('Filtrar por acción').fill('homes.view');
  await expect(page.getByRole('row').filter({ hasText: 'homes.view' }).first()).toContainText('admin.homes.read');
  await page.getByLabel('Filtrar por acción').fill('homes.search');
  await expect(page.getByRole('row').filter({ hasText: 'homes.search' }).first()).toBeVisible();
  await expect(page.locator('main').getByText('E2E-HOME')).toHaveCount(0); // el término buscado no se guarda
});

test('una vivienda inexistente muestra un estado claro', async ({ page }) => {
  await login(page, admin);
  await page.goto('/viviendas/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('alert').filter({ hasText: 'Esta vivienda no existe.' })).toBeVisible();
});
