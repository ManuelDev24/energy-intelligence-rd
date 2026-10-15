import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatAnomaly } from './anomaly';

const record = {
  id: '00000000-0000-0000-0000-0000000000a1', home_id: '00000000-0000-0000-0000-000000000001', bill_id: null, kind: 'peak' as const,
  source: 'readings' as const, granularity: 'day' as const, severity: 'warning' as const, confidence: 'low' as const, status: 'open' as const,
  observed_kwh: '8.5', baseline_kwh: '5.0', delta_pct: '70', days: '1.00', period_start: '2026-09-01', period_end: '2026-09-01',
  explanation: 'Consumo por encima de la línea base.', detected_at: '2026-10-01T12:00:00Z', last_seen_at: '2026-10-02T12:00:00Z',
};

describe('mobile anomaly formatting', () => {
  it('keeps the API explanation and renders a calm period summary', () => {
    expect(formatAnomaly(record)).toMatchObject({ delta: '+70%', title: 'Pico de consumo en un día', confidence: 'Confianza baja', period: '1 sep 2026' });
  });
  it('a night anomaly has no percentage and says it is compared with the average pace', () => {
    expect(formatAnomaly({ ...record, kind: 'night', delta_pct: null })).toMatchObject({ delta: null, baselineLabel: 'Al ritmo promedio' });
  });
});

describe('estructura de la sección de desviaciones (no hay render de React Native en vitest)', () => {
  const section = readFileSync(new URL('../features/dashboard/AnomaliesSection.tsx', import.meta.url), 'utf8');
  it('investiga solo lo de lecturas, abre la factura de lo de facturas y permite descartar con nombre accesible', () => {
    expect(section).toContain('canInvestigate(anomaly)');
    expect(section).toContain('onOpenBill && anomaly.bill_id');
    expect(section).toContain('accessibilityLabel={`Descartar la desviación de ${view.period}`}');
    expect(section).toContain('key={anomaly.id}');
  });
  it('el panel descarta con el estado «dismissed» y abre el detalle de factura', () => {
    const dashboard = readFileSync(new URL('../features/dashboard/DashboardScreen.tsx', import.meta.url), 'utf8');
    expect(dashboard).toContain("status: 'dismissed'");
    expect(dashboard).toContain('onOpenBill');
    const nav = readFileSync(new URL('../navigation/AppNavigator.tsx', import.meta.url), 'utf8');
    expect(nav).toContain("navigation.navigate('BillDetail', { homeId, billId })");
  });
});
