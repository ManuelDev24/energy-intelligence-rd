// ERD-ADM-SYSTEM-WEB: configuración y salud contra PostgreSQL + API + consola reales. Solo lectura; nunca valores de variables.
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

test('una persona sin scopes no ve el sistema y la API responde 403', async ({ page }) => {
  await login(page, user);
  await expect(page.getByRole('link', { name: 'Sistema' })).toHaveCount(0);
  expect(await status(page, '/system')).toBe(403);
  await page.goto('/sistema');
  await expect(page.getByText('No tienes permiso para ver esta sección (403).')).toBeVisible();
});

test('el admin ve versión, migraciones al día, configuración sin valores y fechas declaradas, no medidas', async ({ page }) => {
  await login(page, admin);
  await page.getByRole('link', { name: 'Sistema' }).click();
  await expect(page.getByRole('heading', { name: 'Sistema', level: 1, exact: true })).toBeVisible();

  const version = page.getByRole('region', { name: 'Versión y arranque' });
  await expect(version.getByRole('row').filter({ hasText: 'Entorno' })).toContainText('development');
  await expect(version.getByRole('row').filter({ hasText: 'Migraciones' })).toContainText('Al día'); // el rol de la API puede leer la revisión aplicada

  const checks = page.getByRole('region', { name: 'Comprobaciones de configuración' });
  await expect(checks.getByRole('row').filter({ hasText: 'AUTH_SIGNING_KEY' })).toContainText('Bien');
  await expect(checks.getByRole('row').filter({ hasText: 'SENTRY_DSN' })).toContainText('No aplica'); // desarrollo
  await expect(checks.getByRole('row').filter({ hasText: 'SUPPORT_EMAIL' })).toContainText('Atención'); // sin definir en el entorno de pruebas

  const backups = page.getByRole('region', { name: 'Respaldos y simulacros' });
  await expect(backups.getByRole('row').filter({ hasText: 'Último respaldo verificado' })).toContainText('Sin fecha declarada');
  await expect(backups.getByRole('row').filter({ hasText: 'Último respaldo verificado' })).toContainText('no medido');
  await expect(page.getByRole('region', { name: 'Guías operativas' })).toContainText('docs/ops/DISASTER_RECOVERY.md');

  // Nunca valores: ni direcciones, ni credenciales, ni la clave de firma de esta corrida.
  const main = await page.locator('main').innerText();
  for (const forbidden of ['postgresql', 'http://', 'https://', '127.0.0.1', 'localhost', process.env.ADMIN_E2E_ADMIN_PASSWORD!]) expect(main.toLowerCase()).not.toContain(forbidden.toLowerCase());
  expect([404, 405]).toContain(await status(page, '/system', 'POST'));
});
