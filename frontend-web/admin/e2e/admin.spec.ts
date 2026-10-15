import { test, expect, type Page } from '@playwright/test';

const admin = { email: process.env.ADMIN_E2E_ADMIN_EMAIL!, password: process.env.ADMIN_E2E_ADMIN_PASSWORD! };
const user = { email: process.env.ADMIN_E2E_USER_EMAIL!, password: process.env.ADMIN_E2E_USER_PASSWORD! };
const targetId = process.env.ADMIN_E2E_USER_ID!;

async function login(page: Page, account: typeof admin) {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(account.email);
  await page.getByLabel('Contraseña').fill(account.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Mi acceso' })).toBeVisible();
}
async function proxyStatus(page: Page, path: string, method = 'GET', body?: object) {
  return page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(`/api/admin/proxy${path}`, {
      method, credentials: 'same-origin',
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    return response.status;
  }, { path, method, body });
}
async function assertNoBrowserTokens(page: Page) {
  const clean = await page.evaluate(() => [localStorage, sessionStorage].every(store =>
    Object.entries(store).every(([key, value]) => !/token|bearer|session|admin-access|admin-refresh|eyJ/i.test(`${key}:${value}`))));
  expect(clean).toBe(true);
}

test('ordinary user sees no scopes and receives real 403 on scoped routes', async ({ page }) => {
  await login(page, user);
  await expect(page.getByText('No tienes scopes administrativos.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Roles y asignaciones' })).toHaveCount(0);
  expect(await proxyStatus(page, '/roles')).toBe(403);
  expect(await proxyStatus(page, '/audit-events')).toBe(403);
  expect(await proxyStatus(page, '/role-assignments', 'POST',
    { user_id: targetId, role_name: 'auditor', reason: 'unauthorized test' })).toBe(403);
  await page.goto('/roles');
  await expect(page.getByText('No tienes permiso para ver esta sección (403).')).toBeVisible();
  await assertNoBrowserTokens(page);
});

test('admin grants, audits and revokes access through browser UI then logs out', async ({ browser, page }) => {
  await login(page, admin);
  await expect(page.getByText('super_admin', { exact: true })).toBeVisible();
  await expect(page.getByText('admin.roles.manage', { exact: true })).toBeVisible();
  await expect(page.getByText('admin.audit.read', { exact: true })).toBeVisible();
  await assertNoBrowserTokens(page);
  const cookies = await page.context().cookies();
  expect(['admin-access', 'admin-refresh'].every(name => cookies.some(c =>
    c.name === name && c.httpOnly && c.sameSite === 'Strict'))).toBe(true);

  await page.getByRole('link', { name: 'Roles y asignaciones' }).click();
  await expect(page.getByRole('heading', { name: 'Roles y asignaciones' })).toBeVisible();
  await page.getByPlaceholder('user_id (UUID)').fill(targetId);
  await page.locator('select').selectOption('auditor');
  await page.getByPlaceholder('Motivo (obligatorio)').fill('synthetic grant');
  await page.getByRole('button', { name: 'Asignar' }).click();
  const row = page.getByRole('row').filter({ hasText: targetId }).filter({ hasText: 'auditor' });
  await expect(row).toContainText('active');

  const userContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const userPage = await userContext.newPage();
    await login(userPage, user);
    await expect(userPage.getByText('auditor', { exact: true })).toBeVisible();
    expect(await proxyStatus(userPage, '/audit-events')).toBe(200);

    page.once('dialog', dialog => dialog.accept('synthetic revoke'));
    await row.getByRole('button', { name: 'Revocar' }).click();
    await expect(row).toContainText('revoked');
    await userPage.reload();
    await expect(userPage.getByText('No tienes scopes administrativos.')).toBeVisible();
    expect(await proxyStatus(userPage, '/audit-events')).toBe(403);

    await page.getByRole('link', { name: 'Auditoría' }).click();
    await expect(page.getByRole('heading', { name: 'Auditoría' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'role.assign' }).filter({ hasText: 'synthetic grant' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'role.revoke' }).filter({ hasText: 'synthetic revoke' })).toBeVisible();
    await assertNoBrowserTokens(page);
  } finally {
    await userContext.close();
  }
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Acceso administrativo' })).toBeVisible();
  await expect.poll(() => proxyStatus(page, '/roles')).toBe(401);
  await page.goto('/roles');
  await expect(page).toHaveURL(/\/login$/);
  await assertNoBrowserTokens(page);
});
