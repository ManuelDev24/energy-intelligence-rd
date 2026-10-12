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

export interface Api {
  listHomes(signal?: AbortSignal): Promise<Home[]>;
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
  getDashboard(homeId: string, signal?: AbortSignal, billId?: string): Promise<Dashboard>;
  listAnomalies(homeId: string, opts?: { status?: "active" | "all" | "dismissed" | "resolved" }, signal?: AbortSignal): Promise<Anomaly[]>;
  updateAnomaly(homeId: string, anomalyId: string, status: "open" | "acknowledged" | "dismissed"): Promise<Anomaly>;
  listOutages(homeId: string, signal?: AbortSignal): Promise<Outage[]>;
  getOutageSummary(homeId: string, months?: number, signal?: AbortSignal): Promise<OutageSummary>;
  createOutage(homeId: string, input: OutageInput): Promise<Outage>;
  updateOutage(homeId: string, outageId: string, input: OutageInput): Promise<Outage>;
  deleteOutage(homeId: string, outageId: string): Promise<void>;
  getEnergyScore(homeId: string, signal?: AbortSignal): Promise<EnergyScore>;
  listRecommendations(homeId: string, opts?: { status?: "active" | "applied" | "dismissed" | "resolved" | "all"; limit?: number }, signal?: AbortSignal): Promise<RecommendationList>;
  refreshRecommendations(homeId: string): Promise<RecommendationList>;
  updateRecommendation(homeId: string, recommendationId: string, status: "active" | "applied" | "dismissed"): Promise<Recommendation>;
  listEquipment(homeId: string, signal?: AbortSignal): Promise<Equipment[]>;
  createEquipment(homeId: string, input: EquipmentInput): Promise<Equipment>;
  updateEquipment(homeId: string, id: string, input: EquipmentInput): Promise<Equipment>;
  deleteEquipment(homeId: string, id: string): Promise<void>;
  getEstimate(homeId: string, signal?: AbortSignal): Promise<EquipmentEstimate>;
  listAlerts(homeId: string, opts?: { includeDismissed?: boolean }, signal?: AbortSignal): Promise<AlertItem[]>;
  setAlertStatus(homeId: string, id: string, status: AlertStatus): Promise<AlertItem>;
  // Fase 2 (ERD-CONS-01 / ERD-GOAL-01)
  listReadings(homeId: string, signal?: AbortSignal): Promise<Reading[]>;
  createReading(homeId: string, input: ReadingInput): Promise<Reading>;
  deleteReading(homeId: string, readingId: string): Promise<void>;
  getConsumption(homeId: string, opts: { granularity: Granularity; from: string; to: string }, signal?: AbortSignal): Promise<Consumption>;
  getGoal(homeId: string, signal?: AbortSignal): Promise<Goal | null>;
  putGoal(homeId: string, input: GoalInput): Promise<Goal>;
  getGoalProgress(homeId: string, opts?: { on?: string }, signal?: AbortSignal): Promise<GoalProgress>;
  listTariffs(opts?: { distributor?: Distributor; on?: string }, signal?: AbortSignal): Promise<Tariff[]>;
  // ERD-BILL-02 (detalle de cargos + revisión de solo lectura)
  getBillItems(homeId: string, billId: string, signal?: AbortSignal): Promise<BillItemsOut>;
  putBillItems(homeId: string, billId: string, input: BillItemsReplace): Promise<BillItemsOut>;
  assessBill(homeId: string, billId: string, signal?: AbortSignal): Promise<BillAssessment>;
}
