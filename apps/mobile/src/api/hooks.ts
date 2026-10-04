import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api, ApiError } from './client';
import type { AlertStatus, BillInput, EquipmentInput } from './types';

export const keys = {
  homes: ['homes'] as const,
  bills: (homeId: string) => ['bills', homeId] as const,
  dashboard: (homeId: string) => ['dashboard', homeId] as const,
  equipment: (homeId: string) => ['equipment', homeId] as const,
  equipmentItem: (homeId: string, id: string) => ['equipment', homeId, id] as const,
  estimate: (homeId: string) => ['estimate', homeId] as const,
  alerts: (homeId: string) => ['alerts', homeId] as const,
};

// No reintentar errores 4xx (son definitivos); sí reintentar una vez fallos de red/5xx.
export const retryPolicy = (count: number, err: unknown) =>
  !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 1;

const perHome = <T,>(key: readonly unknown[], homeId: string | null, fn: (id: string) => Promise<T>) => ({
  queryKey: key,
  queryFn: () => fn(homeId as string),
  enabled: !!homeId,
  retry: retryPolicy,
});

export const useHomes = () => useQuery({ queryKey: keys.homes, queryFn: api.listHomes, retry: retryPolicy });
export const useBills = (homeId: string | null) =>
  useQuery(perHome(keys.bills(homeId ?? 'none'), homeId, api.listBills));
export const useDashboard = (homeId: string | null) =>
  useQuery(perHome(keys.dashboard(homeId ?? 'none'), homeId, api.getDashboard));
export const useEquipment = (homeId: string | null) =>
  useQuery(perHome(keys.equipment(homeId ?? 'none'), homeId, api.listEquipment));
export const useEstimate = (homeId: string | null) =>
  useQuery(perHome(keys.estimate(homeId ?? 'none'), homeId, api.getEstimate));
export const useAlerts = (homeId: string | null) =>
  useQuery(perHome(keys.alerts(homeId ?? 'none'), homeId, api.listAlerts));

export const useEquipmentItem = (homeId: string | null, id: string | undefined) =>
  useQuery({
    queryKey: keys.equipmentItem(homeId ?? 'none', id ?? 'new'),
    queryFn: () => api.getEquipment(homeId as string, id as string),
    enabled: !!homeId && !!id,
    retry: retryPolicy,
  });

/** Facturas afectan historial, dashboard, alertas (se recalculan) y cobertura del estimado. Solo de ESA vivienda. */
function invalidateBillData(qc: QueryClient, homeId: string) {
  for (const k of [keys.bills(homeId), keys.dashboard(homeId), keys.alerts(homeId), keys.estimate(homeId)])
    void qc.invalidateQueries({ queryKey: k });
}

function invalidateEquipment(qc: QueryClient, homeId: string) {
  void qc.invalidateQueries({ queryKey: keys.equipment(homeId) });
  void qc.invalidateQueries({ queryKey: keys.estimate(homeId) });
}

export function useCreateBill(homeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BillInput) => api.createBill(homeId, input),
    onSuccess: () => invalidateBillData(qc, homeId),
  });
}

export function useDeleteBill(homeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (billId: string) => api.deleteBill(homeId, billId),
    onSuccess: () => invalidateBillData(qc, homeId),
  });
}

export function useSaveEquipment(homeId: string, id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EquipmentInput) =>
      id ? api.updateEquipment(homeId, id, input) : api.createEquipment(homeId, input),
    onSuccess: () => invalidateEquipment(qc, homeId),
  });
}

export function useDeleteEquipment(homeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteEquipment(homeId, id),
    onSuccess: () => invalidateEquipment(qc, homeId),
  });
}

export function useSetAlertStatus(homeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AlertStatus }) => api.setAlertStatus(homeId, id, status),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.alerts(homeId) }),
  });
}
