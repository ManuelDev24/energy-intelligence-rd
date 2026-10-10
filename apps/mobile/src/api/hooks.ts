import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api } from './client';
import { authSession } from '../auth/runtime';
import { AUTH_ENABLED } from '../config';
import { retryPolicy } from '@energyrd/api-client';
export { retryPolicy } from '@energyrd/api-client';
import type { AlertStatus, BillInput, EquipmentInput } from './types';
import type { GoalInput, Granularity, ReadingInput } from '@energyrd/api-contracts';
import { billInvalidations, goalInvalidations, phase2Keys, readingInvalidations } from './phase2Keys';

const scope = () => AUTH_ENABLED ? ['account', authSession.getSnapshot().epoch] : ['pilot'];
const allowed = () => !AUTH_ENABLED || authSession.getSnapshot().status === 'authenticated';
export const keys = {
  get homes() { return [...scope(), 'homes'] as const; },
  bills: (homeId: string) => [...scope(), 'bills', homeId] as const,
  dashboard: (homeId: string) => [...scope(), 'dashboard', homeId] as const,
  anomalies: (homeId: string, granularity: 'day' | 'month') => [...scope(), 'anomalies', homeId, granularity] as const,
  equipment: (homeId: string) => [...scope(), 'equipment', homeId] as const,
  equipmentItem: (homeId: string, id: string) => [...scope(), 'equipment', homeId, id] as const,
  estimate: (homeId: string) => [...scope(), 'estimate', homeId] as const,
  alerts: (homeId: string) => [...scope(), 'alerts', homeId] as const,
  /** Fase 2: lecturas, consumo, meta y progreso (mismo alcance por cuenta). */
  get phase2() { return phase2Keys(scope()); },
};

const perHome = <T,>(key: readonly unknown[], homeId: string | null, fn: (id: string, signal?: AbortSignal) => Promise<T>) => ({
  queryKey: key,
  queryFn: ({ signal }: { signal: AbortSignal }) => fn(homeId as string, signal),
  enabled: allowed() && !!homeId,
  retry: retryPolicy,
});

export const useHomes = () => useQuery({ queryKey: keys.homes, queryFn: ({ signal }) => api.listHomes(signal), enabled: allowed(), retry: retryPolicy });
export const useBills = (homeId: string | null) =>
  useQuery(perHome(keys.bills(homeId ?? 'none'), homeId, api.listBills));
export const useDashboard = (homeId: string | null) =>
  useQuery(perHome(keys.dashboard(homeId ?? 'none'), homeId, api.getDashboard));
export const useAnomalies = (homeId: string | null, granularity: 'day' | 'month' = 'month') =>
  useQuery(perHome(keys.anomalies(homeId ?? 'none', granularity), homeId, (id, signal) => api.listAnomalies(id, granularity, signal)));
export const useEquipment = (homeId: string | null) =>
  useQuery(perHome(keys.equipment(homeId ?? 'none'), homeId, api.listEquipment));
export const useEstimate = (homeId: string | null) =>
  useQuery(perHome(keys.estimate(homeId ?? 'none'), homeId, api.getEstimate));
export const useAlerts = (homeId: string | null) =>
  useQuery(perHome(keys.alerts(homeId ?? 'none'), homeId, (id, signal) => api.listAlerts(id, undefined, signal)));

export const useEquipmentItem = (homeId: string | null, id: string | undefined) =>
  useQuery({
    queryKey: keys.equipmentItem(homeId ?? 'none', id ?? 'new'),
    queryFn: ({ signal }) => api.getEquipment(homeId as string, id as string, signal),
    enabled: allowed() && !!homeId && !!id,
    retry: retryPolicy,
  });

/** Facturas afectan historial, dashboard, alertas (se recalculan) y cobertura del estimado. Solo de ESA vivienda. */
function invalidateBillData(qc: QueryClient, homeId: string) {
  for (const k of [keys.bills(homeId), keys.dashboard(homeId), keys.alerts(homeId), keys.estimate(homeId), ...billInvalidations(keys.phase2, homeId)])
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

// ── Fase 2: lecturas del medidor, consumo, meta mensual ──────────────────────────────────────────
export const useReadings = (homeId: string | null) =>
  useQuery(perHome(keys.phase2.readings(homeId ?? 'none'), homeId, api.listReadings));

export const useConsumption = (homeId: string | null, granularity: Granularity, from: string, to: string) =>
  useQuery({
    ...perHome(keys.phase2.consumption(homeId ?? 'none', granularity, from, to), homeId,
      (id, signal) => api.getConsumption(id, { granularity, from, to }, signal)),
    // Al cambiar de rango no parpadea a vacío; solo se reutiliza el dato de la MISMA cuenta y vivienda.
    placeholderData: (previous, previousQuery) => {
      const prefix = keys.phase2.consumptionAll(homeId ?? 'none');
      return previousQuery && prefix.every((p, i) => Object.is(previousQuery.queryKey[i], p)) ? previous : undefined;
    },
  });

export const useGoal = (homeId: string | null) =>
  useQuery(perHome(keys.phase2.goal(homeId ?? 'none'), homeId, api.getGoal));

/** Progreso del mes. Con la API piloto (sin Fase 2) responde 404: el dashboard lo muestra como no disponible. */
export const useGoalProgress = (homeId: string | null) =>
  useQuery(perHome(keys.phase2.goalProgress(homeId ?? 'none'), homeId, (id, signal) => api.getGoalProgress(id, undefined, signal)));

function invalidateAll(qc: QueryClient, list: readonly (readonly unknown[])[]) {
  for (const k of list) void qc.invalidateQueries({ queryKey: k });
}

export function useCreateReading(homeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReadingInput) => api.createReading(homeId, input),
    onSuccess: () => invalidateAll(qc, readingInvalidations(keys.phase2, homeId)),
  });
}

export function useDeleteReading(homeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (readingId: string) => api.deleteReading(homeId, readingId),
    onSuccess: () => invalidateAll(qc, readingInvalidations(keys.phase2, homeId)),
  });
}

export function useSaveGoal(homeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GoalInput) => api.putGoal(homeId, input),
    onSuccess: () => invalidateAll(qc, goalInvalidations(keys.phase2, homeId)),
  });
}
