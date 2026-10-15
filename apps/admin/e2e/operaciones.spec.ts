// ERD-ADM-OPS-WEB: estado de los trabajos en segundo plano contra PostgreSQL + API + consola reales. Solo lectura; sin cargas útiles ni textos de error.
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

test('una persona sin scopes no ve operaciones y la API responde 403', async ({ page }) => {
  await login(page, user);
  await expect(page.getByRole('link', { name: 'Operaciones' })).toHaveCount(0);
  expect(await status(page, '/jobs/summary')).toBe(403);
  expect(await status(page, '/jobs')).toBe(403);
  await page.goto('/operaciones');
  await expect(page.getByText('No tienes permiso para ver esta sección (403).')).toBeVisible();
});

test('el admin ve la cola por tipo, filtra la lista y nunca ve cargas útiles ni errores', async ({ page }) => {
  await login(page, admin);
  await page.getByRole('link', { name: 'Operaciones' }).click();
  await expect(page.getByRole('heading', { name: 'Operaciones', level: 1, exact: true })).toBeVisible();
  // Los datos sembrados por e2e/db.py son 3 trabajos de OCR (otras especificaciones pueden reintentar o cancelar, así que no se asume su estado).
  const byKind = page.getByRole('region', { name: 'Trabajos por tipo' });
  await expect(byKind.getByRole('row').filter({ hasText: 'ocr.process' })).toBeVisible();
  const list = page.getByRole('region', { name: 'Lista de trabajos' });
  await expect(list.getByRole('caption')).toHaveText('Mostrando 1–3 de 3');

  await page.getByRole('combobox', { name: /^Tipo/ }).selectOption('ocr.process');
  await page.getByRole('combobox', { name: /^Estado/ }).selectOption('succeeded');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(list.getByRole('row').nth(1)).toContainText('Terminados');
  await page.getByRole('combobox', { name: /^Estado/ }).selectOption('queued');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page.locator('main')).toContainText(/Mostrando|No hay trabajos con estos criterios/);

  for (const hidden of ['synthetic engine failure', 'document_id', 'payload', 'last_error']) await expect(page.locator('main').getByText(hidden)).toHaveCount(0);
  expect([404, 405]).toContain(await status(page, '/jobs', 'POST'));
  expect([404, 405]).toContain(await status(page, '/jobs', 'DELETE'));
});
