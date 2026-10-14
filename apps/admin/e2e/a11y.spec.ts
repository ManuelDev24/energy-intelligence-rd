// ERD-QA-A11Y: axe (WCAG 2.0/2.1/2.2 A y AA + buenas prácticas) y desborde horizontal en las páginas protegidas del admin y en la
// vista 403, a 360, 768 y 1280 px. Detectó select-name (crítico), cabeceras vacías, 403 sin h1 y desbordes de hasta 720 px.
import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const admin = { email: process.env.ADMIN_E2E_ADMIN_EMAIL!, password: process.env.ADMIN_E2E_ADMIN_PASSWORD! };
const user = { email: process.env.ADMIN_E2E_USER_EMAIL!, password: process.env.ADMIN_E2E_USER_PASSWORD! };
const WIDTHS: Array<[number, number]> = [[360, 740], [768, 1024], [1280, 800]];

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(account.email);
  await page.getByLabel('Contraseña').fill(account.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Mi acceso' })).toBeVisible();
}

async function problems(page: Page, name: string, width: number): Promise<string[]> {
  // La navegación cliente puede mostrar el contenido antes de que Next restaure el <title>.
  // Esperar el título real (sin saltar axe): si nunca aparece, la prueba sigue fallando.
  await expect(page).toHaveTitle('Energy RD · Admin');
  await page.evaluate(AXE);
  const result = await page.evaluate(async () => {
    // @ts-expect-error axe lo inyecta la propia prueba
    const res = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
    return {
      violations: res.violations as Array<{ id: string; impact: string | null; help: string; nodes: Array<{ target: string[] }> }>,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  const found = result.violations.map((v) => `${name}@${width}: ${v.id} (${v.impact}) ${v.help} → ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
  if (result.overflow > 0) found.push(`${name}@${width}: desborde horizontal de ${result.overflow}px`);
  return found;
}

test('páginas protegidas del admin: sin violaciones de axe ni desborde a 360, 768 y 1280 px', async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, admin);
  const found: string[] = [];
  for (const [width, height] of WIDTHS) {
    await page.setViewportSize({ width, height });
    for (const [name, path, heading] of [['mi-acceso', '/mi-acceso', 'Mi acceso'], ['roles', '/roles', 'Roles y asignaciones'],
      ['auditoria', '/auditoria', 'Auditoría'], ['ocr', '/ocr', 'Trabajos OCR']] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: new RegExp(heading) }).first()).toBeVisible();
      found.push(...(await problems(page, name, width)));
    }
    // Detalle con el formulario de cancelación visible (trabajo en cola sembrado por e2e/db.py).
    await page.getByRole('row').filter({ hasText: 'En cola' }).getByRole('link').click();
    await expect(page.getByRole('form', { name: 'Cancelar trabajo' })).toBeVisible();
    found.push(...(await problems(page, 'ocr-detalle', width)));
  }
  expect(found, found.join('\n')).toEqual([]);
});

test('vista 403 del admin: accesible y con h1', async ({ page }) => {
  await login(page, user);
  await page.goto('/roles');
  await expect(page.getByText('No tienes permiso para ver esta sección (403).')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const found = await problems(page, 'roles-403', 1280);
  expect(found, found.join('\n')).toEqual([]);
});
