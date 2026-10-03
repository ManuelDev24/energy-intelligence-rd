export const DATA_STATUSES = ['REAL', 'ESTIMATED', 'PROJECTED', 'INFERRED'] as const;
export type DataStatus = (typeof DATA_STATUSES)[number];

/** Monthly totals only: invoices do not establish an hourly consumption curve. */
export interface MonthlyConsumption {
  id: string;
  homeId: string;
  month: string; // YYYY-MM
  kWh: number;
  status: DataStatus;
  source: string;
}
export interface Home { id: string; name: string }
export interface ConsumptionFilters {
  homeId: string;
  year: string;
  status: DataStatus | 'ALL';
}
export type DashboardState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'ready' | 'demo'; records: readonly MonthlyConsumption[] };
