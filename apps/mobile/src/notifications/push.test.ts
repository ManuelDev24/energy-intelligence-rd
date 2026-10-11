import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { PUSH_MESSAGES, registerForPush, unregisterPush, type PushDeps } from './push';

const TOKEN = 'ExponentPushToken[abcdefghijklmnopqrstuv]';
const deps = (over: Partial<PushDeps> = {}): PushDeps => ({
  platform: 'android', getPermission: vi.fn().mockResolvedValue('granted'), requestPermission: vi.fn().mockResolvedValue('granted'),
  getToken: vi.fn().mockResolvedValue(TOKEN), register: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined), ...over,
});

describe('registro de push (ERD-ALERT-02)', () => {
  it('con permiso concedido registra el token con su plataforma', async () => {
    const d = deps({ platform: 'ios' });
    expect(await registerForPush(d, { ask: false })).toBe('registered');
    expect(d.register).toHaveBeenCalledWith(TOKEN, 'ios');
    expect(d.requestPermission).not.toHaveBeenCalled();
  });

  it('sin decidir: solo pregunta si la persona lo pidió', async () => {
    const quiet = deps({ getPermission: vi.fn().mockResolvedValue('undetermined') });
    expect(await registerForPush(quiet, { ask: false })).toBe('unavailable');
    expect(quiet.requestPermission).not.toHaveBeenCalled();
    expect(quiet.register).not.toHaveBeenCalled();
    const asked = deps({ getPermission: vi.fn().mockResolvedValue('undetermined') });
    expect(await registerForPush(asked, { ask: true })).toBe('registered');
    expect(asked.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('si deniega el permiso, no registra nada y lo explica', async () => {
    const d = deps({ getPermission: vi.fn().mockResolvedValue('denied') });
    expect(await registerForPush(d, { ask: true })).toBe('denied');
    const refused = deps({ getPermission: vi.fn().mockResolvedValue('undetermined'), requestPermission: vi.fn().mockResolvedValue('denied') });
    expect(await registerForPush(refused, { ask: true })).toBe('denied');
    expect(d.register).not.toHaveBeenCalled();
    expect(PUSH_MESSAGES.denied).toContain('ajustes del teléfono');
  });

  it('sin token (simulador o sin proyecto de EAS) o en la web: no disponible, sin error', async () => {
    expect(await registerForPush(deps({ getToken: vi.fn().mockResolvedValue(null) }), { ask: true })).toBe('unavailable');
    expect(await registerForPush(deps({ platform: 'other' }), { ask: true })).toBe('unavailable');
  });

  it('cualquier fallo se convierte en «error» y nunca lanza', async () => {
    expect(await registerForPush(deps({ getToken: vi.fn().mockRejectedValue(new Error('FCM')) }), { ask: true })).toBe('error');
    expect(await registerForPush(deps({ register: vi.fn().mockRejectedValue(new Error('red')) }), { ask: true })).toBe('error');
  });

  it('al cerrar sesión retira el token una sola vez y tolera fallos', async () => {
    await registerForPush(deps(), { ask: false });
    const remove = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(unregisterPush({ remove })).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledWith(TOKEN);
    await unregisterPush({ remove });
    expect(remove).toHaveBeenCalledTimes(1);          // ya no hay token que retirar
  });

  it('los mensajes son locales y no prometen lo que no se verificó', () => {
    for (const text of Object.values(PUSH_MESSAGES)) expect(text.length).toBeGreaterThan(20);
    expect(PUSH_MESSAGES.unavailable).toContain('correo');
  });
});

describe('integración (estructura)', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  it('se registra al iniciar sesión solo si ya hay permiso, y se retira al cerrarla', () => {
    expect(read('../navigation/AppNavigator.tsx')).toContain('registerForPush(deps, { ask: false })');
    expect(read('../features/auth/AccountSummary.tsx')).toContain('unregisterPush');
  });
  it('activar el interruptor de push pide el permiso y muestra el resultado', () => {
    const screen = read('../features/profile/AccountSettingsScreen.tsx');
    expect(screen).toContain('registerForPush(deps, { ask: true })');
    expect(screen).toContain('PUSH_MESSAGES');
  });
});
