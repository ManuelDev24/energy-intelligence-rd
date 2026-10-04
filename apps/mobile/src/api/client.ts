import { API_URL } from '../config';
import type {
  Alert, AlertStatus, Bill, BillInput, Dashboard, Equipment, EquipmentEstimate, EquipmentInput, Home,
} from './types';

export class ApiError extends Error {
  constructor(
    public readonly status: number, // 0 = sin conexión / timeout
    message: string,
    public readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get isNetwork() {
    return this.status === 0;
  }
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  room: 'Habitación',
  power_w: 'Potencia (W)',
  hours_per_day: 'Horas de uso por día',
  period_start: 'Inicio del período',
  period_end: 'Fin del período',
  kwh: 'kWh',
  amount_dop: 'Monto RD$',
  days: 'Días',
  reading_previous: 'Lectura anterior',
  reading_current: 'Lectura actual',
};

/** Convierte el cuerpo de error de FastAPI (422 lista / 4xx detail string) en mensaje legible. */
export function parseErrorBody(status: number, body: unknown): ApiError {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (Array.isArray(detail)) {
    const fieldErrors: Record<string, string> = {};
    const msgs: string[] = [];
    for (const d of detail as { loc?: (string | number)[]; msg?: string }[]) {
      const field = String(d.loc?.[d.loc.length - 1] ?? '');
      const msg = (d.msg ?? 'valor inválido').replace(/^Value error, /, '');
      if (field in FIELD_LABELS) fieldErrors[field] = msg;
      msgs.push(field in FIELD_LABELS ? `${FIELD_LABELS[field]}: ${msg}` : msg);
    }
    return new ApiError(status, msgs.join('\n') || 'Datos inválidos', fieldErrors);
  }
  if (typeof detail === 'string') return new ApiError(status, detail);
  if (status === 404) return new ApiError(status, 'No encontrado');
  if (status >= 500) return new ApiError(status, 'Error del servidor. Intente de nuevo.');
  return new ApiError(status, `Error ${status}`);
}

const TIMEOUT_MS = 10000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, `No se pudo conectar con el servidor (${API_URL}). Verifique su conexión.`);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return undefined as T;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* cuerpo no JSON */
  }
  if (!res.ok) throw parseErrorBody(res.status, body);
  return body as T;
}

export const api = {
  listHomes: () => request<Home[]>('/api/v1/homes'),
  listBills: (homeId: string) => request<Bill[]>(`/api/v1/homes/${homeId}/bills`),
  createBill: (homeId: string, input: BillInput) =>
    request<Bill>(`/api/v1/homes/${homeId}/bills`, { method: 'POST', body: JSON.stringify(input) }),
  deleteBill: (homeId: string, billId: string) =>
    request<void>(`/api/v1/homes/${homeId}/bills/${billId}`, { method: 'DELETE' }),
  getDashboard: (homeId: string) => request<Dashboard>(`/api/v1/homes/${homeId}/dashboard`),

  listEquipment: (homeId: string) => request<Equipment[]>(`/api/v1/homes/${homeId}/equipment`),
  getEquipment: (homeId: string, id: string) => request<Equipment>(`/api/v1/homes/${homeId}/equipment/${id}`),
  createEquipment: (homeId: string, input: EquipmentInput) =>
    request<Equipment>(`/api/v1/homes/${homeId}/equipment`, { method: 'POST', body: JSON.stringify(input) }),
  updateEquipment: (homeId: string, id: string, input: EquipmentInput) =>
    request<Equipment>(`/api/v1/homes/${homeId}/equipment/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteEquipment: (homeId: string, id: string) =>
    request<void>(`/api/v1/homes/${homeId}/equipment/${id}`, { method: 'DELETE' }),
  getEstimate: (homeId: string) => request<EquipmentEstimate>(`/api/v1/homes/${homeId}/equipment/estimate`),

  listAlerts: (homeId: string) => request<Alert[]>(`/api/v1/homes/${homeId}/alerts`),
  setAlertStatus: (homeId: string, id: string, status: AlertStatus) =>
    request<Alert>(`/api/v1/homes/${homeId}/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};
