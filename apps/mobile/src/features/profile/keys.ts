import { phase2Keys } from '../../api/phase2Keys';

export function profileKeys(scope: readonly unknown[]) {
  return {
    home: (id: string) => [...scope, 'profile-home', id] as const,
    contract: (id: string) => [...scope, 'contract', id] as const,
  };
}
export const homeProfileInvalidations = (scope: readonly unknown[], id: string): (readonly unknown[])[] =>
  [profileKeys(scope).home(id), [...scope, 'homes'], [...scope, 'dashboard', id], phase2Keys(scope).goalProgress(id)];
