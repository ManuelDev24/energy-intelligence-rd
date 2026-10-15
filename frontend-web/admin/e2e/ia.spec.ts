// ERD-AI-ADMIN-WEB: supervisión del Copilot contra PostgreSQL + API + consola reales. Solo agregados; sin contenido de conversaciones.
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

test('una persona sin scopes no ve la supervisión de IA y la API responde 403', async ({ page }) => {
  await login(page, user);
  await expect(page.getByRole('link', { name: 'IA (Copilot)' })).toHaveCount(0);
  expect(await status(page, '/ai/usage')).toBe(403);
  await page.goto('/ia');
  await expect(page.getByText('No tienes permiso para ver esta sección (403).')).toBeVisible();
});

test('el admin ve uso, errores, herramientas y valoraciones, sin contenido, y la consulta queda auditada', async ({ page }) => {
  await login(page, admin);
  await page.getByRole('link', { name: 'IA (Copilot)' }).click();
  await expect(page.getByRole('heading', { name: 'IA (Copilot)', level: 1 })).toBeVisible();
  const stats = page.getByRole('list', { name: 'Cifras del Copilot' });
  await expect(stats.getByRole('listitem').filter({ hasText: 'Respuestas' }).first()).toContainText('3');
  await expect(stats.getByRole('listitem').filter({ hasText: 'Respuestas con problema' })).toContainText('33 %'); // 1 error de 3
  await expect(stats.getByRole('listitem').filter({ hasText: 'Valoración útil' })).toContainText('50 %');
  await expect(stats.getByRole('listitem').filter({ hasText: 'Latencia mediana' })).toContainText('2,3 s');
  await expect(page.getByRole('status').filter({ hasText: 'Sin precios configurados' })).toBeVisible(); // nada de costos inventados
  await expect(page.getByRole('region', { name: 'Herramientas invocadas' })).toContainText('consultar_facturas');
  await expect(page.getByRole('region', { name: 'Estado de las respuestas' }).getByRole('row').filter({ hasText: 'Con error' })).toContainText('1');
  await expect(page.getByRole('region', { name: 'Límites del Copilot' }).getByRole('row').filter({ hasText: 'Proveedor' })).toContainText('Apagado');
  await expect(page.getByRole('region', { name: 'Personas con más uso' })).toContainText('pilot');
  for (const hidden of ['texto sintético', 'Conversación sintética', 'Vivienda sintética', '@']) await expect(page.locator('main').getByText(hidden)).toHaveCount(0);

  await page.getByLabel('Periodo').selectOption('7');
  await expect(page.getByRole('heading', { name: 'Uso por día' })).toBeVisible();
  expect([404, 405]).toContain(await status(page, '/ai/usage', 'POST'));

  await page.getByRole('link', { name: 'Auditoría' }).click();
  await page.getByLabel('Filtrar por acción').fill('ai.usage');
  await expect(page.getByRole('row').filter({ hasText: 'ai.usage' }).first()).toContainText('admin.ai.read');
});
