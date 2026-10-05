import type { OcrDraft } from "@/lib/api/schemas";
import type { BillFormValues } from "@/lib/bill-form";

export const ocrDraftToBillForm = (draft: OcrDraft): BillFormValues => ({
  period_start: draft.period_start.value ?? "",
  period_end: draft.period_end.value ?? "",
  days: draft.days.value ?? "",
  kwh: draft.kwh.value ?? "",
  amount_dop: draft.amount_dop.value ?? "",
  reading_previous: draft.reading_previous.value ?? "",
  reading_current: draft.reading_current.value ?? "",
});

export const OCR_FIELDS: Array<{ key: keyof Omit<OcrDraft, "warnings" | "raw_text_excerpt">; label: string }> = [
  { key: "period_start", label: "Inicio" },
  { key: "period_end", label: "Fin" },
  { key: "days", label: "Días" },
  { key: "kwh", label: "kWh" },
  { key: "amount_dop", label: "Monto" },
  { key: "reading_previous", label: "Lectura anterior" },
  { key: "reading_current", label: "Lectura actual" },
];
