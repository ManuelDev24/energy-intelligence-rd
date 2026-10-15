// ERD-ADM-USERS-WEB: consulta de personas contra PostgreSQL + API + consola reales. Solo lectura y auditada.
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

test('una persona sin scopes no ve la consulta y la API responde 403', async ({ page }) => {
  await login(page, user);
  await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0);
  expect(await status(page, '/users')).toBe(403);
  await page.goto('/usuarios');
  await expect(page.getByText('No tienes permiso para ver esta sección (403).')).toBeVisible();
});

test('el admin busca, abre una ficha de solo lectura y todo queda auditado sin el término buscado', async ({ page }) => {
  await login(page, admin);
  await page.getByRole('link', { name: 'Usuarios' }).click();
  await expect(page.getByRole('heading', { name: 'Usuarios', level: 1 })).toBeVisible();
  const table = page.getByRole('region', { name: 'Personas' });
  await expect(table.getByRole('row').filter({ hasText: admin.email })).toContainText('Superadministración');

  await page.getByLabel('Correo contiene').fill('ab');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Escribe al menos 3 caracteres.' })).toBeVisible();
  const needle = user.email.split('@')[0].slice(0, 12);
  await page.getByLabel('Correo contiene').fill(needle);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(table.getByRole('caption')).toHaveText('Mostrando 1–1 de 1');
  await expect(table.getByRole('row').filter({ hasText: user.email })).toContainText('No');
  await page.getByLabel('Correo verificado').selectOption('yes');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByText('No hay personas con estos criterios.')).toBeVisible();
  await page.getByLabel('Correo verificado').selectOption('');
  await page.getByRole('button', { name: 'Buscar' }).click();

  await table.getByRole('link', { name: user.email }).click();
  await expect(page.getByRole('heading', { name: 'Persona', level: 1 })).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: user.email })).toBeVisible();
  await expect(page.getByText('Roles administrativos').locator('xpath=following-sibling::dd[1]')).toHaveText('Ninguno');
  for (const secret of ['password', 'hash', 'argon2', 'token']) await expect(page.locator('main').getByText(new RegExp(secret, 'i'))).toHaveCount(0);
  expect([404, 405]).toContain(await status(page, `/users/${new URL(page.url()).pathname.split('/').pop()}`, 'DELETE'));

  await page.getByRole('link', { name: 'Auditoría' }).click();
  await page.getByLabel('Filtrar por acción').fill('users.view');
  await expect(page.getByRole('row').filter({ hasText: 'users.view' }).first()).toContainText('admin.users.read');
  await page.getByLabel('Filtrar por acción').fill('users.search');
  const search = page.getByRole('row').filter({ hasText: 'users.search' }).first();
  await expect(search).toBeVisible();
  await expect(page.locator('main').getByText(needle)).toHaveCount(0);
});

test('una ficha inexistente muestra un estado claro', async ({ page }) => {
  await login(page, admin);
  await page.goto('/usuarios/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('alert').filter({ hasText: 'Esta persona no existe.' })).toBeVisible();
});
