import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { effectiveQuery, resultsLabel, supportMailto } from './model';

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
describe('ayuda (móvil)', () => {
  it('busca solo con 2+ letras y recorta', () => {
    expect(effectiveQuery(' a ')).toBe('');
    expect(effectiveQuery('  contraseña ')).toBe('contraseña');
    expect(effectiveQuery('x'.repeat(200))).toHaveLength(80);
    expect(resultsLabel(3, 'factura')).toBe('3 resultado(s) para «factura»');
    expect(resultsLabel(14, '')).toBe('14 artículo(s)');
  });
  it('solo ofrece mailto con un correo válido', () => {
    expect(supportMailto('soporte@example.com')).toBe('mailto:soporte@example.com');
    for (const bad of [null, '', 'sin-arroba', 'a b@c.com', '<x>@c.com', 'a@b']) expect(supportMailto(bad as string | null), String(bad)).toBeNull();
  });
  it('está en la navegación (Perfil → Ayuda) y no inventa un correo de soporte', () => {
    expect(read('../../navigation/AppNavigator.tsx')).toContain("onHelp={() => navigation.navigate('Help')}");
    expect(read('../profile/ProfileScreen.tsx')).toContain('testID="profile-help"');
    const screen = read('./HelpScreen.tsx');
    expect(screen).toContain('supportMailto(data?.contact.email ?? null)');
    expect(screen).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
  });
});
