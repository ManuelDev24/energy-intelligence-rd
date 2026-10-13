// ERD-UI-DENSITY (móvil): toda pantalla con campos de texto debe poder mostrarlos con el teclado abierto.
// Es una comprobación de estructura (vitest no renderiza React Native); no sustituye la prueba en dispositivo.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';

const root = new URL('.', import.meta.url).pathname;
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : full.endsWith('.tsx') ? [full] : [];
  });

// Componentes que NO tienen su propio scroll: viven dentro de una pantalla que ya maneja el teclado.
const CHILD_OF_KEYBOARD_AWARE_SCREEN: Record<string, string> = {
  'profile/AccountDeletionSection.tsx': 'ProfileScreen (automaticallyAdjustKeyboardInsets)',
  'homes/AcceptInvitationSection.tsx': 'HomesScreen (FlatList con automaticallyAdjustKeyboardInsets)',
  'auth/ForgotPasswordView.tsx': 'AuthScreen (KeyboardAvoidingView)',
  'bills/BillFormScreen.tsx': 'él mismo (KeyboardAvoidingView)',
};

it('las pantallas con campos de texto ajustan el área visible al teclado y no pierden el primer toque', () => {
  const offenders: string[] = [];
  for (const file of files(root)) {
    const rel = relative(root, file);
    const src = readFileSync(file, 'utf8');
    if (!/<Field\b|<TextInput\b/.test(src)) continue;
    if (rel in CHILD_OF_KEYBOARD_AWARE_SCREEN && !/<ScrollView|<FlatList/.test(src)) continue;
    const adjusts = /KeyboardAvoidingView|automaticallyAdjustKeyboardInsets/.test(src);
    const persists = !/<ScrollView|<FlatList/.test(src) || /keyboardShouldPersistTaps="handled"/.test(src);
    if (!adjusts || !persists) offenders.push(`${rel} (ajusta teclado: ${adjusts}, conserva toques: ${persists})`);
  }
  expect(offenders).toEqual([]);
});

it('los padres declarados de los componentes sin scroll realmente manejan el teclado', () => {
  const read = (p: string) => readFileSync(join(root, p), 'utf8');
  expect(read('profile/ProfileScreen.tsx')).toContain('automaticallyAdjustKeyboardInsets');
  expect(read('homes/HomesScreen.tsx')).toContain('automaticallyAdjustKeyboardInsets');
  expect(read('auth/AuthScreen.tsx')).toContain('KeyboardAvoidingView');
});
