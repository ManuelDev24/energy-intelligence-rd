import { isOcrActive, type OcrDraft, type OcrJob } from '@energyrd/api-contracts';
import { isTransientOcrError, ocrConfidenceText, ocrSourceText as sharedOcrSourceText } from '@energyrd/core';
import type { BillInput } from '../../api/types';
import { validateBill, type BillFormValues } from './form';

const value = (field: { value: string | null }) => field.value ?? '';

export function draftToFormValues(draft: OcrDraft): BillFormValues {
  return {
    periodStart: value(draft.period_start), periodEnd: value(draft.period_end), days: value(draft.days),
    kwh: value(draft.kwh), amount: value(draft.amount_dop),
    readingPrevious: value(draft.reading_previous), readingCurrent: value(draft.reading_current), dueDate: value(draft.due_date),
  };
}

export function ocrDraftToBillInput(values: BillFormValues): BillInput {
  const result = validateBill(values);
  if (!result.input) throw new Error('Revise los campos indicados antes de confirmar');
  return result.input;
}

export const confidenceText = (confidence: OcrDraft['kwh']['confidence']): string => ocrConfidenceText(confidence);

/** ERD-OCR-PROD: la factura que se guarda desde un borrador lleva el id del original para ligarlo. */
export function ocrJobBillInput(values: BillFormValues, documentId: string): BillInput {
  return { ...ocrDraftToBillInput(values), document_id: documentId };
}

export type OcrPhase = 'idle' | 'working' | 'slow' | 'done' | 'failed';

/** Qué debe mostrar la pantalla según el estado del trabajo y el tiempo que lleva (puro, sin reloj). */
export function ocrPhase(job: OcrJob | null, busy: boolean, elapsedMs: number, slowAfterMs = 60_000): OcrPhase {
  if (job?.status === 'done' && job.draft) return 'done';
  if (job?.status === 'failed') return 'failed';
  if (busy || (job && isOcrActive(job))) return elapsedMs >= slowAfterMs ? 'slow' : 'working';
  return 'idle';
}

/** Solo un fallo temporal del motor merece «Reintentar»; un archivo ilegible no mejora repitiéndolo. */
export const canRetryOcr = (job: OcrJob | null) => job?.status === 'failed' && isTransientOcrError(job.error_code);

export const ocrSourceText = (job: OcrJob): string => sharedOcrSourceText(job);

/** Texto local por código: la pantalla nunca muestra texto que venga del servidor. */
const ERROR_TEXT: Record<string, string> = {
  unreadable: 'No se pudo leer el archivo. Pruebe con una foto más nítida o con el PDF original de la distribuidora.',
  protected_pdf: 'El PDF está protegido con contraseña. Descárguelo de nuevo sin protección.',
  file_missing: 'El archivo original ya no está disponible. Súbalo de nuevo.',
  engine_error: 'No se pudo leer la factura en este momento. Intente de nuevo en unos minutos.',
};
export const ocrErrorText = (code: string | null | undefined) => ERROR_TEXT[code ?? ''] ?? 'No se pudo leer la factura.';
