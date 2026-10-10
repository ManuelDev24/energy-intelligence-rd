import type { OcrDraft } from '@energyrd/api-contracts';
import type { BillInput } from '../../api/types';
import { validateBill, type BillFormValues } from './form';

const value = (field: { value: string | null }) => field.value ?? '';

export function draftToFormValues(draft: OcrDraft): BillFormValues {
  return {
    periodStart: value(draft.period_start), periodEnd: value(draft.period_end), days: value(draft.days),
    kwh: value(draft.kwh), amount: value(draft.amount_dop),
    readingPrevious: value(draft.reading_previous), readingCurrent: value(draft.reading_current),
  };
}

export function ocrDraftToBillInput(values: BillFormValues): BillInput {
  const result = validateBill(values);
  if (!result.input) throw new Error('Revise los campos indicados antes de confirmar');
  return result.input;
}

export function confidenceText(confidence: OcrDraft['kwh']['confidence']): string {
  return confidence === 'high' ? 'Alta confianza' : confidence === 'inferred' ? 'Inferido: revise' : 'No detectado';
}
