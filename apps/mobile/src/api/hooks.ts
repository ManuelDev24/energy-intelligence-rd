import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { BillImage } from '@energyrd/api-client';
import { isOcrActive } from '@energyrd/api-contracts';

import { api } from './client';
import { authSession } from '../auth/runtime';
import { AUTH_ENABLED } from '../config';
import { retryPolicy } from '@energyrd/api-client';
export { retryPolicy } from '@energyrd/api-client';
import type { AlertStatus, BillInput, EquipmentInput } from './types';
import type { GoalInput, Granularity, OutageInput, ReadingInput } from '@energyrd/api-contracts';
import { billInvalidations, goalInvalidations, phase2Keys, readingInvalidations } from './phase2Keys';

const scope = () => AUTH_ENABLED ? ['account', authSession.getSnapshot().epoch] : ['pilot'];
const allowed = () => !AUTH_ENABLED || authSession.getSnapshot().status === 'authenticated';
export const keys = {
  get homes() { return [...scope(), 'homes'] as const; },
  bills: (homeId: string) => [...scope(), 'bills', homeId] as const,
  dashboard: (homeId: string) => [...scope(), 'dashboard', homeId] as const,
  anomalies: (homeId: string) => [...scope(), 'anomalies', homeId] as const,
  outages: (homeId: string) => [...scope(), 'outages', homeId] as const,
  energyScore: (homeId: string) => [...scope(), 'energy-score', homeId] as const,
  recommendations: (homeId: string) => [...scope(), 'recommendations', homeId] as const,
  equipment: (homeId: string) => [...scope(), 'equipment', homeId] as const,
  equipmentItem: (homeId: string, id: string) => [...scope(), 'equipment', homeId, id] as const,
  estimate: (homeId: string) => [...scope(), 'estimate', homeId] as const,
  alerts: (homeId: string) => [...scope(), 'alerts', homeId] as const,
  /** ERD-OCR-PROD: fuera de la clave de facturas; guardar la factura no debe relanzar el sondeo. */
  ocrJob: (homeId: string, documentId: string) => [...scope(), 'ocr-job', homeId, documentId] as const,
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
/** ERD-ANOM-01-COMPLETE: anomalías vigentes persistidas (abiertas o revisadas); descartarlas las saca de la lista. */
export const useAnomalies = (homeId: string | null) =>
  useQuery(perHome(keys.anomalies(homeId ?? 'none'), homeId, (id, signal) => api.listAnomalies(id, undefined, signal)));

export function useUpdateAnomaly(homeId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'open' | 'acknowledged' | 'dismissed' }) => api.updateAnomaly(homeId as string, id, status),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.anomalies(homeId ?? 'none') }),
  });
}
/** ERD-INT-01: historial de apagones y resumen mensual (comparten prefijo: una escritura refresca ambos). */
export const useOutages = (homeId: string | null) =>
  useQuery(perHome([...keys.outages(homeId ?? 'none'), 'list'], homeId, api.listOutages));
export const useOutageSummary = (homeId: string | null, months = 12) =>
  useQuery(perHome([...keys.outages(homeId ?? 'none'), 'summary', months], homeId, (id, signal) => api.getOutageSummary(id, months, signal)));
function useOutageMutation<V, R>(homeId: string, fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => void qc.invalidateQueries({ queryKey: keys.outages(homeId) }) });
}
export const useCreateOutage = (homeId: string) => useOutageMutation(homeId, (input: OutageInput) => api.createOutage(homeId, input));
export const useUpdateOutage = (homeId: string) => useOutageMutation(homeId, ({ id, input }: { id: string; input: OutageInput }) => api.updateOutage(homeId, id, input));
export const useDeleteOutage = (homeId: string) => useOutageMutation(homeId, (id: string) => api.deleteOutage(homeId, id));

/** ERD-SCORE-01: Energy Score del backend (solo lectura). Se vuelve a pedir al entrar: los datos de origen pudieron cambiar. */
export const useEnergyScore = (homeId: string | null) =>
  useQuery({ ...perHome(keys.energyScore(homeId ?? 'none'), homeId, api.getEnergyScore), staleTime: 0, refetchOnMount: 'always' as const });

/** ERD-SAVE-01: recomendaciones vigentes. Entrar a la pantalla recalcula (idempotente); si falla, se muestra lo guardado. */
export const useRecommendations = (homeId: string | null) =>
  useQuery(perHome(keys.recommendations(homeId ?? 'none'), homeId, async (id, signal) => {
    try { return await api.refreshRecommendations(id); } catch { return api.listRecommendations(id, undefined, signal); }
  }));

/** Aplicadas o descartadas (para poder reactivarlas). No recalcula. */
export const useDecidedRecommendations = (homeId: string | null) =>
  useQuery(perHome([...keys.recommendations(homeId ?? 'none'), 'decided'], homeId, async (id, signal) =>
    (await api.listRecommendations(id, { status: 'all' }, signal)).items.filter((r) => r.status === 'applied' || r.status === 'dismissed')));

export function useUpdateRecommendation(homeId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'applied' | 'dismissed' }) => api.updateRecommendation(homeId as string, id, status),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.recommendations(homeId ?? 'none') }),
  });
}
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

/** ERD-ALERT-02: pagada/pendiente; cambia la alerta de pago y la factura. */
export function useSetBillPayment(homeId: string, billId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paid: boolean) => api.setBillPayment(homeId, billId, paid),
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

/** `from`/`to` null = no consultar (p. ej. un ciclo que aún no empieza). */
export const useConsumption = (homeId: string | null, granularity: Granularity, from: string | null, to: string | null) => {
  const base = perHome(keys.phase2.consumption(homeId ?? 'none', granularity, from ?? '', to ?? ''), homeId,
    (id, signal) => api.getConsumption(id, { granularity, from: from ?? '', to: to ?? '' }, signal));
  return useQuery({
    ...base,
    enabled: (base.enabled ?? true) && from !== null && to !== null,
    // Al cambiar de rango no parpadea a vacío; solo se reutiliza el dato de la MISMA cuenta y vivienda.
    placeholderData: (previous, previousQuery) => {
      const prefix = keys.phase2.consumptionAll(homeId ?? 'none');
      return previousQuery && prefix.every((p, i) => Object.is(previousQuery.queryKey[i], p)) ? previous : undefined;
    },
  });
};

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


export const OCR_POLL_MS = 2000;
/** Pasado este tiempo sin terminar se avisa (sin cortar la espera): puede no haber un worker activo. */
export const OCR_SLOW_AFTER_MS = 60_000;

/**
 * ERD-OCR-PROD: sube la foto o el PDF, consulta el estado cada 2 s mientras esté pendiente/procesando y se detiene al
 * terminar (done/failed). El borrador solo llega al terminar; la factura nunca se crea aquí.
 */
export function useBillOcr(homeId: string | null, pollMs = OCR_POLL_MS) {
  const qc = useQueryClient();
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const id = homeId ?? 'none';
  const start = useMutation({
    mutationFn: (file: BillImage) => api.startOcrJob(homeId as string, file, 'mobile'),
    onSuccess: (job) => { qc.setQueryData(keys.ocrJob(id, job.document_id), job); setStartedAt(Date.now()); setDocumentId(job.document_id); },
  });
  const poll = useQuery({
    queryKey: keys.ocrJob(id, documentId ?? 'none'),
    queryFn: ({ signal }) => api.getOcrJob(homeId as string, documentId as string, signal),
    enabled: allowed() && !!homeId && documentId !== null,
    retry: retryPolicy,
    refetchInterval: (query) => (query.state.data && !isOcrActive(query.state.data) ? false : pollMs),
    gcTime: 0,
  });
  const retry = useMutation({
    mutationFn: () => api.retryOcrJob(homeId as string, documentId as string),
    onSuccess: (job) => { qc.setQueryData(keys.ocrJob(id, job.document_id), job); setStartedAt(Date.now()); },
  });
  const reset = () => { setDocumentId(null); start.reset(); retry.reset(); };
  return { start, retry, reset, job: poll.data ?? start.data ?? null, documentId, startedAt, pollError: poll.error };
}
