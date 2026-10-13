import { it, expect, vi } from 'vitest';
import { saveOnboarding } from './saveOnboarding';
import { initialOnboardingDraft } from './onboardingModel';
it('detiene escrituras posteriores cuando cambia la sesión tras crear vivienda', async () => {
  const api = { createHome: vi.fn(async () => ({ id: 'home-1' })), putContract: vi.fn(async () => undefined), putGoal: vi.fn(async () => undefined) };
  await expect(saveOnboarding({ ...initialOnboardingDraft, accountNumber: '123', goalKwh: '100' }, api, { checkSession: () => { throw new Error('Sesión cambiada'); } })).rejects.toThrow('Sesión cambiada');
  expect(api.putContract).not.toHaveBeenCalled();
  expect(api.putGoal).not.toHaveBeenCalled();
});
