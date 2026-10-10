import type { Bill, BillAssessment, BillInput, BillItemsOut, BillItemsReplace, Dashboard, Home, OcrDraft } from "./schemas";
import type {
  Anomaly,
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
  ocrBill(homeId: string, file: File): Promise<OcrDraft>;
  updateBill(homeId: string, billId: string, input: BillInput): Promise<Bill>;
  deleteBill(homeId: string, billId: string): Promise<void>;
  getDashboard(homeId: string, signal?: AbortSignal, billId?: string): Promise<Dashboard>;
  listAnomalies(homeId: string, granularity: "day" | "month", signal?: AbortSignal): Promise<Anomaly[]>;
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
