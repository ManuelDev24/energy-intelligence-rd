/** ERD-ADM-BILLS-WEB: tipos y reglas puras de la calidad de datos de facturas. Solo lectura; sin importes en el agregado. */
export type BillsSummary = {
  days: number; total: number; recent: number; homes_with_bills: number; manual: number; seed: number; with_document: number;
  with_readings: number; with_due_date: number; paid: number; zero_kwh: number; zero_amount: number; ocr_pending: number; ocr_failed: number; ocr_done: number;
};
export type AdminBill = {
  id: string; period_start: string; period_end: string; days: number; kwh: string; amount_dop: string; source: string; due_date: string | null;
  paid: boolean; has_readings: boolean; has_document: boolean; ocr_status: string | null; created_at: string;
};
export type AdminHomeBillsPage = { items: AdminBill[]; total: number; limit: number; offset: number };

export const BILLS_PAGE_SIZE = 25;
export const SUMMARY_DAYS = [7, 30, 90] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identificador de vivienda: exacto, sin búsquedas aproximadas. Devuelve el motivo o null. */
export function homeIdProblem(value: string): string | null {
  return UUID.test(value.trim()) ? null : "Escribe el identificador completo de la vivienda (formato 8-4-4-4-12).";
}

/** Porcentaje entero sobre el total; sin facturas no se inventa un 0 %, se dice «—». */
export function share(part: number, total: number): string {
  return total <= 0 ? "—" : `${Math.round((part / total) * 100)} %`;
}

export type QualityRow = { label: string; value: number; share: string; note: string };
/** Filas de completitud: qué parte de las facturas trae cada dato que alimenta alertas, anomalías y reclamaciones. */
export function qualityRows(s: BillsSummary): QualityRow[] {
  return [
    { label: "Con original (foto o PDF)", value: s.with_document, share: share(s.with_document, s.total), note: "Permite revisar y reclamar con evidencia." },
    { label: "Con lecturas del medidor", value: s.with_readings, share: share(s.with_readings, s.total), note: "Sin lecturas no se puede contrastar el consumo." },
    { label: "Con fecha límite de pago", value: s.with_due_date, share: share(s.with_due_date, s.total), note: "Sin fecha límite no hay alerta de pago." },
    { label: "Marcadas como pagadas", value: s.paid, share: share(s.paid, s.total), note: "Dato declarado por la persona." },
    { label: "Con 0 kWh", value: s.zero_kwh, share: share(s.zero_kwh, s.total), note: "Posible error de captura." },
    { label: "Con monto 0", value: s.zero_amount, share: share(s.zero_amount, s.total), note: "Posible error de captura." },
  ];
}

const OCR_TEXT: Record<string, string> = { pending: "En cola", processing: "Procesando", done: "Listo", failed: "Falló", cancelled: "Cancelado" };
export const ocrLabel = (status: string | null) => (status ? OCR_TEXT[status] ?? status : "Sin OCR");
export const sourceLabel = (source: string) => (source === "manual" ? "Manual" : source === "seed" ? "Dato de demostración" : source);

const money = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" });
export const formatMoney = (value: string) => money.format(Number(value));
export const formatKwh = (value: string) => `${Number(value).toLocaleString("es-DO", { maximumFractionDigits: 2 })} kWh`;
