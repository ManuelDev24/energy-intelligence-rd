import { ApiError } from '@energyrd/api-client';
import { describe, expect, it } from 'vitest';
import { sanitizeApiError } from './errors';

describe('account deletion error mapping (ERD-AUTH-03)', () => {
  it('maps 403 reauthentication_failed to a local Spanish message, never the upstream detail', () => {
    const raw = new ApiError(403, 'contraseña hash mismatch for user 123', {}, 'reauthentication_failed');
    const safe = sanitizeApiError(raw) as ApiError;
    expect(safe.message).not.toContain('hash');
    expect(safe.message.toLowerCase()).toContain('contraseña');
    expect(safe.code).toBe('reauthentication_failed');
  });
  it('maps 409 ownership_transfer_required to a local Spanish message, never the upstream detail', () => {
    const raw = new ApiError(409, 'home 456 has sole owner 123', {}, 'ownership_transfer_required');
    const safe = sanitizeApiError(raw) as ApiError;
    expect(safe.message).not.toContain('home 456');
    expect(safe.message.toLowerCase()).toContain('propietari');
    expect(safe.code).toBe('ownership_transfer_required');
  });
  it('falls back to the generic status message for unknown codes', () => {
    const raw = new ApiError(409, 'echo', {}, 'some_other_conflict');
    const safe = sanitizeApiError(raw) as ApiError;
    expect(safe.message).not.toBe('echo');
    expect(safe.code).toBeUndefined();
  });
});
