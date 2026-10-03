import type { DashboardState, Home, MonthlyConsumption } from './types';

export const demoHomes: readonly Home[] = [
  { id: 'home-1', name: 'Hogar · Santo Domingo' },
  { id: 'home-2', name: 'Apartamento · Santiago' },
];
export const demoConsumption: readonly MonthlyConsumption[] = [
  { id: '1', homeId: 'home-1', month: '2026-01', kWh: 240, status: 'REAL', source: 'Factura de demostración' },
  { id: '2', homeId: 'home-1', month: '2026-02', kWh: 228, status: 'REAL', source: 'Factura de demostración' },
  { id: '3', homeId: 'home-1', month: '2026-03', kWh: 260, status: 'ESTIMATED', source: 'Estimación de demostración' },
  { id: '4', homeId: 'home-1', month: '2026-04', kWh: 252, status: 'INFERRED', source: 'Modelo de demostración' },
  { id: '5', homeId: 'home-1', month: '2026-05', kWh: 280, status: 'PROJECTED', source: 'Proyección de demostración' },
  { id: '6', homeId: 'home-2', month: '2026-01', kWh: 180, status: 'REAL', source: 'Factura de demostración' },
  { id: '7', homeId: 'home-2', month: '2026-02', kWh: 0, status: 'REAL', source: 'Factura de demostración' },
];
export const demoStates = {
  loading: { kind: 'loading' },
  empty: { kind: 'empty' },
  error: { kind: 'error', message: 'No pudimos cargar el consumo. Intenta nuevamente.' },
  demo: { kind: 'demo', records: demoConsumption },
} satisfies Record<string, DashboardState>;
