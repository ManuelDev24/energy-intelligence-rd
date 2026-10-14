/** Vocabulario OCR compartido (nació en la app móvil, `features/bills/ocrModel.ts`). Solo textos neutros: los mensajes
 * dirigidos a la persona siguen en cada app porque el móvil trata de «usted» y la web de «tú». */

export type OcrMethod = 'text_layer' | 'ocr' | 'mixed';
export type OcrConfidence = 'high' | 'inferred' | 'none';
export type OcrErrorCode = 'unreadable' | 'protected_pdf' | 'file_missing' | 'engine_error';

export const OCR_ERROR_CODES: readonly OcrErrorCode[] = ['unreadable', 'protected_pdf', 'file_missing', 'engine_error'];

const METHOD_TEXT: Record<OcrMethod, string> = {
  text_layer: 'Leído del texto del PDF',
  ocr: 'Leído con reconocimiento óptico (OCR)',
  mixed: 'Leído del texto del PDF y con OCR',
};

/** «Leído con OCR (1 de 3 páginas).» — vacío si el trabajo aún no tiene método. */
export function ocrSourceText(job: { method?: string | null; pages_read?: number | null; pages_total?: number | null }): string {
  const text = job.method ? METHOD_TEXT[job.method as OcrMethod] : undefined;
  if (!text) return '';
  const pages = job.pages_total && job.pages_total > 1 ? ` (${job.pages_read ?? 0} de ${job.pages_total} páginas)` : '';
  return `${text}${pages}.`;
}

export function ocrConfidenceText(confidence: OcrConfidence): string {
  return confidence === 'high' ? 'Alta confianza' : confidence === 'inferred' ? 'Inferido: revise' : 'No detectado';
}

/** Un archivo ilegible, protegido o ausente no mejora repitiendo la lectura; un fallo del motor sí puede. */
export const isTransientOcrError = (code: string | null | undefined) => code === 'engine_error';
