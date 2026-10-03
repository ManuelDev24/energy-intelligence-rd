import type { EnergyData, EnergyHome } from './api';

export const demoEnergyHomes: EnergyHome[] = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Hogar demo · Santo Domingo', distributor: 'EDESUR' },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Hogar demo · Santiago', distributor: 'EDENORTE' },
];
export function demoEnergy(home: EnergyHome): EnergyData {
  const bills = home.id === demoEnergyHomes[0].id ? [
    { id: '00000000-0000-4000-8000-000000000011', home_id: home.id, period_start: '2026-01-01', period_end: '2026-01-31', kwh: 200, amount_dop: 1800, source: 'seed' as const },
    { id: '00000000-0000-4000-8000-000000000012', home_id: home.id, period_start: '2026-02-01', period_end: '2026-02-28', kwh: 250, amount_dop: 2250, source: 'seed' as const },
  ] : [];
  return { bills, dashboard: {
    home,
    projection: bills.length ? { method: 'linear_trend', bills_used: 2,
      kwh: { value: 300, unit: 'kWh', quality: 'PROJECTED' },
      amount_dop: { value: 2700, unit: 'RD$', quality: 'PROJECTED' },
      note: 'Proyección ficticia de la próxima factura; no incluye cambios de tarifa.' } : null,
    alert: bills.length ? { severity: 'warning', message: 'Ejemplo demo: el consumo subió 25 %.', basis_period_start: '2026-01-01', basis_period_end: '2026-01-31' } : null,
    recommendation: bills.length ? 'Ejemplo demo: revisa el tiempo de uso de equipos y compara con tu rutina anterior.' : null,
    data_status: { is_demo: true, resolution: 'monthly', insufficient_reasons: bills.length ? [] : ['No hay facturas en esta vivienda demo.'] },
  } };
}
