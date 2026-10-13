import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '@energyrd/api-client';
import { createAuthClient } from './client';
import { createAuthSession } from './session';
import { createAuthenticatedFetch } from './transport';
import { createHomeApi } from '../api/homes';
const pair = { access_token: 'access-test', refresh_token: 'refresh-test', token_type: 'bearer', expires_in: 900 };
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'a@b.com', role: 'user', created_at: '2026-10-04T00:00:00Z', terms_version: '2026-10-01', terms_accepted_at: '2026-10-04T00:00:00Z' };
const home = { id: '22222222-2222-4222-8222-222222222222', code: null, name: 'Mi hogar', city: null, address: null, distributor: 'EDESUR', created_at: '2026-10-04T00:00:00Z' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
async function setup() {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(pair)).mockResolvedValueOnce(json(user));
  const session = createAuthSession({ client: createAuthClient('https://api.test', fetcher), origin: 'https://api.test', store: { read: async () => null, write: async () => {}, clear: async () => {} }, onBoundary: vi.fn() });
  await session.hydrate();
  await session.login('a@b.com', 'a'.repeat(12));
  const transport = createAuthenticatedFetch(session, fetcher);
  return { fetcher, session, transport, api: createApiClient('https://api.test', transport) };
}
describe('typed authenticated domain transport', () => {
  it('sends bearer on typed list and create home; never sends pilot membership/owner fields', async () => {
    const { fetcher, transport, api } = await setup();
    fetcher.mockResolvedValueOnce(json([])).mockResolvedValueOnce(json(home, 201));
    expect(await api.listHomes()).toEqual([]);
    expect(await createHomeApi('https://api.test', transport).createHome({ name: 'Mi hogar', distributor: 'EDESUR' })).toEqual({ ...home, province: null, municipality: null, sector: null, user_type: null, occupants: null, has_ac: null, has_water_heater: null, has_pool: null, has_solar: null, has_inverter: null });
    expect(new Headers(fetcher.mock.calls[2][1]?.headers).get('Authorization')).toBe('Bearer access-test');
    expect(JSON.parse(fetcher.mock.calls[3][1]!.body as string)).toEqual({ name: 'Mi hogar', distributor: 'EDESUR' });
  });
  it('refreshes on domain 401 once; second 401 requires new login', async () => {
    const { fetcher, session, api } = await setup();
    fetcher.mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({ ...pair, access_token: 'new-access', refresh_token: 'new-refresh' })).mockResolvedValueOnce(json({}, 401));
    await expect(api.listHomes()).rejects.toMatchObject({ status: 401 });
    expect(session.getSnapshot().status).toBe('signedOut');
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it('rejects old-account headers/body after logout rather than returning stale personal data to cache', async () => {
    const { fetcher, session, transport } = await setup();
    let resolve!: (value: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const pending = transport('https://api.test/api/v1/homes');
    const assertion = expect(pending).rejects.toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await session.logout();
    resolve(json([home]));
    await assertion;
  });
  it('does not replay domain writes on network ambiguity', async () => {
    const { fetcher, transport } = await setup();
    fetcher.mockRejectedValueOnce(new TypeError('offline'));
    await expect(createHomeApi('https://api.test', transport).createHome({ name: 'Mi hogar', distributor: 'EDESUR' })).rejects.toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
