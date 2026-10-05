import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { retryPolicy } from '@energyrd/api-client';
import { createOnboardingApi } from '../../api/onboarding';
import { API_URL, AUTH_ENABLED } from '../../config';
import { authSession, useAuth } from '../../auth/runtime';
import { createAuthenticatedFetch } from '../../auth/transport';
import { useSession } from '../../store/session';
import { homeProfileInvalidations, profileKeys } from './keys';
import { saveVerified } from './saveVerified';
import type { ProfilePatch } from './model';
const profileApi = createOnboardingApi(API_URL, AUTH_ENABLED ? createAuthenticatedFetch(authSession) : fetch);
export function useProfileScope() {
  const account = useAuth();
  const scope = AUTH_ENABLED ? ['account', account.epoch] : ['pilot'];
  return { scope, enabled: !AUTH_ENABLED || account.status === 'authenticated', epoch: account.epoch };
}
export function useProfileHome(homeId: string | null) {
  const { scope, enabled } = useProfileScope();
  return useQuery({ queryKey: profileKeys(scope).home(homeId ?? 'none'), queryFn: () => profileApi.getHome(homeId!), enabled: enabled && !!homeId, retry: retryPolicy });
}
export function useHomeContract(homeId: string | null) {
  const { scope, enabled } = useProfileScope();
  return useQuery({ queryKey: profileKeys(scope).contract(homeId ?? 'none'), queryFn: () => profileApi.getContract(homeId!), enabled: enabled && !!homeId, retry: retryPolicy });
}
function useProfileWriter(homeId: string) {
  const { scope, epoch } = useProfileScope();
  const qc = useQueryClient();
  const check = () => {
    if (AUTH_ENABLED) authSession.checkEpoch(epoch);
    if (useSession.getState().selectedHomeId !== homeId) throw new Error('Vivienda cambiada');
  };
  return { scope, qc, check };
}
export function useSaveHomeProfile(homeId: string) {
  const { scope, qc, check } = useProfileWriter(homeId);
  return useMutation({ retry: false, mutationFn: (input: ProfilePatch) => saveVerified({
    check, write: () => profileApi.updateHome(homeId, input), read: () => profileApi.getHome(homeId),
    publish: home => {
      qc.setQueryData(profileKeys(scope).home(homeId), home);
      for (const key of homeProfileInvalidations(scope, homeId)) void qc.invalidateQueries({ queryKey: key });
    },
  }) });
}
export function useSaveHomeContract(homeId: string) {
  const { scope, qc, check } = useProfileWriter(homeId);
  return useMutation({ retry: false, mutationFn: (number: string) => saveVerified({
    check, write: () => profileApi.putContract(homeId, number), read: () => profileApi.getContract(homeId),
    publish: contract => { qc.setQueryData(profileKeys(scope).contract(homeId), contract); void qc.invalidateQueries({ queryKey: profileKeys(scope).contract(homeId) }); },
  }) });
}
