import type { Bill, BillAssessment, BillInput, BillItemsOut, BillItemsReplace, Dashboard, Home, OcrJob } from "./schemas";
import type {
  Anomaly,
  Outage,
  OutageInput,
  OutageSummary,
  Recommendation,
  EnergyScore,
  RecommendationList,
  AlertItem,
  AlertStatus,
  Equipment,
  EquipmentEstimate,
  EquipmentInput,
  Consumption,
  Distributor,
  Goal,
  GoalInput,
  GoalProgress,
  Granularity,
  Reading,
  ReadingInput,
  Tariff,
} from "./schemas";

export { ApiError } from "@energyrd/api-client";

// ISP: cada pantalla y cada prueba puede depender solo del recurso que usa. `Api` es la unión que implementan
// el cliente real (live.ts) y el simulado de las pruebas (test/mock-api.ts).
/** Viviendas. */
export interface HomesApi {
  listHomes(signal?: AbortSignal): Promise<Home[]>;
}

/** Facturas, lectura OCR asíncrona (ERD-OCR-PROD: borrador, nunca crea la factura) y detalle de cargos (ERD-BILL-02). */
export interface BillsApi {
  listBills(homeId: string, signal?: AbortSignal): Promise<Bill[]>;
  getBill(homeId: string, billId: string, signal?: AbortSignal): Promise<Bill>;
  createBill(homeId: string, input: BillInput): Promise<Bill>;
  // ERD-OCR-PROD: lectura asíncrona de fotos y PDF (borrador; nunca crea la factura).
  startOcrJob(homeId: string, file: File, source: "web" | "mobile"): Promise<OcrJob>;
  getOcrJob(homeId: string, documentId: string, signal?: AbortSignal): Promise<OcrJob>;
  retryOcrJob(homeId: string, documentId: string): Promise<OcrJob>;
  updateBill(homeId: string, billId: string, input: BillInput): Promise<Bill>;
  setBillPayment(homeId: string, billId: string, paid: boolean): Promise<Bill>;
  deleteBill(homeId: string, billId: string): Promise<void>;
  // ERD-BILL-02 (detalle de cargos + revisión de solo lectura)
  getBillItems(homeId: string, billId: string, signal?: AbortSignal): Promise<BillItemsOut>;
  putBillItems(homeId: string, billId: string, input: BillItemsReplace): Promise<BillItemsOut>;
  assessBill(homeId: string, billId: string, signal?: AbortSignal): Promise<BillAssessment>;
}

/** Panel de inicio. */
export interface DashboardApi {
  getDashboard(homeId: string, signal?: AbortSignal, billId?: string): Promise<Dashboard>;
}

/** Anomalías de consumo. */
export interface AnomaliesApi {
  listAnomalies(homeId: string, opts?: { status?: "active" | "all" | "dismissed" | "resolved" }, signal?: AbortSignal): Promise<Anomaly[]>;
  updateAnomaly(homeId: string, anomalyId: string, status: "open" | "acknowledged" | "dismissed"): Promise<Anomaly>;
}

/** Apagones (ERD-INT-01). */
export interface OutagesApi {
  listOutages(homeId: string, signal?: AbortSignal): Promise<Outage[]>;
  getOutageSummary(homeId: string, months?: number, signal?: AbortSignal): Promise<OutageSummary>;
  createOutage(homeId: string, input: OutageInput): Promise<Outage>;
  updateOutage(homeId: string, outageId: string, input: OutageInput): Promise<Outage>;
  deleteOutage(homeId: string, outageId: string): Promise<void>;
}

/** Puntaje energético y recomendaciones. */
export interface InsightsApi {
  getEnergyScore(homeId: string, signal?: AbortSignal): Promise<EnergyScore>;
  listRecommendations(homeId: string, opts?: { status?: "active" | "applied" | "dismissed" | "resolved" | "all"; limit?: number }, signal?: AbortSignal): Promise<RecommendationList>;
  refreshRecommendations(homeId: string): Promise<RecommendationList>;
  updateRecommendation(homeId: string, recommendationId: string, status: "active" | "applied" | "dismissed"): Promise<Recommendation>;
}

/** Equipos declarados y su estimado. */
export interface EquipmentApi {
  listEquipment(homeId: string, signal?: AbortSignal): Promise<Equipment[]>;
  createEquipment(homeId: string, input: EquipmentInput): Promise<Equipment>;
  updateEquipment(homeId: string, id: string, input: EquipmentInput): Promise<Equipment>;
  deleteEquipment(homeId: string, id: string): Promise<void>;
  getEstimate(homeId: string, signal?: AbortSignal): Promise<EquipmentEstimate>;
}

/** Alertas. */
export interface AlertsApi {
  listAlerts(homeId: string, opts?: { includeDismissed?: boolean }, signal?: AbortSignal): Promise<AlertItem[]>;
  setAlertStatus(homeId: string, id: string, status: AlertStatus): Promise<AlertItem>;
}

/** Lecturas del medidor (ERD-CONS-01). */
export interface ReadingsApi {
  // Fase 2 (ERD-CONS-01 / ERD-GOAL-01)
  listReadings(homeId: string, signal?: AbortSignal): Promise<Reading[]>;
  createReading(homeId: string, input: ReadingInput): Promise<Reading>;
  deleteReading(homeId: string, readingId: string): Promise<void>;
}

/** Consumo por período (ERD-CONS-01). */
export interface ConsumptionApi {
  getConsumption(homeId: string, opts: { granularity: Granularity; from: string; to: string }, signal?: AbortSignal): Promise<Consumption>;
}

/** Meta mensual (ERD-GOAL-01). */
export interface GoalsApi {
  getGoal(homeId: string, signal?: AbortSignal): Promise<Goal | null>;
  putGoal(homeId: string, input: GoalInput): Promise<Goal>;
  getGoalProgress(homeId: string, opts?: { on?: string }, signal?: AbortSignal): Promise<GoalProgress>;
}

/** Tarifas oficiales. */
export interface TariffsApi {
  listTariffs(opts?: { distributor?: Distributor; on?: string }, signal?: AbortSignal): Promise<Tariff[]>;
}

export interface Api
  extends HomesApi,
    BillsApi,
    DashboardApi,
    AnomaliesApi,
    OutagesApi,
    InsightsApi,
    EquipmentApi,
    AlertsApi,
    ReadingsApi,
    ConsumptionApi,
    GoalsApi,
    TariffsApi {}
