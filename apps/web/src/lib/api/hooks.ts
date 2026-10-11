"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getApi } from "./index";
import { isOcrActive } from "@energyrd/api-contracts";
import { useSession } from "@/lib/session";
import type { AlertStatus, BillInput, BillItemsReplace, Distributor, EquipmentInput, GoalInput, Granularity, ReadingInput } from "./schemas";

// Todas las claves de una vivienda cuelgan de ["homes", homeId]: invalidar ese prefijo
// refresca dashboard, alertas y estimado a la vez (la API los recalcula en cada escritura).
export const keys = {
  homes: ["homes"] as const,
  home: (homeId: string) => ["homes", homeId] as const,
  bills: (homeId: string) => ["homes", homeId, "bills"] as const,
  bill: (homeId: string, billId: string) => ["homes", homeId, "bills", billId] as const,
  // ERD-BILL-02: por vivienda + factura + cuenta ("pilot" sin auth). Cuelgan de `bill(...)`, así que
  // invalidar la factura refresca su detalle y su evaluación, y ninguna otra.
  billItems: (homeId: string, billId: string, account: string) => ["homes", homeId, "bills", billId, "items", account] as const,
  billAssessment: (homeId: string, billId: string, account: string) => ["homes", homeId, "bills", billId, "assessment", account] as const,
  dashboard: (homeId: string, billId?: string) => billId
    ? ["homes", homeId, "dashboard", billId] as const
    : ["homes", homeId, "dashboard"] as const,
  anomalies: (homeId: string) => ["homes", homeId, "anomalies"] as const,
  equipment: (homeId: string) => ["homes", homeId, "equipment"] as const,
  estimate: (homeId: string) => ["homes", homeId, "estimate"] as const,
  alerts: (homeId: string) => ["homes", homeId, "alerts"] as const,
  // Fase 2: también cuelgan de la vivienda, así que cualquier escritura (lectura, factura, meta)
  // invalida consumo y progreso de la meta de ESA vivienda y de ninguna otra.
  readings: (homeId: string) => ["homes", homeId, "readings"] as const,
  consumption: (homeId: string, q: ConsumptionQuery) => ["homes", homeId, "consumption", q.granularity, q.from, q.to] as const,
  goal: (homeId: string) => ["homes", homeId, "goal"] as const,
  goalProgress: (homeId: string) => ["homes", homeId, "goal", "progress"] as const,
  // Pliegos publicados (SIE): no dependen de la vivienda.
  // ERD-OCR-PROD: fuera del árbol de la vivienda a propósito: guardar la factura invalida la vivienda y no debe relanzar el sondeo.
  ocrJob: (homeId: string, documentId: string) => ["ocr-job", homeId, documentId] as const,
  tariffs: (distributor: Distributor | undefined, on?: string) => ["tariffs", distributor ?? "all", on ?? "today"] as const,
};

export interface ConsumptionQuery {
  granularity: Granularity;
  from: string;
  to: string;
}

/** Tras escribir datos de una vivienda, todo lo derivado (dashboard, alertas, estimado) queda viejo. */
export const invalidateHome = (qc: QueryClient, homeId: string) =>
  qc.invalidateQueries({ queryKey: keys.home(homeId) });

const enabled = (homeId: string) => homeId.length > 0;

export const useHomes = () => {
  const { ready, authEnabled, user } = useSession();
  return useQuery({ queryKey: keys.homes, queryFn: ({ signal }) => getApi().listHomes(signal), enabled: ready && (!authEnabled || !!user) });
};

export const useBills = (homeId: string) =>
  useQuery({ queryKey: keys.bills(homeId), queryFn: ({ signal }) => getApi().listBills(homeId, signal), enabled: enabled(homeId) });

export const useBill = (homeId: string, billId: string) =>
  useQuery({ queryKey: keys.bill(homeId, billId), queryFn: ({ signal }) => getApi().getBill(homeId, billId, signal), enabled: enabled(homeId) && !!billId });

export const useDashboard = (homeId: string, billId?: string) =>
  useQuery({
    queryKey: keys.dashboard(homeId, billId),
    queryFn: ({ signal }) => getApi().getDashboard(homeId, signal, billId),
    enabled: enabled(homeId),
  });

/** ERD-ANOM-01-COMPLETE: anomalías vigentes persistidas (abiertas o revisadas); descartarlas las saca de la lista. */
export const useAnomalies = (homeId: string) =>
  useQuery({
    queryKey: keys.anomalies(homeId),
    queryFn: ({ signal }) => getApi().listAnomalies(homeId, undefined, signal),
    enabled: enabled(homeId),
  });

export const useUpdateAnomaly = (homeId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "open" | "acknowledged" | "dismissed" }) => getApi().updateAnomaly(homeId, id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.anomalies(homeId) }),
  });
};

export const useEquipment = (homeId: string) =>
  useQuery({
    queryKey: keys.equipment(homeId),
    queryFn: ({ signal }) => getApi().listEquipment(homeId, signal),
    enabled: enabled(homeId),
  });

export const useEstimate = (homeId: string) =>
  useQuery({
    queryKey: keys.estimate(homeId),
    queryFn: ({ signal }) => getApi().getEstimate(homeId, signal),
    enabled: enabled(homeId),
  });

export const useAlerts = (homeId: string) =>
  useQuery({ queryKey: keys.alerts(homeId), queryFn: ({ signal }) => getApi().listAlerts(homeId, undefined, signal), enabled: enabled(homeId) });

export const useReadings = (homeId: string) =>
  useQuery({ queryKey: keys.readings(homeId), queryFn: ({ signal }) => getApi().listReadings(homeId, signal), enabled: enabled(homeId) });

/** `query` null = rango inválido en el formulario: no se consulta (el error ya se muestra al lado). */
export const useConsumption = (homeId: string, query: ConsumptionQuery | null) =>
  useQuery({
    queryKey: query ? keys.consumption(homeId, query) : ["homes", homeId, "consumption", "invalid"],
    queryFn: ({ signal }) => getApi().getConsumption(homeId, query!, signal),
    enabled: enabled(homeId) && query !== null,
    // Al cambiar de rango se mantiene la gráfica anterior hasta que llega la nueva (sin parpadeo).
    placeholderData: keepPreviousData,
  });

export const useGoal = (homeId: string) =>
  useQuery({ queryKey: keys.goal(homeId), queryFn: ({ signal }) => getApi().getGoal(homeId, signal), enabled: enabled(homeId) });

export const useGoalProgress = (homeId: string) =>
  useQuery({ queryKey: keys.goalProgress(homeId), queryFn: ({ signal }) => getApi().getGoalProgress(homeId, undefined, signal), enabled: enabled(homeId) });

export const useTariffs = (distributor: Distributor | undefined) =>
  useQuery({
    queryKey: keys.tariffs(distributor),
    queryFn: ({ signal }) => getApi().listTariffs({ distributor }, signal),
    enabled: distributor !== undefined && distributor !== "Otra",
    staleTime: 60 * 60 * 1000,
  });

function useHomeMutation<V, R>(homeId: string, fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidateHome(qc, homeId) });
}

export const OCR_POLL_MS = 2000;
/** Pasado este tiempo sin terminar se avisa (sin cortar la espera): puede no haber un worker activo. */
export const OCR_SLOW_AFTER_MS = 60_000;

/**
 * ERD-OCR-PROD: sube la foto o el PDF, sondea el estado cada 2 s mientras esté `pending`/`processing` y se detiene en
 * `done`/`failed`. El borrador solo llega cuando termina; la factura nunca se crea aquí.
 */
export function useBillOcr(homeId: string, pollMs = OCR_POLL_MS) {
  const qc = useQueryClient();
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const start = useMutation({
    mutationFn: (file: File) => getApi().startOcrJob(homeId, file, "web"),
    onSuccess: (job) => { qc.setQueryData(keys.ocrJob(homeId, job.document_id), job); setStartedAt(Date.now()); setDocumentId(job.document_id); },
  });
  const poll = useQuery({
    queryKey: keys.ocrJob(homeId, documentId ?? ""),
    queryFn: ({ signal }) => getApi().getOcrJob(homeId, documentId!, signal),
    enabled: enabled(homeId) && documentId !== null,
    refetchInterval: (query) => (query.state.data && !isOcrActive(query.state.data) ? false : pollMs),
    gcTime: 0,
  });
  const retry = useMutation({
    mutationFn: () => getApi().retryOcrJob(homeId, documentId!),
    onSuccess: (job) => { qc.setQueryData(keys.ocrJob(homeId, job.document_id), job); setStartedAt(Date.now()); },
  });
  const job = poll.data ?? start.data ?? null;
  const reset = () => { setDocumentId(null); start.reset(); retry.reset(); };
  return { start, retry, reset, job, documentId, pollError: poll.error, startedAt };
}

export const useCreateBill = (homeId: string) =>
  useHomeMutation(homeId, (input: BillInput) => getApi().createBill(homeId, input));

export const useUpdateBill = (homeId: string, billId: string) =>
  useHomeMutation(homeId, (input: BillInput) => getApi().updateBill(homeId, billId, input));

/** ERD-ALERT-02: marcar la factura como pagada o pendiente (retira o restituye su alerta de pago). */
export const useSetBillPayment = (homeId: string, billId: string) =>
  useHomeMutation(homeId, (paid: boolean) => getApi().setBillPayment(homeId, billId, paid));

export const useDeleteBill = (homeId: string) =>
  useHomeMutation(homeId, (billId: string) => getApi().deleteBill(homeId, billId));

export const useSaveEquipment = (homeId: string) =>
  useHomeMutation(homeId, ({ id, input }: { id?: string; input: EquipmentInput }) =>
    id ? getApi().updateEquipment(homeId, id, input) : getApi().createEquipment(homeId, input),
  );

export const useDeleteEquipment = (homeId: string) =>
  useHomeMutation(homeId, (id: string) => getApi().deleteEquipment(homeId, id));

export const useSetAlertStatus = (homeId: string) =>
  useHomeMutation(homeId, ({ id, status }: { id: string; status: AlertStatus }) =>
    getApi().setAlertStatus(homeId, id, status),
  );

export const useCreateReading = (homeId: string) =>
  useHomeMutation(homeId, (input: ReadingInput) => getApi().createReading(homeId, input));

export const useDeleteReading = (homeId: string) =>
  useHomeMutation(homeId, (readingId: string) => getApi().deleteReading(homeId, readingId));

export const usePutGoal = (homeId: string) =>
  useHomeMutation(homeId, (input: GoalInput) => getApi().putGoal(homeId, input));

// ---------- ERD-BILL-02: detalle de cargos y revisión de consistencia (solo lectura) ----------
const useAccountScope = () => {
  const { authEnabled, user } = useSession();
  return authEnabled ? user?.id ?? "" : "pilot";
};

export const useBillItems = (homeId: string, billId: string) => {
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.billItems(homeId, billId, account),
    queryFn: ({ signal }) => getApi().getBillItems(homeId, billId, signal),
    enabled: enabled(homeId) && !!billId && !!account,
  });
};

/** POST /validate no escribe nada: se consulta solo cuando la persona pide la revisión. */
export const useBillAssessment = (homeId: string, billId: string, requested: boolean) => {
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.billAssessment(homeId, billId, account),
    queryFn: ({ signal }) => getApi().assessBill(homeId, billId, signal),
    enabled: requested && enabled(homeId) && !!billId && !!account,
    staleTime: 0,
  });
};

export const usePutBillItems = (homeId: string, billId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BillItemsReplace) => getApi().putBillItems(homeId, billId, input),
    // onSettled, no onSuccess: un 502 del BFF puede llegar cuando la API ya guardó (revisión R2).
    onSettled: () => qc.invalidateQueries({ queryKey: keys.bill(homeId, billId) }),
  });
};
