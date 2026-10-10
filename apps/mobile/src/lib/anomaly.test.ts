import { describe, expect, it } from 'vitest';
import { formatAnomaly } from './anomaly';

describe('mobile anomaly formatting', () => {
  it('keeps the API explanation and renders a calm period summary', () => {
    expect(formatAnomaly({
      home_id: '00000000-0000-0000-0000-000000000001', granularity: 'day', severity: 'warning',
      observed_kwh: '8.5', baseline_kwh: '5.0', delta_pct: '70', period_start: '2026-09-01', period_end: '2026-09-01',
      explanation: 'Consumo por encima de la línea base.',
    }).delta).toBe('+70%');
  });
});
