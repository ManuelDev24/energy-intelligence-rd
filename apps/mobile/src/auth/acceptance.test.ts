import { describe, expect, it } from 'vitest';
import { LEGAL_DRAFT_NOTICE, requiresAcceptance } from './acceptance';

describe('terms acceptance (ERD-AUTH-03)', () => {
  it('blocks registration until the switch is explicitly on', () => {
    expect(requiresAcceptance('register', false)).toBeDefined();
    expect(requiresAcceptance('register', true)).toBeUndefined();
  });
  it('never required for login', () => {
    expect(requiresAcceptance('login', false)).toBeUndefined();
    expect(requiresAcceptance('login', true)).toBeUndefined();
  });
  it('states the terms/privacy text is a draft pending legal review', () => {
    expect(LEGAL_DRAFT_NOTICE).toContain('borrador');
    expect(LEGAL_DRAFT_NOTICE).toContain('revisión legal');
  });
});
