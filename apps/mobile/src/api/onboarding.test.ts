import { describe, expect, it, vi } from 'vitest';
import { createOnboardingApi } from './onboarding';

const id = '11111111-1111-4111-8111-111111111111';
const home = { id, code: null, name: 'Casa', address: null, city: null, distributor: 'EDESUR', created_at: '2026-01-01T00:00:00Z' };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
describe('API onboarding', () => {
  it('serializa PATCH parcial local sin agregar valores untouched ni defaults', async () => {
    const transport = vi.fn(async () => reply(200, home));
    const api = createOnboardingApi('https://example.test', transport as typeof fetch);
    await api.updateHome(id, { name: 'Casa editada' });
    expect(transport.mock.calls[0]).toEqual([`https://example.test/api/v1/homes/${id}`, expect.objectContaining({ method: 'PATCH', body: '{"name":"Casa editada"}' })]);
    await api.updateHome(id, { sector: null, has_ac: null });
    expect(transport.mock.calls[1]).toEqual([`https://example.test/api/v1/homes/${id}`, expect.objectContaining({ method: 'PATCH', body: '{"sector":null,"has_ac":null}' })]);
  });
  it('rechaza respuestas de otra vivienda sin almacenarlas bajo la solicitada', async () => {
    const other = '22222222-2222-4222-8222-222222222222';
    const api = createOnboardingApi('https://example.test', vi.fn(async (url: unknown) => reply(200, String(url).endsWith('/contract') ? { home_id: other, account_number: '123', updated_at: '2026-01-01T00:00:00Z' } : { ...home, id: other })) as typeof fetch);
    await expect(api.getHome(id)).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(api.getContract(id)).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('traduce red fallida a error local sin filtrar texto del transporte', async () => {
    const transport = vi.fn(async () => { throw new TypeError('upstream-private-data'); });
    await expect(createOnboardingApi('https://example.test', transport as typeof fetch).getHome(id)).rejects.toMatchObject({ status: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('acota la espera, aborta y no repite una creación ambigua', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | null | undefined;
      const transport = vi.fn(async (_url: unknown, init?: RequestInit) => { signal = init?.signal; return new Promise<Response>(() => undefined); });
      const promise = createOnboardingApi('https://example.test', transport as typeof fetch).createHome({ name: 'Casa', distributor: 'EDESUR' });
      const settled = promise.then(() => 'unexpected', e => e);
      await vi.advanceTimersByTimeAsync(10000);
      expect(signal?.aborted).toBe(true);
      expect(await settled).toMatchObject({ status: 0 });
      expect(transport).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it('respeta longitud Unicode del contrato y rechaza blanco localmente', async () => {
    const number = '😀'.repeat(120);
    const transport = vi.fn(async () => reply(200, { home_id: id, account_number: number, updated_at: '2026-01-01T00:00:00Z' }));
    const api = createOnboardingApi('https://example.test', transport as typeof fetch);
    expect((await api.putContract(id, number)).account_number).toBe(number);
    expect(() => api.putContract(id, ' ')).toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('lee y edita vivienda y contrato sin POST ni transformar null en false', async () => {
    const requests: { url: string; method: string; body: unknown }[] = [];
    const transport = vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
      return reply(200, url.endsWith('/contract') ? { home_id: id, account_number: '123', updated_at: '2026-01-01T00:00:00Z' } : { ...home, has_ac: null });
    });
    const api = createOnboardingApi('https://example.test', transport as typeof fetch);
    expect((await api.getHome(id)).has_ac).toBeNull();
    await api.updateHome(id, { name: 'Casa', distributor: 'EDESUR', has_ac: null });
    expect((await api.getContract(id)).account_number).toBe('123');
    await api.putContract(id, ' 123 ');
    expect(requests.map(r => r.method)).toEqual(['GET', 'PATCH', 'GET', 'PUT']);
    expect(requests[1].body).toEqual({ name: 'Casa', distributor: 'EDESUR', has_ac: null });
    expect(requests[2].url).toBe(`https://example.test/api/v1/homes/${id}/contract`);
  });
  it('crea vivienda con perfil y guarda contrato y meta en rutas de la vivienda', async () => {
    const requests: { url: string; method: string; body: unknown }[] = [];
    const transport = vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, method: init?.method ?? 'GET', body: JSON.parse(String(init?.body)) });
      if (requests.length === 1) return reply(201, home);
      if (requests.length === 2) return reply(200, { home_id: id, account_number: '123', updated_at: '2026-01-01T00:00:00Z' });
      return reply(200, { home_id: id, monthly_amount_rd: '2000.00', monthly_kwh: null, updated_at: '2026-01-01T00:00:00Z' });
    });
    const api = createOnboardingApi('https://example.test', transport as typeof fetch);
    await api.createHome({ name: 'Casa', distributor: 'EDESUR', province: 'Santo Domingo', user_type: 'residencial' });
    await api.putContract(id, '123');
    await api.putGoal(id, { monthly_amount_rd: '2000', monthly_kwh: null });
    expect(requests).toEqual([
      { url: 'https://example.test/api/v1/homes', method: 'POST', body: { name: 'Casa', distributor: 'EDESUR', province: 'Santo Domingo', user_type: 'residencial' } },
      { url: `https://example.test/api/v1/homes/${id}/contract`, method: 'PUT', body: { account_number: '123' } },
      { url: `https://example.test/api/v1/homes/${id}/goal`, method: 'PUT', body: { monthly_amount_rd: '2000', monthly_kwh: null } },
    ]);
  });
  it('no reintenta una escritura fallida ni devuelve éxito ante 404', async () => {
    const transport = vi.fn(async () => reply(404, { detail: 'Not found' }));
    await expect(createOnboardingApi('https://example.test', transport as typeof fetch).putContract(id, '123')).rejects.toMatchObject({ status: 404 });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
