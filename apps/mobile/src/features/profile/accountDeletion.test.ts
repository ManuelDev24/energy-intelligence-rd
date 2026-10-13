import { ApiError } from '@energyrd/api-client';
import { describe, expect, it } from 'vitest';
import {
  canSubmitDeletion, initialDeletionDraft, isOwnershipTransferRequired, isReauthenticationFailed,
  validateDeletionPassword,
} from './accountDeletion';

describe('account deletion (ERD-AUTH-03)', () => {
  it('starts closed with an empty password', () => {
    expect(initialDeletionDraft).toEqual({ step: 'closed', password: '' });
  });
  it('requires a plausible current password before allowing submission', () => {
    expect(validateDeletionPassword('short')).toBeDefined();
    expect(validateDeletionPassword('a'.repeat(129))).toBeDefined();
    expect(validateDeletionPassword('a'.repeat(12))).toBeUndefined();
  });
  it('blocks submit while pending (no double submit) or while invalid', () => {
    expect(canSubmitDeletion('a'.repeat(12), true)).toBe(false);
    expect(canSubmitDeletion('short', false)).toBe(false);
    expect(canSubmitDeletion('a'.repeat(12), false)).toBe(true);
  });
  it('classifies 403 reauthentication_failed and 409 ownership_transfer_required', () => {
    const wrongPassword = new ApiError(403, 'x', {}, 'reauthentication_failed');
    const soleOwner = new ApiError(409, 'x', {}, 'ownership_transfer_required');
    expect(isReauthenticationFailed(wrongPassword)).toBe(true);
    expect(isReauthenticationFailed(soleOwner)).toBe(false);
    expect(isOwnershipTransferRequired(soleOwner)).toBe(true);
    expect(isOwnershipTransferRequired(wrongPassword)).toBe(false);
    expect(isReauthenticationFailed(new Error('other'))).toBe(false);
  });
});
