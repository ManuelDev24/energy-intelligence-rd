import { describe, expect, it, vi } from 'vitest';
import { isIdempotencyKey, newIdempotencyKey } from './idempotency';
import { createOnboardingApi } from './onboarding';
import { createHomeApi } from './homes';
import { saveOnboarding } from '../features/homes/saveOnboarding';
import { initialOnboardingDraft } from '../features/homes/onboardingModel';

const HOME = { id: '11111111-1111-4111-8111-111111111111', name: 'Casa', distributor: 'EDESUR', code: null, address: null, city: null, province: null, municipality: null, sector: null, user_type: null, occupants: null, has_ac: null, has_water_heater: null, has_pool: null, has_solar: null, has_inverter: null, created_at: '2026-10-14T10:00:00Z', updated_at: '2026-10-14T10:00:00Z' };
const ok = () => new Response(JSON.stringify(HOME), { status: 201, headers: { 'content-type': 'application/json' } });

describe('clave de idempotencia de «crear vivienda»', () => {
  it('genera UUID v4 válidos y distintos, también sin crypto.randomUUID', () => {
    const a = newIdempotencyKey(), b = newIdempotencyKey();
    expect(isIdempotencyKey(a) && isIdempotencyKey(b) && a !== b).toBe(true);
    const original = (globalThis as { crypto?: unknown }).crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try { expect(isIdempotencyKey(newIdempotencyKey())).toBe(true); } finally { Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true }); }
    expect(isIdempotencyKey('no-es-uuid')).toBe(false);
  });

  it('las dos rutas de creación envían Idempotency-Key solo cuando se les da, y rechazan una clave inválida', async () => {
    const key = newIdempotencyKey();
    const transport = vi.fn(async () => ok());
    await createOnboardingApi('https://api.test', transport as never).createHome({ name: 'Casa', distributor: 'EDESUR' }, key);
    expect((transport.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ 'Idempotency-Key': key });
    await createOnboardingApi('https://api.test', transport as never).createHome({ name: 'Casa', distributor: 'EDESUR' });
    expect((transport.mock.calls[1] as unknown as [string, RequestInit])[1].headers).not.toHaveProperty('Idempotency-Key');
    await createHomeApi('https://api.test', transport as never).createHome({ name: 'Casa', distributor: 'EDESUR' }, key);
    expect((transport.mock.calls[2] as unknown as [string, RequestInit])[1].headers).toMatchObject({ 'Idempotency-Key': key });
    expect(() => createOnboardingApi('https://api.test', transport as never).createHome({ name: 'Casa', distributor: 'EDESUR' }, 'x')).toThrow();
    await expect(createHomeApi('https://api.test', transport as never).createHome({ name: 'Casa', distributor: 'EDESUR' }, 'x')).rejects.toBeDefined();
  });

  it('saveOnboarding reenvía la misma clave en cada reintento hasta que la creación se confirma', async () => {
    const key = newIdempotencyKey();
    const draft = { ...initialOnboardingDraft, name: 'Casa', province: 'Distrito Nacional', municipality: 'Santo Domingo', userType: 'residencial', accountNumber: '123', goalKwh: '200' };
    const createHome = vi.fn().mockRejectedValueOnce(new Error('sin respuesta')).mockResolvedValue({ id: HOME.id });
    const api = { createHome, putContract: vi.fn(), putGoal: vi.fn() };
    await expect(saveOnboarding(draft, api as never, { idempotencyKey: key })).rejects.toThrow();
    await saveOnboarding(draft, api as never, { idempotencyKey: key });
    expect(createHome.mock.calls.map((c) => c[1])).toEqual([key, key]);
  });
});
