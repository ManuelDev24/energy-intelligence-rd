// Contrato de la API /api/v1 (services/api). Los Decimal viajan como string.
export type Distributor = 'EDESUR' | 'EDENORTE' | 'EDEESTE' | 'Otra';
export type Quality = 'REAL' | 'ESTIMATED' | 'PROJECTED';
export type Severity = 'warning' | 'critical';

export interface Home {
  id: string;
  code: string | null;
  name: string;
  address: string | null;
  city: string | null;
  distributor: Distributor;
  created_at: string;
}

export interface Bill {
  id: string;
  home_id: string;
  period_start: string;
  period_end: string;
  kwh: string;
  amount_dop: string;
  days: number;
  reading_previous: string | null;
  reading_current: string | null;
  source: 'manual' | 'seed';
  created_at: string;
}

export interface BillInput {
  period_start: string;
  period_end: string;
  kwh: string;
  amount_dop: string;
  days: number;
  reading_previous?: string | null;
  reading_current?: string | null;
}

export interface Metric {
  value: string;
  unit: string;
  quality: Quality;
}

export interface Dashboard {
  home: { id: string; code: string | null; name: string; distributor: string };
  latest_bill: {
    bill_id: string;
    period_start: string;
    period_end: string;
    days: number;
    kwh: Metric;
    amount_dop: Metric;
    avg_daily_kwh: Metric | null;
    avg_price_per_kwh: Metric | null;
    source: 'manual' | 'seed';
  } | null;
  comparison: {
    previous_bill_id: string;
    previous_period_start: string;
    previous_period_end: string;
    kwh_delta: Metric;
    kwh_pct: Metric | null;
    amount_delta: Metric;
    amount_pct: Metric | null;
  } | null;
  projection: {
    method: string;
    bills_used: number;
    kwh: Metric;
    amount_dop: Metric;
    note: string;
  } | null;
  alert: {
    severity: Severity;
    message: string;
    basis_period_start: string;
    basis_period_end: string;
  } | null;
  recommendation: string | null;
  data_status: {
    bills_count: number;
    data_source: 'manual' | 'seed' | 'mixed' | 'none';
    is_demo: boolean;
    resolution: 'monthly';
    hourly_data_available: boolean;
    insufficient_reasons: string[];
  };
  quality_legend: Record<Quality, string>;
}
