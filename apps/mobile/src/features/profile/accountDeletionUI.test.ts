import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const file = (path: string) => new URL(path, import.meta.url);

it('la zona de peligro tiene confirmación en dos pasos, reautenticación y bloquea doble envío', () => {
  const section = readFileSync(file('./AccountDeletionSection.tsx'), 'utf8');
  expect(section).toContain('profile-delete-account');
  expect(section).toContain('profile-delete-password');
  expect(section).toContain('profile-delete-confirm');
  expect(section).toContain('profile-delete-cancel');
  expect(section).toContain('textContentType="password"');
  expect(section).toContain('secureTextEntry');
  expect(section).not.toContain('textContentType="newPassword"');
  expect(section).toContain('canSubmitDeletion(draft.password, mutation.isPending)');
  expect(section).toContain('api.deleteAccount');
  expect(section).toContain('authSession.invalidate(');
  expect(section).toContain('describeError');
  expect(section).not.toContain('{mutation.error?.message}');
  expect(section).not.toContain('{mutation.error.message}');
});
it('la sección de eliminación aparece en Perfil solo con AUTH_ENABLED (nunca en modo piloto)', () => {
  const screen = readFileSync(file('./ProfileScreen.tsx'), 'utf8');
  expect(screen).toContain('AccountDeletionSection');
  expect(screen).toMatch(/AUTH_ENABLED\s*\?\s*<AccountDeletionSection/);
});
