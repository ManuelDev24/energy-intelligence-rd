// ERD-PROF-01 / ERD-SHARE-01: API móvil de cuenta y de compartir vivienda (transporte falso, sin red).
import { ApiError, ContractError } from '@energyrd/api-client';
import { describe, expect, it, vi } from 'vitest';
import { createAccountApi, parseInvitationLink } from './account';

const HOME = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'A'.repeat(43);
const OLD = 'valid-test-password-123';
const NEW = 'another-new-password-789';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const setup = (response: () => Response | Promise<Response>) => {
  const transport = vi.fn<typeof fetch>(async () => response());
  return { transport, api: createAccountApi('https://api.test/', transport) };
};
const call = (transport: ReturnType<typeof vi.fn<typeof fetch>>) => {
  const [url, init] = transport.mock.calls[0];
  return { url: String(url), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined };
};
const home = { id: HOME, code: null, name: 'Casa', address: null, city: null, distributor: 'EDESUR', created_at: '2026-01-01T00:00:00Z',
  province: null, municipality: null, sector: null, user_type: null, occupants: null, has_ac: null, has_water_heater: null, has_pool: null, has_solar: null, has_inverter: null };

describe('cuenta', () => {
  it('cambia la contraseña y devuelve el par nuevo para que la sesión lo adopte', async () => {
    const pair = { access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 900 };
    const { api, transport } = setup(() => json(pair));
    expect(await api.changePassword(OLD, NEW)).toEqual(pair);
    expect(call(transport)).toEqual({ url: 'https://api.test/api/v1/auth/password/change', method: 'POST', body: { current_password: OLD, new_password: NEW } });
  });
  it.each([['actual corta', 'short', NEW], ['nueva corta', OLD, 'short'], ['nueva igual', OLD, OLD], ['nueva larga', OLD, 'x'.repeat(129)]])(
    'valida %s en el dispositivo sin llamar a la red', async (_n, current, next) => {
      const { api, transport } = setup(() => json({}));
      await expect(api.changePassword(current, next)).rejects.toMatchObject({ status: 422 });
      expect(transport).not.toHaveBeenCalled();
    });
  it('cuenta los puntos de código, no las unidades UTF-16, al medir la contraseña', async () => {
    const emoji = '😀'.repeat(12);                       // 12 puntos de código = 24 unidades UTF-16
    const { api } = setup(() => json({ access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 900 }));
    await expect(api.changePassword(OLD, emoji)).resolves.toBeTruthy();
    await expect(api.changePassword(OLD, '😀'.repeat(11))).rejects.toMatchObject({ status: 422 });
  });
  it('guarda y lee preferencias con booleanos', async () => {
    const prefs = { alerts_email: false, alerts_push: true, updated_at: '2026-10-10T12:00:00Z' };
    const put = setup(() => json(prefs));
    expect(await put.api.savePreferences(false, true)).toEqual(prefs);
    expect(call(put.transport)).toMatchObject({ method: 'PUT', body: { alerts_email: false, alerts_push: true } });
    const get = setup(() => json(prefs));
    await get.api.getPreferences();
    expect(call(get.transport)).toMatchObject({ method: 'GET', url: 'https://api.test/api/v1/auth/me/preferences' });
    expect(get.transport.mock.calls[0][1]?.body).toBeUndefined();
  });
  it('lista, cierra una y cierra las demás sesiones', async () => {
    const s = { id: USER, created_at: '2026-10-10T12:00:00Z', expires_at: '2026-11-09T12:00:00Z', current: false };
    expect(await setup(() => json([s])).api.listSessions()).toEqual([s]);
    const one = setup(() => new Response(null, { status: 204 }));
    expect(await one.api.revokeSession(USER)).toBeUndefined();
    expect(call(one.transport)).toMatchObject({ method: 'DELETE', url: `https://api.test/api/v1/auth/sessions/${USER}` });
    const others = setup(() => new Response(null, { status: 204 }));
    await others.api.revokeOtherSessions();
    expect(call(others.transport)).toMatchObject({ method: 'POST', url: 'https://api.test/api/v1/auth/sessions/revoke-others' });
    await expect(setup(() => json({})).api.revokeSession('no-uuid')).rejects.toMatchObject({ status: 422 });
  });
});

describe('compartir vivienda', () => {
  it('invita normalizando el correo y valida antes de enviar', async () => {
    const invitation = { id: USER, email: 'bob@example.com', created_at: '2026-10-10T12:00:00Z', expires_at: '2026-10-17T12:00:00Z' };
    const { api, transport } = setup(() => json(invitation, 201));
    expect(await api.createInvitation(HOME, ' Bob@Example.com ')).toEqual(invitation);
    expect(call(transport)).toMatchObject({ method: 'POST', url: `https://api.test/api/v1/homes/${HOME}/invitations`, body: { email: 'bob@example.com' } });
    const bad = setup(() => json({}));
    await expect(bad.api.createInvitation(HOME, 'no-es-correo')).rejects.toMatchObject({ status: 422 });
    await expect(bad.api.createInvitation('no-uuid', 'a@b.co')).rejects.toMatchObject({ status: 422 });
    expect(bad.transport).not.toHaveBeenCalled();
  });
  it.each([
    ['listMembers', (a: ReturnType<typeof createAccountApi>) => a.listMembers(HOME), 'GET', `/homes/${HOME}/members`, [{ user_id: USER, email: 'a@b.co', role: 'owner', joined_at: '2026-01-01T00:00:00Z' }]],
    ['listInvitations', (a: ReturnType<typeof createAccountApi>) => a.listInvitations(HOME), 'GET', `/homes/${HOME}/invitations`, []],
  ])('%s valida el contrato', async (_name, run, method, path, value) => {
    const { api, transport } = setup(() => json(value));
    expect(await run(api)).toEqual(value);
    expect(call(transport)).toMatchObject({ method, url: `https://api.test/api/v1${path}` });
  });
  it.each([
    ['revokeInvitation', (a: ReturnType<typeof createAccountApi>) => a.revokeInvitation(HOME, USER), 'DELETE', `/homes/${HOME}/invitations/${USER}`],
    ['removeMember', (a: ReturnType<typeof createAccountApi>) => a.removeMember(HOME, USER), 'DELETE', `/homes/${HOME}/members/${USER}`],
    ['leaveHome', (a: ReturnType<typeof createAccountApi>) => a.leaveHome(HOME), 'DELETE', `/homes/${HOME}/members/me`],
    ['transferOwnership', (a: ReturnType<typeof createAccountApi>) => a.transferOwnership(HOME, USER, OLD), 'POST', `/homes/${HOME}/transfer-ownership`],
  ])('%s responde 204 sin cuerpo', async (_name, run, method, path) => {
    const { api, transport } = setup(() => new Response(null, { status: 204 }));
    expect(await run(api)).toBeUndefined();
    expect(call(transport)).toMatchObject({ method, url: `https://api.test/api/v1${path}` });
  });
  it('transferir exige la contraseña y no sale sin ella', async () => {
    const { api, transport } = setup(() => json({}));
    await expect(api.transferOwnership(HOME, USER, 'corta')).rejects.toMatchObject({ status: 422 });
    expect(transport).not.toHaveBeenCalled();
    const sent = setup(() => new Response(null, { status: 204 }));
    await sent.api.transferOwnership(HOME, USER, OLD);
    expect(call(sent.transport).body).toEqual({ user_id: USER, password: OLD });
  });
  it('acepta una invitación con token válido y devuelve la vivienda', async () => {
    const { api, transport } = setup(() => json(home));
    expect((await api.acceptInvitation(TOKEN)).id).toBe(HOME);
    expect(call(transport)).toMatchObject({ method: 'POST', url: 'https://api.test/api/v1/invitations/accept', body: { token: TOKEN } });
    const bad = setup(() => json(home));
    await expect(bad.api.acceptInvitation('corto')).rejects.toMatchObject({ status: 422 });
    expect(bad.transport).not.toHaveBeenCalled();
  });
});

describe('errores', () => {
  it.each([
    [400, 'invitation_invalid', /no es válida o ha caducado/],
    [409, 'already_member', /ya es integrante/],
    [409, 'invitation_pending', /invitación pendiente/],
    [409, 'ownership_transfer_required', /única propietaria/],
    [403, 'reauthentication_failed', /contraseña no es correcta/],
    [429, 'invitation_rate_limited', /demasiadas invitaciones/i],
  ])('estado %i %s se muestra con texto local y nunca con el del servidor', async (status, code, message) => {
    const { api } = setup(() => json({ detail: 'secreto bob@example.com <script>', code, request_id: 'req-12345678' }, status));
    const error = await api.acceptInvitation(TOKEN).catch((e) => e) as ApiError;
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
    expect(error.message).toMatch(message);
    expect(error.message).not.toContain('secreto');
  });
  it('una respuesta que rompe el contrato es ContractError', async () => {
    const { api } = setup(() => json([{ id: 'x' }]));
    await expect(api.listSessions()).rejects.toBeInstanceOf(ContractError);
  });
  it('un fallo de red o un tiempo agotado son errores locales de conexión', async () => {
    const down = createAccountApi('https://api.test', vi.fn<typeof fetch>(async () => { throw new TypeError('network'); }));
    await expect(down.listSessions()).rejects.toMatchObject({ status: 0 });
    vi.useFakeTimers();
    try {
      const slow = createAccountApi('https://api.test', vi.fn<typeof fetch>(() => new Promise(() => {})));
      const pending = slow.listSessions().catch((e) => e);
      await vi.advanceTimersByTimeAsync(10_001);
      expect(await pending).toMatchObject({ status: 0 });
    } finally { vi.useRealTimers(); }
  });
});

describe('enlace de invitación', () => {
  it.each([
    [TOKEN, TOKEN],
    [`https://app.energy.example/invitacion#token=${TOKEN}`, TOKEN],
    [`  https://app.energy.example/invitacion#token=${TOKEN}  `, TOKEN],
    ['https://app.energy.example/invitacion', null],
    [`https://x.example/i#token=${TOKEN}&token=${TOKEN}`, null],
    ['https://x.example/i#token=corto', null],
    [`https://x.example/i?token=${TOKEN}`, null],
    ['', null],
  ])('%s', (input, expected) => expect(parseInvitationLink(input)).toBe(expected));
});
