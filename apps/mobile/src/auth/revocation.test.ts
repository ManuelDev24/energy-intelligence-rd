import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '@energyrd/api-client';
import { createAuthClient } from './client';
import { createAuthSession, type SecureTokenStore } from './session';
import { createAuthenticatedFetch } from './transport';

// ERD-AUTH-05: al restablecer la contraseña en la web el servidor revoca todas las sesiones.
// En el móvil, el siguiente 401 de dominio + refresh rechazado debe terminar en un cierre limpio.
const pair = { access_token: 'access-test', refresh_token: 'refresh-test', token_type: 'bearer', expires_in: 900 };
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'a@b.com', role: 'user', created_at: '2026-10-04T00:00:00Z', terms_version: null, terms_accepted_at: null };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const SESSION_ENDED = 'La sesión terminó. Inicie sesión de nuevo.';

function setup(saved: string | null = null) {
  let value = saved;
  const store: SecureTokenStore = { read: vi.fn(async () => value), write: vi.fn(async (raw) => { value = raw; }), clear: vi.fn(async () => { value = null; }) };
  const fetcher = vi.fn<typeof fetch>();
  const onBoundary = vi.fn();
  const session = createAuthSession({ client: createAuthClient('https://api.test', fetcher), store, origin: 'https://api.test', onBoundary });
  return { session, fetcher, onBoundary, stored: () => value };
}
const refreshCalls = (fetcher: ReturnType<typeof vi.fn>) => fetcher.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'));

describe('sesión revocada tras restablecer la contraseña en la web', () => {
  it('401 de dominio + refresh 401 → signedOut con mensaje, almacenamiento limpio, caché reiniciada, sin reintentar el refresh', async () => {
    const ctx = setup();
    await ctx.session.hydrate();
    ctx.fetcher.mockResolvedValueOnce(json(pair)).mockResolvedValueOnce(json(user));
    await ctx.session.login('a@b.com', 'a'.repeat(12));
    const boundaries = ctx.onBoundary.mock.calls.length;
    const api = createApiClient('https://api.test', createAuthenticatedFetch(ctx.session, ctx.fetcher));
    ctx.fetcher.mockResolvedValueOnce(json({ detail: 'session revoked' }, 401)).mockResolvedValueOnce(json({ detail: 'refresh revoked' }, 401));
    await expect(api.listHomes()).rejects.toMatchObject({ status: 401 });
    const snapshot = ctx.session.getSnapshot();
    expect(snapshot).toMatchObject({ status: 'signedOut', user: null, message: SESSION_ENDED });
    expect(JSON.stringify(snapshot)).not.toContain('revoked');
    expect(ctx.stored()).toBeNull();
    expect(ctx.onBoundary.mock.calls.length).toBeGreaterThan(boundaries);
    expect(refreshCalls(ctx.fetcher)).toHaveLength(1);
    // Peticiones posteriores no tocan la red ni reintentan el token consumido.
    const calls = ctx.fetcher.mock.calls.length;
    await expect(api.listHomes()).rejects.toMatchObject({ status: 401 });
    expect(ctx.fetcher.mock.calls.length).toBe(calls);
    // Se puede volver a iniciar sesión con la contraseña nueva.
    ctx.fetcher.mockResolvedValueOnce(json({ ...pair, access_token: 'new-a', refresh_token: 'new-r' })).mockResolvedValueOnce(json(user));
    await ctx.session.login('a@b.com', 'b'.repeat(12));
    expect(ctx.session.getSnapshot()).toMatchObject({ status: 'authenticated', message: null });
  });
  it('al abrir la app con un refresh revocado: signedOut con mensaje y sin reintento', async () => {
    const ctx = setup(JSON.stringify({ origin: 'https://api.test', pair }));
    ctx.fetcher.mockResolvedValueOnce(json({}, 401));
    await ctx.session.hydrate();
    expect(ctx.session.getSnapshot()).toMatchObject({ status: 'signedOut', user: null, message: SESSION_ENDED });
    expect(ctx.stored()).toBeNull();
    expect(refreshCalls(ctx.fetcher)).toHaveLength(1);
  });
  it('acceso caducado + refresh revocado (sin 401 previo) → mismo cierre limpio', async () => {
    let clock = 0;
    let value: string | null = null;
    const fetcher = vi.fn<typeof fetch>();
    const store: SecureTokenStore = { read: async () => value, write: async (raw) => { value = raw; }, clear: async () => { value = null; } };
    const session = createAuthSession({ client: createAuthClient('https://api.test', fetcher), store, origin: 'https://api.test', onBoundary: vi.fn(), now: () => clock });
    await session.hydrate();
    fetcher.mockResolvedValueOnce(json(pair)).mockResolvedValueOnce(json(user));
    await session.login('a@b.com', 'a'.repeat(12));
    clock = 900_000;
    fetcher.mockResolvedValueOnce(json({}, 401));
    await expect(session.getAccessToken()).rejects.toMatchObject({ status: 401 });
    expect(session.getSnapshot()).toMatchObject({ status: 'signedOut', message: SESSION_ENDED });
    expect(value).toBeNull();
  });
});
