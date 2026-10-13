import type { Home } from '../../api/types';
import { ApiError } from '@energyrd/api-client';
import { sanitizeApiError } from '../../api/errors';
import { buildOnboardingPayload, initialOnboardingDraft, validateOnboardingStep, type OnboardingDraft, type OnboardingErrors } from '../homes/onboardingModel';

export type ProfileDraft = OnboardingDraft & { address: string; city: string };
export function profileDraft(home: Home): ProfileDraft {
  return { ...initialOnboardingDraft, name: home.name, distributor: home.distributor,
    province: home.province ?? '', municipality: home.municipality ?? '', sector: home.sector ?? '',
    userType: home.user_type ?? '', occupants: home.occupants === null ? '' : String(home.occupants),
    hasAc: home.has_ac, hasWaterHeater: home.has_water_heater, hasPool: home.has_pool,
    hasSolar: home.has_solar, hasInverter: home.has_inverter, address: home.address ?? '', city: home.city ?? '',
  };
}
export function validateProfile(draft: ProfileDraft): OnboardingErrors & { address?: string; city?: string } {
  // Same boundaries as onboarding; nullable existing homes may retain unknown location/type.
  const optional = { ...draft, province: draft.province.trim() || '_', municipality: draft.municipality.trim() || '_', userType: draft.userType.trim() || '_' };
  return { ...validateOnboardingStep(0, optional), ...validateOnboardingStep(1, optional),
    ...validateOnboardingStep(2, optional), ...validateOnboardingStep(3, optional),
    ...(Array.from(draft.address.trim()).length > 255 ? { address: 'Máximo 255 caracteres.' } : {}),
    ...(Array.from(draft.city.trim()).length > 120 ? { city: 'Máximo 120 caracteres.' } : {}) };
}
export function profileServerErrors(error: unknown): ReturnType<typeof validateProfile> {
  const safe = sanitizeApiError(error);
  if (!(safe instanceof ApiError)) return {};
  const fields: Record<string, string> = {};
  const names: Record<string, string> = { user_type: 'userType', account_number: 'accountNumber', has_ac: 'hasAc', has_water_heater: 'hasWaterHeater', has_pool: 'hasPool', has_solar: 'hasSolar', has_inverter: 'hasInverter' };
  for (const [key, value] of Object.entries(safe.fieldErrors)) fields[names[key] ?? key] = value;
  return fields;
}

export type ProfilePatch = Partial<ReturnType<typeof profilePayload>>;
export function profilePatch(draft: ProfileDraft, baseline: ProfileDraft): ProfilePatch {
  const value = profilePayload(draft);
  const previous = profilePayload(baseline);
  return Object.fromEntries(Object.entries(value).filter(([key, field]) => !Object.is(field, previous[key as keyof typeof previous])));
}
export function profilePayload(draft: ProfileDraft) {
  return { ...buildOnboardingPayload(draft).home, province: draft.province.trim() || null,
    municipality: draft.municipality.trim() || null, user_type: draft.userType.trim() || null,
    address: draft.address.trim() || null, city: draft.city.trim() || null };
}
