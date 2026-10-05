import { randomUUID, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createApiClient } from '@energyrd/api-client';
import { createAuthClient } from '../auth/client';
import { createAuthSession } from '../auth/session';
import { createAuthenticatedFetch } from '../auth/transport';
import { createHomeApi } from '../api/homes';

const url = process.env.AUTH_E2E_API_URL;
// Test-only local API specified by the owner. Never run against a pilot/production URL.
if (url && !['http://127.0.0.1:8011', 'http://localhost:8011'].includes(url))
  throw new Error('AUTH_E2E_API_URL must identify the dedicated localhost:8011 integration API.');

(url ? describe : describe.skip)('authenticated mobile transport against dedicated PostgreSQL API', () => {
  it('registers an empty account, creates/selects its own home, logs in, rotates, logs out and enforces isolation', async () => {
    const client = createAuthClient(url!);
    let persisted: string | null = null;
    let selected: string | null = 'old-pilot';
    const session = createAuthSession({ client, origin: url!, store: {
      read: async () => persisted, write: async (raw) => { persisted = raw; }, clear: async () => { persisted = null; },
    }, onBoundary: () => { selected = null; } });
    const transport = createAuthenticatedFetch(session);
    const api = createApiClient(url!, transport);
    const homes = createHomeApi(url!, transport);
    // Generate ephemeral credentials in memory; no output, file or log contains them.
    const email = `mobile-auth-${randomUUID()}@example.com`;
    const password = randomBytes(24).toString('base64url');
    let createdHome: string | null = null;
    let outsiderRefresh: string | null = null;
    try {
      await session.hydrate();
      await session.register(email, password);
      expect(session.getSnapshot().user?.email).toBe(email);
      expect(selected).toBeNull();
      expect(await api.listHomes()).toEqual([]);
      const own = await homes.createHome({ name: 'Mobile integration test', distributor: 'EDESUR' });
      createdHome = own.id;
      expect((await api.listHomes()).map((home) => home.id)).toEqual([own.id]);
      selected = own.id;
      expect((await api.getDashboard(selected)).home.id).toBe(selected);
      const oldAccess = await session.getAccessToken();
      await session.refreshAccess(oldAccess);
      expect((await session.getAccessToken()) !== oldAccess).toBe(true);
      const outsider = await client.register(`mobile-isolation-${randomUUID()}@example.com`, password);
      outsiderRefresh = outsider.refresh_token;
      const denied = await fetch(`${url}/api/v1/homes/${own.id}/dashboard`, { headers: { Authorization: `Bearer ${outsider.access_token}` } });
      expect(denied.status).toBe(404);
      const currentAccess = await session.getAccessToken();
      await session.logout();
      expect(selected).toBeNull();
      expect(persisted).toBeNull();
      await expect(client.me(currentAccess)).rejects.toMatchObject({ status: 401 });
      await session.login(email, password);
      expect(selected).toBeNull();
      expect((await api.listHomes()).map((home) => home.id)).toEqual([own.id]);
      const cleanup = await transport(`${url}/api/v1/homes/${createdHome}`, { method: 'DELETE' });
      expect(cleanup.status).toBe(204);
      createdHome = null;
      expect(await api.listHomes()).toEqual([]);
      await session.logout();
    } finally {
      if (createdHome && session.getSnapshot().status === 'authenticated')
        await transport(`${url}/api/v1/homes/${createdHome}`, { method: 'DELETE' });
      if (session.getSnapshot().status === 'authenticated') await session.logout();
      if (outsiderRefresh) await client.logout(outsiderRefresh);
      // No account-erasure endpoint exists. Only these test accounts remain in the test DB.
    }
  }, 30_000);
});
