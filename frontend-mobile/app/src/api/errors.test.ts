import { describe, expect, it, vi } from 'vitest';
import { ApiError, ContractError, createApiClient, retryPolicy } from '@energyrd/api-client';
import { createHomeApi } from './homes';
import { describeError, guardApiErrors } from './errors';

const HOME = '11111111-1111-4111-8111-111111111111';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
// Anything a server/proxy could echo: secrets, markup, stack traces, foreign-language text.
const EVIL = 'Bearer eyJleak <script>x</script> Traceback (most recent call last)';
const leaks = (error: unknown) => JSON.stringify({ m: (error as Error).message, f: (error as ApiError).fieldErrors }).includes('eyJleak');

describe('domain API errors never reach the UI as server-authored text', () => {
  it.each([400, 403, 404, 409, 422, 429, 500, 503])('createHome %i: string detail is replaced by a local Spanish message', async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ detail: EVIL, code: 'conflict' }, status));
    const error = await createHomeApi('https://api.test', fetcher).createHome({ name: 'Casa', distributor: 'EDESUR' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status });
    expect(leaks(error)).toBe(false);
    expect((error as Error).message).toMatch(/[a-záéíóúñ]/i);
  });

  it('createHome 422: only allowlisted fields survive, each with a local message', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ code: 'validation_error', detail: [
      { loc: ['body', 'name'], msg: EVIL }, { loc: ['body', 'owner_id'], msg: EVIL }, { loc: ['body', '__proto__'], msg: EVIL },
    ] }, 422));
    const error = (await createHomeApi('https://api.test', fetcher).createHome({ name: 'Casa', distributor: 'EDESUR' }).catch((e: unknown) => e)) as ApiError;
    expect(leaks(error)).toBe(false);
    expect(Object.keys(error.fieldErrors)).toEqual(['name']);
    expect(error.fieldErrors.name).toMatch(/nombre/i);
  });

  it('shared client: list/get/mutation errors are sanitized; field errors map through the allowlist', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ detail: EVIL }, 500))
      .mockResolvedValueOnce(json({ detail: EVIL, code: 'not_found' }, 404))
      .mockResolvedValueOnce(json({ code: 'validation_error', detail: [{ loc: ['body', 'kwh'], msg: EVIL }, { loc: ['body', 'evil'], msg: EVIL }] }, 422));
    const api = guardApiErrors(createApiClient('https://api.test', fetcher));
    const server = await api.listHomes().catch((e: unknown) => e) as ApiError;
    expect(server).toMatchObject({ status: 500 });
    expect(leaks(server)).toBe(false);
    expect(retryPolicy(0, server)).toBe(true); // 5xx still retried once
    const missing = await api.getDashboard(HOME).catch((e: unknown) => e) as ApiError;
    expect(missing).toMatchObject({ status: 404 });
    expect(leaks(missing)).toBe(false);
    expect(retryPolicy(0, missing)).toBe(false);
    const invalid = await api.createBill(HOME, { period_start: '2026-09-01', period_end: '2026-09-30', kwh: '-1', amount_dop: '10' } as never)
      .catch((e: unknown) => e) as ApiError;
    expect(invalid).toMatchObject({ status: 422 });
    expect(leaks(invalid)).toBe(false);
    expect(Object.keys(invalid.fieldErrors)).toEqual(['kwh']);
    expect(invalid.fieldErrors.kwh).toMatch(/kWh/);
  });

  it('keeps contract errors (no retry) and a meaningful network message', async () => {
    const api = guardApiErrors(createApiClient('https://api.test', vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ unexpected: true }))
      .mockRejectedValueOnce(new TypeError(EVIL))));
    const contract = await api.getDashboard(HOME).catch((e: unknown) => e);
    expect(contract).toBeInstanceOf(ContractError);
    expect(retryPolicy(0, contract)).toBe(false);
    const offline = await api.listHomes().catch((e: unknown) => e);
    expect(offline).toMatchObject({ status: 0 });
    expect(leaks(offline)).toBe(false);
    expect(describeError(offline)).toMatchObject({ offline: true, message: expect.stringMatching(/conectar/) });
  });

  it('ErrorState text: never renders arbitrary Error/ApiError messages', () => {
    expect(describeError(new Error(EVIL)).message).not.toContain('eyJleak');
    expect(describeError(new ApiError(500, EVIL)).message).not.toContain('eyJleak');
    expect(describeError(new ApiError(404, EVIL, { kwh: EVIL })).message).not.toContain('eyJleak');
    expect(describeError('boom')).toEqual({ offline: false, message: 'Ocurrió un error inesperado' });
    expect(describeError(new ApiError(401, EVIL)).message).toBe('La sesión terminó. Inicie sesión de nuevo.');
  });
});
