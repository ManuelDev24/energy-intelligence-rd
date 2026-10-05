import { describe, expect, it } from 'vitest';
import { UserOutSchema, TokensOutSchema } from './index';

describe('generated auth response contracts', () => {
  it('accepts an API user and rejects unsupported roles', () => {
    const user = { id: '00000000-0000-4000-8000-000000000001', email: 'contract@example.com', role: 'user', created_at: '2026-10-04T00:00:00Z' };
    expect(UserOutSchema.safeParse(user).success).toBe(true);
    expect(UserOutSchema.safeParse({ ...user, role: 'superuser' }).success).toBe(false);
  });
  it('requires the complete token pair and bearer type', () => {
    const pair = { access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 900 };
    expect(TokensOutSchema.safeParse(pair).success).toBe(true);
    expect(TokensOutSchema.safeParse({ ...pair, token_type: 'basic' }).success).toBe(false);
    const { refresh_token: omitted, ...incomplete } = pair;
    expect(omitted).toBe('test-refresh');
    expect(TokensOutSchema.safeParse(incomplete).success).toBe(false);
  });
});
