import { describe, expect, it, vi } from 'vitest';
import { saveOnboarding } from './saveOnboarding';
import { initialOnboardingDraft } from './onboardingModel';
const id = '11111111-1111-4111-8111-111111111111';
const draft = { ...initialOnboardingDraft, name: 'Casa', province: 'Distrito Nacional', municipality: 'Santo Domingo', userType: 'residencial', accountNumber: '123', goalKwh: '200' };
it('valida todos los pasos antes de cualquier escritura también al reintentar', async () => {
  const api = { createHome: vi.fn(async () => ({ id })), updateHome: vi.fn(async () => undefined), putContract: vi.fn(async () => undefined), putGoal: vi.fn(async () => undefined) };
  await expect(saveOnboarding({ ...draft, occupants: '0' }, api, { homeId: id })).rejects.toMatchObject({ status: 422 });
  expect(api.createHome).not.toHaveBeenCalled(); expect(api.updateHome).not.toHaveBeenCalled(); expect(api.putContract).not.toHaveBeenCalled(); expect(api.putGoal).not.toHaveBeenCalled();
});
it('reanuda con PATCH de correcciones y relee tras fallar la meta sin otro POST', async () => {
  const calls: string[] = [];
  const api = { createHome: vi.fn(async () => ({ id })), updateHome: vi.fn(async () => { calls.push('patch'); }), putContract: vi.fn(async () => { calls.push('contract'); }), putGoal: vi.fn().mockRejectedValueOnce({ status: 503 }).mockResolvedValue(undefined) };
  let created: string | null = null;
  await expect(saveOnboarding(draft, api, { onCreated: value => { created = value; } })).rejects.toMatchObject({ status: 503 });
  await saveOnboarding({ ...draft, name: 'Casa corregida' }, api, { homeId: created });
  expect(api.createHome).toHaveBeenCalledTimes(1);
  expect(api.updateHome).toHaveBeenCalledWith(id, expect.objectContaining({ name: 'Casa corregida' }));
  expect(calls).toEqual(['contract', 'patch', 'contract']);
});
it('crea perfil, contrato, meta y confirma solo después de terminar', async () => {
  const calls: string[] = [];
  const api = { createHome: vi.fn(async () => { calls.push('home'); return { id }; }), putContract: vi.fn(async () => { calls.push('contract'); }), putGoal: vi.fn(async () => { calls.push('goal'); }) };
  const onComplete = vi.fn(() => calls.push('complete'));
  await saveOnboarding(draft, api, { onCreated: () => calls.push('created'), onComplete });
  expect(calls).toEqual(['home', 'created', 'contract', 'goal', 'complete']);
  expect(api.createHome).toHaveBeenCalledWith(expect.objectContaining({ province: 'Distrito Nacional', user_type: 'residencial' }));
});
it('reanuda pasos pendientes tras 404 sin crear vivienda duplicada ni entrar al panel', async () => {
  const api = { createHome: vi.fn(async () => ({ id })), putContract: vi.fn().mockRejectedValueOnce({ status: 404 }).mockResolvedValue(undefined), putGoal: vi.fn(async () => undefined) };
  const onComplete = vi.fn();
  await expect(saveOnboarding(draft, api, { onComplete })).rejects.toEqual({ status: 404 });
  expect(onComplete).not.toHaveBeenCalled();
  await saveOnboarding(draft, api, { homeId: id, onComplete });
  expect(api.createHome).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledTimes(1);
});
