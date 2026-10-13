import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

it('el enlace "Olvidé mi contraseña" solo aparece en modo login y abre la vista de recuperación', () => {
  const screen = read('./AuthScreen.tsx');
  expect(screen).toContain('Olvidé mi contraseña');
  expect(screen).toMatch(/mode === 'login' \? <Button title="Olvidé mi contraseña"/);
  expect(screen).toContain('testID="auth-forgot-link"');
  expect(screen).toContain('<ForgotPasswordView');
  // El aviso "aún no disponible" desaparece: la recuperación ya existe.
  expect(screen).not.toContain('auth-recovery-unavailable');
});

it('la vista de recuperación usa el cliente sin sesión, entrada de correo y solo texto local', () => {
  const view = read('./ForgotPasswordView.tsx');
  for (const id of ['auth-forgot-email', 'auth-forgot-submit', 'auth-forgot-back', 'auth-forgot-confirmation', 'auth-forgot-error'])
    expect(view).toContain(`testID="${id}"`);
  expect(view).toContain('keyboardType="email-address"');
  expect(view).toContain('autoComplete="email"');
  expect(view).toContain('authClient.forgotPassword');
  expect(view).toContain('FORGOT_CONFIRMATION');
  expect(view).toContain('createForgotSubmitter');
  expect(view).not.toMatch(/\.message\b/); // nunca renderiza mensajes de error crudos
  expect(view).toMatch(/disabled=\{busy/);
});

it('la pantalla de auth solo se monta con AUTH_ENABLED (modo piloto no ve nada nuevo)', () => {
  const nav = read('../../navigation/AppNavigator.tsx');
  expect(nav).toContain('if (!AUTH_ENABLED) return <LegacyApp />');
});
