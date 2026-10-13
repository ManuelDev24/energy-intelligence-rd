import { describe, expect, it } from 'vitest';

import type { BillAssessment } from '@energyrd/api-contracts';

import { APPROVAL_NOTE, ORIGIN_UNKNOWN, ORIGINAL_RECORDED, assessmentView } from './assessmentModel';

const HOME = '00000000-0000-4000-8000-000000000001';
const BILL = '00000000-0000-4000-8000-000000000002';
const detail = { home_id: HOME, bill_id: BILL, items: [], items_total_dop: null, bill_amount_dop: '3100.00', difference_dop: null };
const assessment = (over: Partial<BillAssessment> = {}): BillAssessment => ({
  home_id: HOME, bill_id: BILL, read_only: true, approval: 'not_performed', status: 'consistent',
  checks: [], warnings: [],
  provenance: { origin: 'creation', original_available: true, data: {}, captured_at: '2026-09-01T14:00:00Z' },
  corrections: [], corrections_has_more: false, detail, ...over,
});

describe('revisión de consistencia (solo lectura, nunca aprueba)', () => {
  it('siempre incluye el aviso de que la revisión no aprueba la factura', () => {
    expect(APPROVAL_NOTE).toBe('Esta revisión no aprueba la factura.');
    expect(assessmentView(assessment()).approvalNote).toBe(APPROVAL_NOTE);
  });

  it('estado general con icono y texto', () => {
    expect(assessmentView(assessment()).status).toMatchObject({ label: 'Sin inconsistencias detectadas', tone: 'success' });
    expect(assessmentView(assessment({ status: 'warnings' })).status).toMatchObject({ label: 'Con advertencias', tone: 'warning' });
    expect(assessmentView(assessment({ status: 'incomplete' })).status).toMatchObject({ label: 'Revisión incompleta: faltan datos', tone: 'neutral' });
    for (const s of ['consistent', 'warnings', 'incomplete'] as const) expect(assessmentView(assessment({ status: s })).status.icon).toBeTruthy();
  });

  it('cada comprobación tiene icono + texto de estado + título local; código desconocido no muestra texto del servidor', () => {
    const v = assessmentView(assessment({ checks: [
      { code: 'period_order', status: 'pass', observed: {} },
      { code: 'days_consistency', status: 'warning', observed: { declared_days: 31, elapsed_days: 29, inclusive_days: 30, convention: 'unspecified' } },
      { code: 'readings_kwh', status: 'unavailable', observed: {} },
      { code: '<b>hack</b>', status: 'warning', observed: { x: '<script>' } },
    ] }));
    expect(v.checks.map((c) => [c.title, c.statusText])).toEqual([
      ['Orden del período', 'Correcto'],
      ['Días facturados', 'Advertencia'],
      ['Lecturas y consumo', 'Sin datos'],
      ['Comprobación adicional', 'Advertencia'],
    ]);
    expect(new Set(v.checks.map((c) => c.icon)).size).toBe(3);
    expect(v.checks[1].detail).toBe('Declarados: 31 días · período: 29 días (30 contando ambos extremos).');
    expect(JSON.stringify(v)).not.toMatch(/hack|script/);
  });

  it('advertencias redactadas localmente, sin repetir', () => {
    const v = assessmentView(assessment({ warnings: ['items_sum', 'original_unverified', 'items_sum', 'zzz'] }));
    expect(v.warnings).toEqual([
      'El detalle de ítems no cuadra con el total de la factura.',
      'No hay original registrado de esta factura para comparar.',
      'Otra advertencia de calidad de dato.',
    ]);
  });

  it('procedencia: creation = original registrado; migration/unknown = origen desconocido; nunca "verificado"', () => {
    expect(ORIGINAL_RECORDED).toBe('Original registrado');
    expect(ORIGIN_UNKNOWN).toBe('Origen desconocido — dato anterior al registro de originales');
    expect(assessmentView(assessment()).provenance).toMatchObject({ text: 'Original registrado', tone: 'success' });
    for (const origin of ['migration', 'unknown'] as const) {
      const v = assessmentView(assessment({ status: 'warnings', provenance: { origin, original_available: false, data: null, captured_at: null } }));
      expect(v.provenance).toMatchObject({ text: ORIGIN_UNKNOWN, tone: 'warning' });
    }
    for (const origin of ['creation', 'migration', 'unknown'] as const)
      expect(JSON.stringify(assessmentView(assessment({ provenance: { origin, original_available: origin === 'creation', data: null, captured_at: null } })))).not.toMatch(/verificad/i);
  });

  it('correcciones: antes/después con fecha local RD; solo campos conocidos de la factura', () => {
    const v = assessmentView(assessment({ corrections: [
      { entity: 'bills', operation: 'update', created_at: '2026-09-02T12:30:00Z',
        before: { amount_dop: '3000.00', kwh: '400.00', days: 30, secret: 'x' }, after: { amount_dop: '3100.00', kwh: '400.00', days: 30, secret: 'y' } },
      { entity: 'bill_items', operation: 'replace', created_at: '2026-09-03T00:15:00Z',
        before: { items: [] }, after: { items: [{ label: 'A', kind: 'charge', amount_dop: '3200.00' }, { label: 'B', kind: 'discount', amount_dop: '-100.00' }] } },
    ] }));
    expect(v.corrections[0]).toEqual({ key: '0', dateText: '2 sep 2026, 08:30', title: 'Factura corregida',
      changes: [{ field: 'Monto total', before: 'RD$ 3,000.00', after: 'RD$ 3,100.00' }] });
    expect(v.corrections[1]).toEqual({ key: '1', dateText: '2 sep 2026, 20:15', title: 'Detalle de ítems reemplazado',
      changes: [{ field: 'Ítems', before: '0', after: '2' }, { field: 'Total de ítems', before: 'Sin detalle', after: 'RD$ 3,100.00' }] });
    expect(JSON.stringify(v)).not.toMatch(/secret/);
    expect(v.correctionsNote).toBeNull();
  });

  it('sin correcciones o con recorte lo dice', () => {
    expect(assessmentView(assessment()).correctionsNote).toBe('Sin correcciones registradas.');
    expect(assessmentView(assessment({ corrections_has_more: true, corrections: [
      { entity: 'bills', operation: 'update', created_at: '2026-09-02T12:30:00Z', before: { days: 30 }, after: { days: 31 } },
    ] })).correctionsNote).toMatch(/100 correcciones más recientes/);
  });
});
