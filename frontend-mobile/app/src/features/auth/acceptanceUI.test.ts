import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const file = (path: string) => new URL(path, import.meta.url);

it('registro exige la aceptación explícita de términos/privacidad con texto de borrador', () => {
  const screen = readFileSync(file('./AuthScreen.tsx'), 'utf8');
  expect(screen).toContain('auth-accept-terms');
  expect(screen).toContain('requiresAcceptance(mode, accepted)');
  expect(screen).toContain('if (acceptance) return;');
  expect(screen).toContain('authSession.register(email, secret, accepted)');
  expect(screen).toContain('LEGAL_DRAFT_NOTICE');
  expect(screen).toContain("components/Checkbox");
});
