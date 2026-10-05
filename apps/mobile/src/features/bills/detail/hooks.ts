// React Query del detalle de factura (ERD-BILL-02). Claves por cuenta/vivienda/factura (`keys.ts`);
// el `queryClient.clear()` del cierre de sesión (auth/runtime.ts) y el cambio de época las eliminan.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BillItemsReplace } from '@energyrd/api-contracts';

import { api } from '../../../api/client';
import { retryPolicy } from '../../../api/hooks';
import { authSession, useAuth } from '../../../auth/runtime';
import { AUTH_ENABLED } from '../../../config';
import { useSession } from '../../../store/session';
import { billDetailKeys, billItemsSavedInvalidations } from './keys';
import { ScopeChangedError, saveBillItemsVerified } from './saveItems';

function useBillDetailScope() {
  const account = useAuth();
  const scope = AUTH_ENABLED ? ['account', account.epoch] : ['pilot'];
  return { keys: billDetailKeys(scope), enabled: !AUTH_ENABLED || account.status === 'authenticated', epoch: account.epoch };
}

export function useBillItems(homeId: string | null, billId: string) {
  const { keys, enabled } = useBillDetailScope();
  return useQuery({
    queryKey: keys.items(homeId ?? 'none', billId),
    queryFn: ({ signal }) => api.getBillItems(homeId as string, billId, signal),
    enabled: enabled && !!homeId,
    retry: retryPolicy,
  });
}

/** Revisión de solo lectura (POST /validate sin efectos). Solo corre cuando el usuario la pide. */
export function useBillAssessment(homeId: string | null, billId: string, requested: boolean) {
  const { keys, enabled } = useBillDetailScope();
  return useQuery({
    queryKey: keys.assessment(homeId ?? 'none', billId),
    queryFn: ({ signal }) => api.assessBill(homeId as string, billId, signal),
    enabled: enabled && !!homeId && requested,
    retry: retryPolicy,
  });
}

/** PUT + GET de confirmación; re-verifica cuenta y vivienda tras cada await antes de publicar. */
export function useSaveBillItems(homeId: string, billId: string) {
  const { keys, epoch } = useBillDetailScope();
  const qc = useQueryClient();
  const check = () => {
    if (AUTH_ENABLED && authSession.getSnapshot().epoch !== epoch) throw new ScopeChangedError();
    if (useSession.getState().selectedHomeId !== homeId) throw new ScopeChangedError();
  };
  return useMutation({
    retry: false,
    mutationFn: (input: BillItemsReplace) => saveBillItemsVerified({
      input, check,
      put: (body) => api.putBillItems(homeId, billId, body),
      get: () => api.getBillItems(homeId, billId),
      publish: (value) => {
        qc.setQueryData(keys.items(homeId, billId), value);
      },
      // Tras intentar el PUT, refresca solo esta factura aunque la confirmación falle (revisión R2).
      settled: () => {
        for (const key of billItemsSavedInvalidations(keys, homeId, billId)) void qc.invalidateQueries({ queryKey: key });
      },
    }),
  });
}
