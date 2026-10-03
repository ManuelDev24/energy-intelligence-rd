import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from './client';
import type { BillInput } from './types';

export const keys = {
  homes: ['homes'] as const,
  bills: (homeId: string) => ['bills', homeId] as const,
  dashboard: (homeId: string) => ['dashboard', homeId] as const,
};

// No reintentar errores 4xx (son definitivos); sí reintentar una vez fallos de red/5xx.
export const retryPolicy = (count: number, err: unknown) =>
  !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 1;

export const useHomes = () => useQuery({ queryKey: keys.homes, queryFn: api.listHomes, retry: retryPolicy });

export const useBills = (homeId: string | null) =>
  useQuery({
    queryKey: keys.bills(homeId ?? 'none'),
    queryFn: () => api.listBills(homeId as string),
    enabled: !!homeId,
    retry: retryPolicy,
  });

export const useDashboard = (homeId: string | null) =>
  useQuery({
    queryKey: keys.dashboard(homeId ?? 'none'),
    queryFn: () => api.getDashboard(homeId as string),
    enabled: !!homeId,
    retry: retryPolicy,
  });

/** Crear una factura invalida historial y dashboard de ESA vivienda (no mezcla viviendas). */
export function useCreateBill(homeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BillInput) => api.createBill(homeId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.bills(homeId) });
      void qc.invalidateQueries({ queryKey: keys.dashboard(homeId) });
    },
  });
}

export function useDeleteBill(homeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (billId: string) => api.deleteBill(homeId, billId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.bills(homeId) });
      void qc.invalidateQueries({ queryKey: keys.dashboard(homeId) });
    },
  });
}
