import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const file = (path: string) => new URL(path, import.meta.url);
it('presenta errores de campo del servidor y confirma guardados sin alarma urgente', () => {
  for (const path of ['./HomeProfileScreen.tsx', './ServiceProfileScreen.tsx']) {
    const screen = readFileSync(file(path), 'utf8');
    expect(screen.includes('profileServerErrors')).toBe(true);
    expect(screen.includes('accessibilityLiveRegion="polite"')).toBe(true);
  }
});
it('editors usan estado dirty/rebase y confirmación versionada sin ampliar PATCH', () => {
  for (const path of ['./HomeProfileScreen.tsx', './ServiceProfileScreen.tsx']) {
    const screen = readFileSync(file(path), 'utf8');
    expect(screen).toContain('useEditableDraft(');
    expect(screen).toContain('editor.begin()');
    expect(screen).toContain('editor.confirm(');
    expect(screen).toContain('editor.end()');
    expect(screen).toContain('|| !changed) return');
    expect(screen).toContain('disabled={disabled || !changed}');
    expect(screen).toContain('key={`${epoch}:${homeId}`}');
  }
  const home = readFileSync(file('./HomeProfileScreen.tsx'), 'utf8');
  expect(home).toContain('profilePatch(draft, editor.state.baseline)');
  expect(home).toContain('mutation.mutateAsync(payload)');
  expect(home).not.toContain('mutation.mutateAsync(profilePayload(');
  const hooks = readFileSync(file('./hooks.ts'), 'utf8');
  expect(hooks).toContain('input: ProfilePatch');
  expect(hooks).toContain('read: () => profileApi.getHome(homeId)');
  expect(hooks).toContain('read: () => profileApi.getContract(homeId)');
  expect(hooks).toContain('authSession.checkEpoch(epoch)');
  expect(hooks).toContain('useSession.getState().selectedHomeId !== homeId');
});
it('Perfil accesible desde Inicio sin sexta pestaña ni sustituir el piloto', () => {
  const nav = readFileSync(file('../../navigation/AppNavigator.tsx'), 'utf8');
  expect(nav.includes('profile-entry')).toBe(true);
  expect(nav.includes('<Stack.Screen name="Profile"')).toBe(true);
  expect(nav.includes('<Stack.Screen name="HomeProfile"')).toBe(true);
  expect(nav.includes('<Stack.Screen name="ServiceProfile"')).toBe(true);
  expect((nav.match(/<Tab.Screen/g) ?? []).length).toBe(5);
  expect(nav.includes('if (!AUTH_ENABLED) return <LegacyApp />')).toBe(true);
});
it('formularios reales con estados, errores locales y guardado confirmado', () => {
  for (const path of ['./ProfileScreen.tsx', './HomeProfileScreen.tsx', './ServiceProfileScreen.tsx', './hooks.ts']) expect(existsSync(file(path))).toBe(true);
  const hooks = readFileSync(file('./hooks.ts'), 'utf8');
  expect(hooks.includes('createAuthenticatedFetch(authSession)')).toBe(true);
  expect(hooks.includes('saveVerified')).toBe(true);
  expect(hooks.includes('retry: false')).toBe(true);
  for (const path of ['./HomeProfileScreen.tsx', './ServiceProfileScreen.tsx']) {
    const screen = readFileSync(file(path), 'utf8');
    expect(screen.includes('describeError')).toBe(true);
    expect(screen.includes('isLoading')).toBe(true);
    expect(screen.includes('isEndpointUnavailable')).toBe(true);
    expect(screen.includes('error.message')).toBe(false);
  }
  const profile = readFileSync(file('./ProfileScreen.tsx'), 'utf8');
  expect(profile.includes('No disponible')).toBe(true);
});
