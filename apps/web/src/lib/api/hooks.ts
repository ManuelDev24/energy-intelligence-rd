"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApi } from "./index";
import type { BillInput } from "./schemas";

export const keys = {
  homes: ["homes"] as const,
  bills: (homeId: string) => ["homes", homeId, "bills"] as const,
  bill: (homeId: string, billId: string) => ["homes", homeId, "bills", billId] as const,
  dashboard: (homeId: string) => ["homes", homeId, "dashboard"] as const,
};

export const useHomes = () => useQuery({ queryKey: keys.homes, queryFn: () => getApi().listHomes() });

export const useBills = (homeId: string) =>
  useQuery({ queryKey: keys.bills(homeId), queryFn: () => getApi().listBills(homeId) });

export const useBill = (homeId: string, billId: string) =>
  useQuery({ queryKey: keys.bill(homeId, billId), queryFn: () => getApi().getBill(homeId, billId) });

export const useDashboard = (homeId: string) =>
  useQuery({ queryKey: keys.dashboard(homeId), queryFn: () => getApi().getDashboard(homeId) });

export function useCreateBill(homeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BillInput) => getApi().createBill(homeId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.bills(homeId) }),
  });
}

export function useUpdateBill(homeId: string, billId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BillInput) => getApi().updateBill(homeId, billId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.bills(homeId) }),
  });
}

export function useDeleteBill(homeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (billId: string) => getApi().deleteBill(homeId, billId),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.bills(homeId) }),
  });
}
