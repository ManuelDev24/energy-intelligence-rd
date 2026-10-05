import { describe, expect, it, vi } from 'vitest';
import { createAuthClient } from './client';
import { createAuthSession, type SecureTokenStore } from './session';

const pair = { access_token: 'access-test', refresh_token: 'refresh-test', token_type: 'bearer' as const, expires_in: 900 };
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'a@b.com', role: 'user', created_at: '2026-10-04T00:00:00Z' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function setup(saved: string | null = null) {
  let value = saved;
  const store: SecureTokenStore = { read: vi.fn(async () => value), write: vi.fn(async (raw) => { value = raw; }), clear: vi.fn(async () => { value = null; }) };
  const fetcher = vi.fn<typeof fetch>();
  const onBoundary = vi.fn();
  const session = createAuthSession({ client: createAuthClient('https://api.test', fetcher), store, origin: 'https://api.test', onBoundary });
  return { session, store, fetcher, onBoundary, stored: () => value };
}

async function authenticated() {
  const context = setup();
  await context.session.hydrate();
  context.fetcher.mockResolvedValueOnce(json(pair)).mockResolvedValueOnce(json(user));
  await context.session.login('a@b.com', 'a'.repeat(12));
  return context;
}
const rotated = { ...pair, access_token: 'rotated-access', refresh_token: 'rotated-refresh' };

describe('secure account session', () => {
  it('revoked/expired refresh requires login without retry or retaining the old pair', async () => {
    const { session, fetcher, stored } = await authenticated();
    fetcher.mockResolvedValueOnce(json({}, 401));
    await expect(session.refreshAccess('access-test')).rejects.toMatchObject({ status: 401 });
    expect(session.getSnapshot().status).toBe('signedOut');
    expect(stored()).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('cannot authenticate if storing the issued pair fails; revokes that issued session', async () => {
    const { session, fetcher, store } = setup();
    await session.hydrate();
    vi.mocked(store.write).mockRejectedValueOnce(new Error('locked'));
    fetcher.mockResolvedValueOnce(json(pair)).mockResolvedValueOnce(json(user)).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(session.register('a@b.com', 'a'.repeat(12))).rejects.toMatchObject({ status: 0 });
    expect(session.getSnapshot().status).toBe('signedOut');
    expect(fetcher.mock.calls[2][0]).toContain('/logout');
  });
  it('fresh login is not tied to a previous account refresh still in flight after logout', async () => {
    const { session, fetcher, stored } = await authenticated();
    let resolve!: (value: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const pending = session.refreshAccess('access-test');
    const oldFailure = expect(pending).rejects.toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await session.logout();
    fetcher.mockResolvedValueOnce(json(rotated)).mockResolvedValueOnce(json({ ...user, id: '22222222-2222-4222-8222-222222222222' }));
    await session.login('another@b.com', 'a'.repeat(12));
    expect(await session.getAccessToken()).toBe('rotated-access');
    fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
    resolve(json(pair));
    await oldFailure;
    expect(session.getSnapshot()).toMatchObject({ status: 'authenticated', user: { id: '22222222-2222-4222-8222-222222222222' } });
    expect(JSON.parse(stored()!).pair).toEqual(rotated);
  });
  it('rotates once for concurrent requests and never replays a consumed token for a late 401', async () => {
    const { session, fetcher, stored } = await authenticated();
    fetcher.mockResolvedValueOnce(json(rotated));
    const access = await Promise.all(Array.from({ length: 8 }, () => session.refreshAccess('access-test')));
    expect(access).toEqual(Array(8).fill('rotated-access'));
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(await session.refreshAccess('access-test')).toBe('rotated-access');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.parse(stored()!).pair).toEqual(rotated);
  });
  it('removes persisted old pair BEFORE refresh and requires login after ambiguous network failure without retry', async () => {
    const { session, fetcher, stored } = await authenticated();
    fetcher.mockImplementationOnce(async () => { expect(stored()).toBeNull(); throw new TypeError('network'); });
    await expect(session.refreshAccess('access-test')).rejects.toMatchObject({ status: 401 });
    await expect(session.getAccessToken()).rejects.toMatchObject({ status: 401 });
    await expect(session.refreshAccess('access-test')).rejects.toMatchObject({ status: 401 });
    expect(session.getSnapshot().status).toBe('signedOut');
    expect(stored()).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('single-flights hydration, rotates saved token, validates me and never restores a pilot home', async () => {
    const { session, fetcher, onBoundary } = setup(JSON.stringify({ origin: 'https://api.test', pair }));
    fetcher.mockResolvedValueOnce(json(rotated)).mockResolvedValueOnce(json(user));
    await Promise.all([session.hydrate(), session.hydrate()]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot()).toMatchObject({ status: 'authenticated', user });
    expect(onBoundary).toHaveBeenCalledTimes(1);
  });
  it.each(['corrupt', JSON.stringify({ origin: 'https://another.test', pair })])('discards unreadable or origin-mismatched saved sessions', async (saved) => {
    const { session, fetcher, stored } = setup(saved);
    await session.hydrate();
    expect(session.getSnapshot().status).toBe('signedOut');
    expect(fetcher).not.toHaveBeenCalled();
    expect(stored()).toBeNull();
  });
  it('never refreshes when secure deletion fails; no unhandled hydration rejection', async () => {
    const { session, fetcher, store } = setup(JSON.stringify({ origin: 'https://api.test', pair }));
    vi.mocked(store.clear).mockRejectedValue(new Error('locked'));
    await session.hydrate();
    expect(session.getSnapshot().status).toBe('signedOut');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('logout revokes the server session, clears secure tokens and publishes boundary before waiting on network', async () => {
    const { session, fetcher, stored, onBoundary } = await authenticated();
    fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const logout = session.logout();
    expect(session.getSnapshot().status).toBe('busy');
    expect(session.getSnapshot().user).toBeNull();
    await logout;
    expect(session.getSnapshot().status).toBe('signedOut');
    expect(stored()).toBeNull();
    expect(onBoundary).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetcher.mock.calls[2][1]!.body as string)).toEqual({ refresh_token: 'refresh-test' });
  });
  it('reports that remote logout could not be confirmed while still clearing local session', async () => {
    const { session, fetcher, stored } = await authenticated();
    fetcher.mockRejectedValueOnce(new TypeError('network'));
    await session.logout();
    expect(stored()).toBeNull();
    expect(session.getSnapshot()).toMatchObject({ status: 'signedOut', message: expect.stringContaining('servidor') });
  });
  it('logout racing refresh cannot restore tokens or identity', async () => {
    const { session, fetcher, stored } = await authenticated();
    let resolve!: (value: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const refresh = session.refreshAccess('access-test');
    const assertion = expect(refresh).rejects.toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    fetcher.mockResolvedValue(new Response(null, { status: 204 }));
    const logout = session.logout();
    resolve(json(rotated));
    await Promise.all([logout, assertion]);
    expect(stored()).toBeNull();
    expect(session.getSnapshot().status).toBe('signedOut');
  });
  // Logout lands N microtasks after the issued pair hits SecureStore: across every interleaving the
  // stale login/hydration must never publish identity or keep tokens after the logout boundary.
  const settle = async () => { for (let i = 0; i < 50; i += 1) await Promise.resolve(); };
  it.each(Array.from({ length: 25 }, (_, ticks) => ticks))('logout %i microtasks after login saved the pair never resurrects identity', async (ticks) => {
    const { session, fetcher, store, stored } = setup();
    await session.hydrate();
    const statuses: string[] = [];
    let logout: Promise<void> | null = null;
    const write = vi.mocked(store.write).getMockImplementation()!;
    vi.mocked(store.write).mockImplementationOnce(async (raw) => {
      await write(raw);
      void (async () => {
        for (let i = 0; i < ticks; i += 1) await Promise.resolve();
        session.subscribe(() => statuses.push(session.getSnapshot().status));
        logout = session.logout();
      })();
    });
    fetcher.mockResolvedValueOnce(json(pair)).mockResolvedValueOnce(json(user)).mockResolvedValue(new Response(null, { status: 204 }));
    await session.login('a@b.com', 'a'.repeat(12)).catch(() => undefined);
    await settle();
    await logout;
    expect(statuses).not.toContain('authenticated');
    expect(session.getSnapshot()).toMatchObject({ status: 'signedOut', user: null });
    await expect(session.getAccessToken()).rejects.toMatchObject({ status: 401 });
    expect(stored()).toBeNull();
    const revoked = fetcher.mock.calls.filter(([u]) => String(u).endsWith('/logout')).map(([, init]) => JSON.parse(init!.body as string).refresh_token);
    expect(revoked).toContain('refresh-test');
  });
  it.each(Array.from({ length: 25 }, (_, ticks) => ticks))('logout %i microtasks after hydration saved the rotated pair never resurrects identity', async (ticks) => {
    const { session, fetcher, store, stored } = setup(JSON.stringify({ origin: 'https://api.test', pair }));
    const statuses: string[] = [];
    let logout: Promise<void> | null = null;
    const write = vi.mocked(store.write).getMockImplementation()!;
    vi.mocked(store.write).mockImplementationOnce(async (raw) => {
      await write(raw);
      void (async () => {
        for (let i = 0; i < ticks; i += 1) await Promise.resolve();
        session.subscribe(() => statuses.push(session.getSnapshot().status));
        logout = session.logout();
      })();
    });
    fetcher.mockResolvedValueOnce(json(rotated)).mockResolvedValueOnce(json(user)).mockResolvedValue(new Response(null, { status: 204 }));
    await session.hydrate();
    await settle();
    await logout;
    expect(statuses).not.toContain('authenticated');
    expect(session.getSnapshot()).toMatchObject({ status: 'signedOut', user: null });
    await expect(session.getAccessToken()).rejects.toMatchObject({ status: 401 });
    expect(stored()).toBeNull();
    const revoked = fetcher.mock.calls.filter(([u]) => String(u).endsWith('/logout')).map(([, init]) => JSON.parse(init!.body as string).refresh_token);
    expect(revoked).toContain('rotated-refresh');
  });
  it.each(Array.from({ length: 25 }, (_, ticks) => ticks))('a stale login wipes the pair it saved even when the logout deletion failed (%i microtasks)', async (ticks) => {
    const { session, fetcher, store, stored } = setup();
    await session.hydrate();
    let logout: Promise<void> | null = null;
    const write = vi.mocked(store.write).getMockImplementation()!;
    vi.mocked(store.write).mockImplementationOnce(async (raw) => {
      await write(raw);
      void (async () => {
        for (let i = 0; i < ticks; i += 1) await Promise.resolve();
        vi.mocked(store.clear).mockRejectedValueOnce(new Error('locked'));
        logout = session.logout();
      })();
    });
    fetcher.mockResolvedValueOnce(json(pair)).mockResolvedValueOnce(json(user)).mockResolvedValue(new Response(null, { status: 204 }));
    const outcome = await session.login('a@b.com', 'a'.repeat(12)).then(() => 'completed', () => 'stale');
    await settle();
    await logout;
    expect(session.getSnapshot().status).toBe('signedOut');
    // A login that finished before logout is covered by logout's own storage-failure message.
    if (outcome === 'stale') expect(stored()).toBeNull();
  });
  it('hydrates before publishing identity; login clears old home/cache via a boundary and keeps secrets out of public state', async () => {
    const { session, fetcher, stored, onBoundary } = setup();
    expect(session.getSnapshot().status).toBe('hydrating');
    await session.hydrate();
    expect(session.getSnapshot().status).toBe('signedOut');
    fetcher.mockResolvedValueOnce(json(pair)).mockResolvedValueOnce(json(user));
    await session.login('a@b.com', 'a'.repeat(12));
    expect(session.getSnapshot()).toMatchObject({ status: 'authenticated', user });
    expect(onBoundary).toHaveBeenCalled();
    expect(JSON.parse(stored()!)).toMatchObject({ origin: 'https://api.test', pair });
    expect(JSON.stringify(session.getSnapshot())).not.toContain('refresh-test');
    expect(JSON.stringify(session.getSnapshot())).not.toContain('access-test');
    expect(stored()).not.toContain('aaaaaaaaaaaa');
  });
});
