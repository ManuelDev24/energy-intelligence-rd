/** ERD-OCR-03-WEB: tipos, etiquetas y reglas puras de la consola OCR. Sin React ni fetch. */
import { OCR_ERROR_CODES, type OcrErrorCode } from "@energyrd/core";
import { hasScope, type MyAccess } from "./access";

export { ocrSourceText } from "@energyrd/core";
export type { OcrErrorCode };

export type OcrStatus = "queued" | "processing" | "completed" | "failed_retryable" | "failed_permanent" | "dead_letter" | "cancelled";

export type OcrJob = {
  id: number; document_id: string; status: OcrStatus; attempts: number; max_attempts: number;
  run_at: string; created_at: string; finished_at: string | null; error_code: OcrErrorCode | null;
};
export type OcrHistoryEntry = { action: string; result: string; reason: string | null; created_at: string };
export type OcrJobDetail = OcrJob & {
  generation: number; started_at: string | null; engine: string | null; method: string | null;
  pages_read: number | null; pages_total: number | null; document_kind: string; document_content_type: string;
  document_size_bytes: number; uploaded_via: string; attached_to_bill: boolean; history: OcrHistoryEntry[];
};
export type OcrJobsPage = { items: OcrJob[]; total: number; limit: number; offset: number };

export const STATUS_LABELS: Record<OcrStatus, string> = {
  queued: "En cola", processing: "Procesando", completed: "Completado",
  failed_retryable: "Falló (se reintenta solo)", failed_permanent: "Falló (permanente)",
  dead_letter: "Dead-letter (agotó intentos)", cancelled: "Cancelado",
};
/** Etiquetas para operación (no para la persona usuaria); el orden lo fija el vocabulario compartido. */
export const ERROR_CODES = OCR_ERROR_CODES;
export const ERROR_LABELS: Record<OcrErrorCode, string> = {
  unreadable: "Documento ilegible", protected_pdf: "PDF protegido", file_missing: "Archivo no disponible",
  engine_error: "Error del motor OCR",
};
const HISTORY_LABELS: Record<string, string> = { "ocr.retry": "Reintento manual", "ocr.cancel": "Cancelación" };
export const historyLabel = (action: string) => HISTORY_LABELS[action] ?? action;

export const PAGE_SIZE = 25;
export type OcrFilters = { status: OcrStatus | ""; errorCode: OcrErrorCode | ""; minAttempts: string; from: string; to: string };
export const EMPTY_FILTERS: OcrFilters = { status: "", errorCode: "", minAttempts: "", from: "", to: "" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Las fechas del filtro son días de República Dominicana (UTC−4, sin horario de verano). `to` es inclusivo. */
function rdStartOfDay(day: string, plusDays = 0): string | null {
  if (!DATE.test(day)) return null;
  const date = new Date(`${day}T00:00:00-04:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + plusDays);
  return date.toISOString();
}

export function buildJobsQuery(filters: OcrFilters, offset: number): string {
  const qs = new URLSearchParams();
  if (filters.status) qs.set("status", filters.status);
  if (filters.errorCode) qs.set("error_code", filters.errorCode);
  const attempts = filters.minAttempts.trim();
  if (/^\d{1,3}$/.test(attempts) && Number(attempts) <= 100) qs.set("min_attempts", String(Number(attempts)));
  const from = rdStartOfDay(filters.from);
  if (from) qs.set("created_from", from);
  const to = rdStartOfDay(filters.to, 1);
  if (to) qs.set("created_to", to);
  qs.set("limit", String(PAGE_SIZE));
  qs.set("offset", String(Math.max(0, offset)));
  return `?${qs.toString()}`;
}

/** Solo muestra lo que la API también permitiría; la API sigue siendo quien decide (409/403). */
export function canRetry(job: Pick<OcrJob, "status">, access: MyAccess | null): boolean {
  return hasScope(access, "admin.ocr.retry") && (job.status === "dead_letter" || job.status === "failed_retryable");
}
export function canCancel(job: Pick<OcrJob, "status">, access: MyAccess | null): boolean {
  return hasScope(access, "admin.ocr.review") && (job.status === "queued" || job.status === "processing");
}

/** Validación local del motivo: la API rechaza además correos, teléfonos, enlaces y credenciales. */
export function reasonProblem(reason: string): string | null {
  const value = reason.trim();
  if (!value) return "El motivo es obligatorio.";
  if (value.length > 500) return "El motivo admite como máximo 500 caracteres.";
  if (/[\r\n]/.test(reason)) return "El motivo debe ocupar una sola línea.";
  return null;
}
export const REASON_REJECTED = "La API rechazó el motivo: no incluyas correos, teléfonos, enlaces ni credenciales.";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" }) : "—";
