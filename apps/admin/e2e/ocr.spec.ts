// ERD-OCR-03-WEB: consola OCR contra PostgreSQL + API reales. La cola la siembra e2e/db.py (seed-ocr) con datos sintéticos.
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
async function proxyStatus(page: Page, path: string) {
  return page.evaluate(async (path) => (await fetch(`/api/admin/proxy${path}`, { credentials: 'same-origin' })).status, path);
}
async function noPrivateData(page: Page) {
  for (const secret of ['Vivienda sintética', 'synthetic engine failure', 'storage_key', 'EDESUR']) {
    await expect(page.getByText(secret)).toHaveCount(0);
  }
}

test('usuario sin scopes: la consola OCR responde 403 real', async ({ page }) => {
  await login(page, user);
  await expect(page.getByRole('link', { name: 'OCR' })).toHaveCount(0);
  expect(await proxyStatus(page, '/ocr/jobs')).toBe(403);
  await page.goto('/ocr');
  await expect(page.getByRole('heading', { name: 'Trabajos OCR' })).toBeVisible();
  await expect(page.getByText('No tienes permiso para ver esta sección (403).')).toBeVisible();
});

test('admin filtra, reintenta y cancela con motivo, y todo queda auditado', async ({ page }) => {
  await login(page, admin);
  await page.getByRole('link', { name: 'OCR' }).click();
  await expect(page.getByRole('heading', { name: 'Trabajos OCR' })).toBeVisible();
  const table = page.getByRole('region', { name: 'Trabajos OCR' });
  await expect(table.getByRole('caption')).toHaveText('Mostrando 1–3 de 3');
  await noPrivateData(page);

  await page.getByLabel('Estado').selectOption('dead_letter');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(table.getByRole('caption')).toHaveText('Mostrando 1–1 de 1');
  const row = table.getByRole('row').filter({ hasText: 'Dead-letter' });
  await expect(row).toContainText('3 de 3');
  await expect(row).toContainText('Error del motor OCR');

  await page.getByLabel('Error').selectOption('unreadable');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(page.getByText('No hay trabajos OCR con estos filtros.')).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar' }).click();
  await expect(table.getByRole('caption')).toHaveText('Mostrando 1–3 de 3');
  await table.getByRole('row').filter({ hasText: 'Dead-letter' }).getByRole('link').click();

  await expect(page.getByRole('heading', { name: /^Trabajo OCR #\d+$/ })).toBeVisible();
  await expect(page.getByText('Sin operaciones manuales.')).toBeVisible();
  await noPrivateData(page);
  const retry = page.getByRole('form', { name: 'Reintentar lectura' });
  await retry.getByRole('button', { name: 'Reintentar' }).click();
  await expect(retry.getByRole('alert')).toHaveText('El motivo es obligatorio.');
  await retry.getByLabel('Motivo (obligatorio)').fill('avisar a persona@example.com');
  await retry.getByRole('button', { name: 'Reintentar' }).click();
  await expect(retry.getByRole('alert')).toContainText('no incluyas correos');
  await retry.getByLabel('Motivo (obligatorio)').fill('Fallo del motor en E2E');
  await retry.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Trabajo puesto de nuevo en cola.' })).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: 'En cola' })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Reintentar lectura' })).toHaveCount(0);

  const cancel = page.getByRole('form', { name: 'Cancelar trabajo' });
  await cancel.getByLabel('Motivo (obligatorio)').fill('Cancelación de prueba E2E');
  await cancel.getByRole('button', { name: 'Cancelar trabajo…' }).click();
  await cancel.getByRole('button', { name: 'No, volver' }).click();
  await expect(page.getByRole('definition').filter({ hasText: 'En cola' })).toBeVisible();
  await cancel.getByRole('button', { name: 'Cancelar trabajo…' }).click();
  await cancel.getByRole('button', { name: 'Sí, confirmar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Trabajo cancelado.' })).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: 'Cancelado' })).toBeVisible();
  const history = page.getByRole('region', { name: 'Historial de operaciones' });
  await expect(history.getByRole('row').nth(1)).toContainText('Cancelación');
  await expect(history.getByRole('row').nth(1)).toContainText('Cancelación de prueba E2E');
  await expect(history.getByRole('row').nth(2)).toContainText('Reintento manual');
  await expect(history.getByRole('row').nth(2)).toContainText('Fallo del motor en E2E');

  await page.getByRole('link', { name: 'Auditoría' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'ocr.retry' }).filter({ hasText: 'Fallo del motor en E2E' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'ocr.cancel' }).filter({ hasText: 'Cancelación de prueba E2E' })).toBeVisible();
});

test('un trabajo inexistente muestra un estado claro', async ({ page }) => {
  await login(page, admin);
  await page.goto('/ocr/999999');
  await expect(page.getByRole('alert').filter({ hasText: 'Este trabajo no existe o ya no está disponible.' })).toBeVisible();
  await page.getByRole('link', { name: 'Volver a los trabajos OCR' }).click();
  await expect(page.getByRole('heading', { name: 'Trabajos OCR' })).toBeVisible();
});
