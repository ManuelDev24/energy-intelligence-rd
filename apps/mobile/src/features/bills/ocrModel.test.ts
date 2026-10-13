import { readFileSync } from 'node:fs';
import type { OcrJob } from '@energyrd/api-contracts';
import { describe, expect, it } from 'vitest';
import { canRetryOcr, draftToFormValues, ocrDraftToBillInput, ocrErrorText, ocrJobBillInput, ocrPhase, ocrSourceText } from './ocrModel';

const draft = {
  period_start: { value: '2026-09-01', confidence: 'high' as const },
  period_end: { value: '2026-09-30', confidence: 'high' as const },
  days: { value: '30', confidence: 'inferred' as const },
  kwh: { value: '100', confidence: 'high' as const },
  amount_dop: { value: '1500', confidence: 'high' as const },
  reading_previous: { value: null, confidence: 'none' as const },
  reading_current: { value: '200', confidence: 'inferred' as const },
  due_date: { value: '2026-10-15', confidence: 'high' as const },
  warnings: ['Revise la lectura actual'], raw_text_excerpt: 'texto',
};

describe('OCR draft model', () => {
  it('maps nullable OCR values to editable manual form strings', () => {
    expect(draftToFormValues(draft)).toEqual({ periodStart: '2026-09-01', periodEnd: '2026-09-30', days: '30', kwh: '100', amount: '1500', readingPrevious: '', readingCurrent: '200', dueDate: '2026-10-15' });
  });

  it('builds a manual bill input only after the edited draft validates', () => {
    expect(ocrDraftToBillInput(draftToFormValues(draft))).toEqual({ period_start: '2026-09-01', period_end: '2026-09-30', days: 30, kwh: '100', amount_dop: '1500', reading_previous: null, reading_current: '200', due_date: '2026-10-15' });
  });
});

describe('OCR asíncrono (ERD-OCR-PROD)', () => {
  const job = (over: Record<string, unknown> = {}): OcrJob => ({
    document_id: '00000000-0000-0000-0000-0000000000d1', status: 'pending', attempts: 0, method: null, pages_read: null, pages_total: null,
    draft: null, error_code: null, error_message: null, created_at: '2026-10-10T12:00:00Z', finished_at: null, ...over,
  }) as OcrJob;
  const draft = {
    period_start: { value: '2026-09-01', confidence: 'high' }, period_end: { value: '2026-09-30', confidence: 'high' },
    days: { value: '30', confidence: 'high' }, kwh: { value: '300', confidence: 'high' }, amount_dop: { value: '3000', confidence: 'high' },
    reading_previous: { value: null, confidence: 'none' }, reading_current: { value: null, confidence: 'none' }, warnings: [], raw_text_excerpt: '',
  };

  it('la fase sale del estado del trabajo y del tiempo transcurrido', () => {
    expect(ocrPhase(null, false, 0)).toBe('idle');
    expect(ocrPhase(null, true, 0)).toBe('working');
    expect(ocrPhase(job(), false, 10_000)).toBe('working');
    expect(ocrPhase(job({ status: 'processing' }), false, 59_999)).toBe('working');
    expect(ocrPhase(job({ status: 'processing' }), false, 60_000)).toBe('slow');
    expect(ocrPhase(job({ status: 'done', draft }), false, 1)).toBe('done');
    expect(ocrPhase(job({ status: 'failed', error_code: 'unreadable' }), false, 90_000)).toBe('failed');
  });
  it('un trabajo «done» sin borrador no se trata como terminado', () => {
    expect(ocrPhase(job({ status: 'done', draft: null }), false, 0)).toBe('idle');
  });
  it('solo el fallo temporal del motor se puede reintentar', () => {
    expect(canRetryOcr(job({ status: 'failed', error_code: 'engine_error' }))).toBe(true);
    for (const code of ['unreadable', 'protected_pdf', 'file_missing']) expect(canRetryOcr(job({ status: 'failed', error_code: code }))).toBe(false);
    expect(canRetryOcr(job({ status: 'pending' }))).toBe(false);
    expect(canRetryOcr(null)).toBe(false);
  });
  it('los errores se muestran con texto local por código, nunca el del servidor', () => {
    expect(ocrErrorText('protected_pdf')).toContain('contraseña');
    expect(ocrErrorText('unreadable')).toContain('más nítida');
    expect(ocrErrorText('algo-raro')).toBe('No se pudo leer la factura.');
    expect(ocrErrorText(null)).toBe('No se pudo leer la factura.');
  });
  it('describe cómo se leyó el archivo y cuántas páginas', () => {
    expect(ocrSourceText(job({ status: 'done', method: 'text_layer', pages_read: 1, pages_total: 1 }))).toBe('Leído del texto del PDF.');
    expect(ocrSourceText(job({ status: 'done', method: 'mixed', pages_read: 2, pages_total: 3 }))).toBe('Leído del texto del PDF y con OCR (2 de 3 páginas).');
    expect(ocrSourceText(job())).toBe('');
  });
  it('la factura confirmada lleva el id del original y solo si los campos son válidos', () => {
    const values = { periodStart: '2026-09-01', periodEnd: '2026-09-30', days: '30', kwh: '300', amount: '3000', readingPrevious: '', readingCurrent: '', dueDate: '' };
    expect(ocrJobBillInput(values, 'doc-1')).toMatchObject({ document_id: 'doc-1', kwh: '300' });
    expect(() => ocrJobBillInput({ ...values, kwh: '' }, 'doc-1')).toThrow();
  });
});

describe('estructura de la pantalla (no hay render de React Native en vitest)', () => {
  const screen = readFileSync(new URL('./BillOcrScreen.tsx', import.meta.url), 'utf8');
  it('ofrece PDF, sondea con el hook, liga el original al confirmar y no muestra texto del servidor', () => {
    expect(screen).toContain('testID="select-bill-pdf"');
    expect(screen).toContain("type: 'application/pdf'");
    expect(screen).toContain('useBillOcr(homeId)');
    expect(screen).toContain('ocrJobBillInput(values, job.document_id)');
    expect(screen).toContain('ocrErrorText(job.error_code)');
    expect(screen).not.toContain('error_message');
    expect(screen).not.toContain('api.ocrBill');
  });
  it('el progreso es un elemento accesible con región viva', () => {
    expect(screen).toContain('accessibilityLiveRegion="polite"');
    expect(screen).toContain('accessibilityLabel="Analizando la factura"');
  });
});
