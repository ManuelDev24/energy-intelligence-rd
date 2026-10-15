import { describe, expect, it } from 'vitest';
import type { ClaimEvidence } from '@energyrd/api-contracts';
import { CLAIM_EVENT_LABEL, claimEvidenceLines, isClaimFinished, validateClaimForm, type ClaimFormInput } from './claims';

const ok: ClaimFormInput = { kind: 'billing_error', billId: 'b1', subject: 'Cobro mayor', description: 'Creo que el cobro de agosto es más alto.', amount: '', reference: '' };
const m = (value: string, unit: string, quality: 'REAL' | 'ESTIMATED') => ({ value, unit, quality });
const evidence = (previous = true): ClaimEvidence => ({
  bill: { period_start: '2026-08-01', period_end: '2026-08-30', days: 30, kwh: m('390.00', 'kWh', 'REAL'), amount_dop: m('5460.00', 'RD$', 'REAL'), avg_price_per_kwh: m('14.00', 'RD$/kWh', 'ESTIMATED') },
  previous: previous ? { period_start: '2026-07-01', period_end: '2026-07-30', days: 30, kwh: m('300.00', 'kWh', 'REAL'), amount_dop: m('3900.00', 'RD$', 'REAL'), avg_price_per_kwh: null, kwh_pct: m('30.00', '%', 'ESTIMATED'), amount_pct: null } : null,
  readings_in_period: 2, document_id: null, captured_at: '2026-10-15T10:00:00Z', note: 'n',
});

describe('reclamaciones (ERD-CLAIM-01)', () => {
  it('valida y normaliza como la API', () => {
    const r = validateClaimForm({ ...ok, amount: '1,250.50', reference: ' R-1 ', subject: '  Cobro mayor ' });
    expect(r).toEqual({ ok: true, value: { kind: 'billing_error', bill_id: 'b1', subject: 'Cobro mayor', description: ok.description, disputed_amount_dop: '1250.50', reference_number: 'R-1' } });
    expect(validateClaimForm({ ...ok, amount: '', reference: '' })).toMatchObject({ ok: true, value: { disputed_amount_dop: null, reference_number: null } });
  });
  it('exige factura solo en los tipos de cobro/consumo', () => {
    expect(validateClaimForm({ ...ok, billId: '' })).toMatchObject({ ok: false, errors: { billId: expect.any(String) } });
    expect(validateClaimForm({ ...ok, kind: 'service_quality', billId: '' })).toMatchObject({ ok: true, value: { bill_id: null } });
  });
  it('rechaza campos fuera de rango', () => {
    const bad = validateClaimForm({ kind: '', billId: '', subject: 'ab', description: 'corto', amount: '0', reference: 'x'.repeat(61) });
    expect(bad).toMatchObject({ ok: false });
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['amount', 'description', 'kind', 'reference', 'subject']);
    expect(validateClaimForm({ ...ok, amount: '10.123' })).toMatchObject({ ok: false });
    expect(validateClaimForm({ ...ok, amount: '-5' })).toMatchObject({ ok: false });
  });
  it('el resumen muestra cifras con su calidad y nunca concluye un error', () => {
    const lines = claimEvidenceLines(evidence());
    expect(lines.find(l => l.label === 'Consumo facturado')?.value).toBe('390 kWh');
    expect(lines.find(l => l.label === 'Cambio de consumo (estimado)')?.value).toContain('30');
    expect(lines.find(l => l.label === 'Precio medio (estimado)')).toBeTruthy();
    expect(claimEvidenceLines(evidence(false)).find(l => l.label === 'Factura anterior')?.value).toBe('No hay una factura anterior registrada.');
    expect(JSON.stringify(lines).toLowerCase()).not.toMatch(/error de la distribuidora|cobr[oó] de m[aá]s|fraude/);
  });
  it('estados y etiquetas', () => {
    expect(isClaimFinished('closed') && isClaimFinished('resolved')).toBe(true);
    expect(isClaimFinished('open') || isClaimFinished('in_review')).toBe(false);
    expect(CLAIM_EVENT_LABEL('status', 'closed')).toBe('Estado: Cerrada');
    expect(CLAIM_EVENT_LABEL('created', 'open')).toBe('Caso creado');
  });
});
