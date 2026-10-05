import { describe, expect, it } from 'vitest';
import { draftToFormValues, ocrDraftToBillInput } from './ocrModel';

const draft = {
  period_start: { value: '2026-09-01', confidence: 'high' as const },
  period_end: { value: '2026-09-30', confidence: 'high' as const },
  days: { value: '30', confidence: 'inferred' as const },
  kwh: { value: '100', confidence: 'high' as const },
  amount_dop: { value: '1500', confidence: 'high' as const },
  reading_previous: { value: null, confidence: 'none' as const },
  reading_current: { value: '200', confidence: 'inferred' as const },
  warnings: ['Revise la lectura actual'], raw_text_excerpt: 'texto',
};

describe('OCR draft model', () => {
  it('maps nullable OCR values to editable manual form strings', () => {
    expect(draftToFormValues(draft)).toEqual({ periodStart: '2026-09-01', periodEnd: '2026-09-30', days: '30', kwh: '100', amount: '1500', readingPrevious: '', readingCurrent: '200' });
  });

  it('builds a manual bill input only after the edited draft validates', () => {
    expect(ocrDraftToBillInput(draftToFormValues(draft))).toEqual({ period_start: '2026-09-01', period_end: '2026-09-30', days: 30, kwh: '100', amount_dop: '1500', reading_previous: null, reading_current: '200' });
  });
});
