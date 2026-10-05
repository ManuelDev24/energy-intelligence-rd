import { describe, expect, it } from 'vitest';
import { hasOwnedSelection } from './policy';
describe('account home gate', () => {
  it('cannot open a persisted pilot home when registration returns an empty home list', () => {
    expect(hasOwnedSelection('pilot-home', [])).toBe(false);
    expect(hasOwnedSelection(null, [{ id: 'own-home' }])).toBe(false);
    expect(hasOwnedSelection('pilot-home', [{ id: 'own-home' }])).toBe(false);
    expect(hasOwnedSelection('own-home', [{ id: 'own-home' }])).toBe(true);
  });
});
