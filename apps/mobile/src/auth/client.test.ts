import { describe, expect, it, vi } from 'vitest';
import { createAuthClient, validateCredentials } from './client';

const pair = { access_token: 'access-test', refresh_token: 'refresh-test', token_type: 'bearer', expires_in: 900 };
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'account@example.com', role: 'user', created_at: '2026-10-04T00:00:00Z' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('auth HTTP contract', () => {
  it('registers with only email/password, reads me using bearer, and logs out using refresh', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(pair, 201)).mockResolvedValueOnce(json(user)).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createAuthClient('https://api.test/', fetcher);
    expect(await client.register(' Account@Example.com ', ' exact-password ')).toEqual(pair);
    expect(fetcher.mock.calls[0][0]).toBe('https://api.test/api/v1/auth/register');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ email: 'account@example.com', password: ' exact-password ' });
    expect(await client.me(pair.access_token)).toEqual(user);
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer access-test');
    await client.logout(pair.refresh_token);
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ refresh_token: 'refresh-test' });
    expect(fetcher.mock.calls[2][1].headers.Authorization).toBeUndefined();
  });
  it('validates lengths without trimming passwords or leaking echoed server detail', async () => {
    expect(validateCredentials('bad', 'short')).toEqual({ email: 'Ingrese un correo válido (máximo 254 caracteres).', password: 'Use entre 12 y 128 caracteres.' });
    expect(validateCredentials('a@b.com', 'a'.repeat(129)).password).toBeDefined();
    expect(validateCredentials('a@b.com', ' '.repeat(12))).toEqual({});
    const fetcher = vi.fn().mockResolvedValue(json({ detail: 'private server echo' }, 401));
    await expect(createAuthClient('https://api.test', fetcher).login('a@b.com', 'a'.repeat(12))).rejects.toMatchObject({ status: 401, message: 'Correo o contraseña incorrectos. Intente de nuevo.' });
  });
  it('rejects malformed token pairs and user responses', async () => {
    const client = createAuthClient('https://api.test', vi.fn().mockResolvedValue(json({ ...pair, token_type: 'basic' })));
    await expect(client.login('a@b.com', 'a'.repeat(12))).rejects.toMatchObject({ status: 502 });
  });
});
