import type { GoalInput } from '@energyrd/api-contracts';
import type { OnboardingHomeInput } from '../../api/onboarding';
import { buildOnboardingPayload, validateOnboardingStep, type OnboardingDraft } from './onboardingModel';
import { localApiError } from '../../api/errors';

type Api = { updateHome?: (id: string, input: OnboardingHomeInput) => Promise<unknown>; createHome: (input: OnboardingHomeInput) => Promise<{ id: string }>; putContract: (id: string, number: string) => Promise<unknown>; putGoal: (id: string, goal: GoalInput) => Promise<unknown> };
export async function saveOnboarding(
  draft: OnboardingDraft, api: Api,
  options: { homeId?: string | null; checkSession?: () => void; onCreated?: (id: string) => void; onComplete?: (id: string) => void } = {},
): Promise<string> {
  options.checkSession?.();
  for (let step = 0; step < 5; step++) {
    const errors = validateOnboardingStep(step, draft);
    if (Object.keys(errors).length) throw localApiError(422, 'Revise los campos indicados.');
  }
  const payload = buildOnboardingPayload(draft);
  let id = options.homeId;
  if (!id) {
    const created = await api.createHome(payload.home);
    id = created.id;
    options.checkSession?.();
    options.onCreated?.(id);
  } else if (api.updateHome) {
    await api.updateHome(id, payload.home);
    options.checkSession?.();
  }
  options.checkSession?.();
  if (payload.accountNumber) { await api.putContract(id, payload.accountNumber); options.checkSession?.(); }
  if (payload.goal) { await api.putGoal(id, payload.goal); options.checkSession?.(); }
  options.onComplete?.(id);
  return id;
}
