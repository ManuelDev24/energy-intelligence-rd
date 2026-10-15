// ERD-ADM-DASH-WEB: resumen administrativo contra PostgreSQL + API + consola reales. Solo agregados; las cifras de la cola dependen del orden
// de las demás especificaciones, así que aquí se comprueban las que no cambian (personas, viviendas, facturas) y la estructura.
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
const stat = (page: Page, list: string, label: string) => page.getByRole('list', { name: list }).getByRole('listitem').filter({ hasText: label });

test('usuario sin scopes no ve el resumen y la API responde 403', async ({ page }) => {
  await login(page, user);
  await expect(page.getByRole('link', { name: 'Resumen' })).toHaveCount(0);
  expect(await page.evaluate(async () => (await fetch('/api/admin/proxy/overview', { credentials: 'same-origin' })).status)).toBe(403);
  await page.goto('/resumen');
  await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible();
  await expect(page.getByText('No tienes permiso para ver esta sección (403).')).toBeVisible();
});

test('el admin ve cifras agregadas, salud de servicios y tendencias con tabla alternativa, sin datos de hogares', async ({ page }) => {
  await login(page, admin);
  await page.getByRole('link', { name: 'Resumen' }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', level: 1 })).toBeVisible();
  await expect(stat(page, 'Cifras de la plataforma', 'Personas registradas')).toContainText('2');
  await expect(stat(page, 'Cifras de la plataforma', 'Viviendas')).toContainText('1');
  await expect(stat(page, 'Cifras de la plataforma', 'Facturas')).toContainText('2');
  await expect(page.getByRole('list', { name: 'Cola de trabajos' }).getByRole('listitem')).toHaveCount(4);

  const health = page.getByRole('region', { name: 'Salud de los servicios' });
  await expect(health.getByRole('row').filter({ hasText: 'Base de datos' })).toContainText('Bien');
  await expect(health.getByRole('row').filter({ hasText: 'Worker de trabajos' })).toContainText(/Sin atraso|Posiblemente detenido/);
  await expect(health.getByRole('row').filter({ hasText: 'Copilot' })).toContainText('Apagado');

  await expect(page.getByRole('img', { name: /Personas nuevas: 2 personas en 14 días/ })).toBeVisible();
  const trend = page.locator('figure').filter({ hasText: 'Personas nuevas' });
  await trend.getByText('Ver datos').click();
  await expect(trend.getByRole('region', { name: 'Datos: Personas nuevas' }).getByRole('row')).toHaveCount(15);

  for (const secret of ['Vivienda sintética', 'EDESUR', admin.email, user.email]) await expect(page.locator('main').getByText(secret)).toHaveCount(0);
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', level: 1 })).toBeVisible();
});
