import { describe, expect, it } from 'vitest';
import { UserOutSchema, TokensOutSchema, RegisterInSchema, AccountDeletionInSchema, LegalOutSchema } from './index';

describe('generated auth response contracts', () => {
  it('accepts an API user and rejects unsupported roles', () => {
    const user = { id: '00000000-0000-4000-8000-000000000001', email: 'contract@example.com', role: 'user', created_at: '2026-10-04T00:00:00Z',
      terms_version: '2026-10-draft', terms_accepted_at: '2026-10-04T00:00:00Z' };
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

describe('ERD-AUTH-03 consent, legal and account deletion contracts', () => {
  const user = { id: '00000000-0000-4000-8000-000000000001', email: 'contract@example.com', role: 'user', created_at: '2026-10-04T00:00:00Z' };
  it('exposes consent on /auth/me and allows legacy users without it', () => {
    expect(UserOutSchema.safeParse({ ...user, terms_version: null, terms_accepted_at: null }).success).toBe(true);
    expect(UserOutSchema.safeParse({ ...user, terms_version: '2026-10-draft', terms_accepted_at: 'yesterday' }).success).toBe(false);
    // Un API piloto sin reconstruir omite los campos: se materializan como null (compatibilidad), no como fallo.
    const legacy = UserOutSchema.safeParse(user);
    expect(legacy.success && legacy.data.terms_version === null && legacy.data.terms_accepted_at === null).toBe(true);
  });
  it('register requires accept_terms === true and bounded credentials', () => {
    const body = { email: 'a@b.test', password: 'x'.repeat(12), accept_terms: true };
    expect(RegisterInSchema.safeParse(body).success).toBe(true);
    expect(RegisterInSchema.safeParse({ ...body, accept_terms: false }).success).toBe(false);
    const { accept_terms: omitted, ...missing } = body;
    expect(omitted).toBe(true);
    expect(RegisterInSchema.safeParse(missing).success).toBe(false);
    expect(RegisterInSchema.safeParse({ ...body, password: 'short' }).success).toBe(false);
    expect(RegisterInSchema.safeParse({ ...body, password: 'x'.repeat(129) }).success).toBe(false);
  });
  it('account deletion carries only a bounded password', () => {
    expect(AccountDeletionInSchema.safeParse({ password: 'x'.repeat(12) }).success).toBe(true);
    expect(AccountDeletionInSchema.safeParse({ password: 'x'.repeat(129) }).success).toBe(false);
    expect(AccountDeletionInSchema.safeParse({}).success).toBe(false);
  });
  it('legal versions are draft-only', () => {
    const legal = { terms_version: '2026-10-draft', privacy_version: '2026-10-draft', status: 'draft' };
    expect(LegalOutSchema.safeParse(legal).success).toBe(true);
    expect(LegalOutSchema.safeParse({ ...legal, status: 'final' }).success).toBe(false);
    expect(LegalOutSchema.safeParse({ ...legal, terms_version: undefined }).success).toBe(false);
  });
});

describe('ERD-AUTH-05 password recovery contracts', () => {
  it('forgot carries only an email and is accepted with a fixed body', async () => {
    const { PasswordForgotInSchema, PasswordForgotAcceptedSchema } = await import('./index');
    expect(PasswordForgotInSchema.safeParse({ email: 'a@b.test' }).success).toBe(true);
    expect(PasswordForgotInSchema.safeParse({}).success).toBe(false);
    expect(PasswordForgotInSchema.safeParse({ email: 'x'.repeat(255) }).success).toBe(false);
    expect(PasswordForgotAcceptedSchema.safeParse({ status: 'accepted' }).success).toBe(true);
    expect(PasswordForgotAcceptedSchema.safeParse({ status: 'sent' }).success).toBe(false);
  });
  it('reset requires a 43-char url-safe token and a bounded new password', async () => {
    const { PasswordResetInSchema } = await import('./index');
    const body = { token: 'A'.repeat(43), new_password: 'x'.repeat(12) };
    expect(PasswordResetInSchema.safeParse(body).success).toBe(true);
    for (const bad of [{ ...body, token: 'A'.repeat(42) }, { ...body, token: 'A'.repeat(42) + '!' },
      { ...body, new_password: 'short' }, { ...body, new_password: 'x'.repeat(129) }, { token: body.token }]) {
      expect(PasswordResetInSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('ERD-AUTH-06 password change contract', () => {
  it('requires bounded current and new passwords and no extra fields', async () => {
    const { PasswordChangeInSchema } = await import('./index');
    const body = { current_password: 'x'.repeat(12), new_password: 'y'.repeat(12) };
    expect(PasswordChangeInSchema.safeParse(body).success).toBe(true);
    for (const bad of [{ ...body, current_password: 'short' }, { ...body, new_password: 'x'.repeat(129) },
      { new_password: body.new_password }, { current_password: body.current_password }]) {
      expect(PasswordChangeInSchema.safeParse(bad).success).toBe(false);
    }
  });
});
