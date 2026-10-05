import { describe, expect, it, vi } from 'vitest';
import { createAuthClient } from './client';

const accepted = (status = 202) => new Response(JSON.stringify({ status: 'accepted' }), { status });

describe('ERD-AUTH-05 forgotPassword (cliente de auth sin sesión)', () => {
  it('envía POST /auth/password/forgot con el correo normalizado, sin Authorization, y acepta 202', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(accepted());
    await expect(createAuthClient('https://api.test/', fetcher).forgotPassword('  Ana@Example.COM ')).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.test/api/v1/auth/password/forgot');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ email: 'ana@example.com' });
    expect(init.headers.Authorization).toBeUndefined();
  });
  it('valida el correo localmente y no llama a la red', async () => {
    const fetcher = vi.fn();
    const client = createAuthClient('https://api.test', fetcher);
    await expect(client.forgotPassword('no-es-correo')).rejects.toMatchObject({ status: 422, fieldErrors: { email: expect.any(String) } });
    await expect(client.forgotPassword(`${'a'.repeat(250)}@b.co`)).rejects.toMatchObject({ status: 422 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('trata un 2xx distinto de 202 como respuesta inválida (contrato estricto)', async () => {
    const client = createAuthClient('https://api.test', vi.fn().mockResolvedValue(accepted(200)));
    await expect(client.forgotPassword('a@b.com')).rejects.toMatchObject({ status: 502 });
  });
  it('propaga 429 con su estado y nunca el detalle del servidor', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'secret upstream echo', code: 'rate_limited' }), { status: 429, headers: { 'Retry-After': '60' } }));
    const failure = await createAuthClient('https://api.test', fetcher).forgotPassword('a@b.com').catch((e) => e);
    expect(failure).toMatchObject({ status: 429 });
    expect(failure.message).not.toContain('secret');
  });
  it('error de red → estado 0', async () => {
    const client = createAuthClient('https://api.test', vi.fn().mockRejectedValue(new TypeError('Network request failed')));
    await expect(client.forgotPassword('a@b.com')).rejects.toMatchObject({ status: 0 });
  });
});
