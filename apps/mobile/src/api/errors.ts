import { ApiError, ContractError, parseErrorBody } from '@energyrd/api-client';

/**
 * Domain API errors shown in the UI. The shared parser copies the server's `detail`/`msg` verbatim,
 * and a server/proxy can echo anything (tokens, markup, stack traces). The mobile app therefore
 * renders ONLY locally authored Spanish text: messages by status/code, field messages through an
 * allowlist. Server text is discarded.
 */
export const NETWORK_MESSAGE = 'No se pudo conectar con la API. Compruebe su conexión e intente de nuevo.';
const UNEXPECTED = 'Ocurrió un error inesperado';
const STATUS_MESSAGES: Record<number, string> = {
  0: NETWORK_MESSAGE,
  400: 'La solicitud no es válida. Revise los datos e intente de nuevo.',
  401: 'La sesión terminó. Inicie sesión de nuevo.',
  403: 'No tiene acceso a este recurso.',
  404: 'No se encontró el registro solicitado. Actualice e intente de nuevo.',
  409: 'Los datos entran en conflicto con un registro existente (por ejemplo, un período que se solapa). Revise e intente de nuevo.',
  422: 'Revise los campos indicados.',
  429: 'Demasiadas solicitudes. Espere un momento e intente de nuevo.',
};
/** API field name → local message. Any field not listed is dropped. */
const FIELD_MESSAGES: Record<string, string> = {
  name: 'Revise el nombre.',
  distributor: 'Seleccione una distribuidora válida.',
  province: 'Ingrese una provincia de hasta 120 caracteres.',
  municipality: 'Ingrese un municipio de hasta 120 caracteres.',
  sector: 'Ingrese un sector de hasta 120 caracteres.',
  user_type: 'Describa el tipo de usuario con hasta 120 caracteres.',
  occupants: 'Ingrese entre 1 y 999 ocupantes.',
  address: 'La dirección admite hasta 255 caracteres.',
  city: 'La ciudad admite hasta 120 caracteres.',
  account_number: 'Ingrese un número de contrato de 1 a 120 caracteres.',
  has_ac: 'Seleccione Sin indicar, Sí o No para aire acondicionado.',
  has_water_heater: 'Seleccione Sin indicar, Sí o No para calentador de agua.',
  has_pool: 'Seleccione Sin indicar, Sí o No para piscina.',
  has_solar: 'Seleccione Sin indicar, Sí o No para paneles solares.',
  has_inverter: 'Seleccione Sin indicar, Sí o No para inversor.',
  period_start: 'Revise la fecha de inicio del período (AAAA-MM-DD).',
  period_end: 'Revise la fecha de fin del período (AAAA-MM-DD).',
  days: 'Revise los días del período.',
  kwh: 'Revise el consumo (kWh).',
  amount_dop: 'Revise el monto total (RD$).',
  reading_previous: 'Revise la lectura anterior.',
  reading_current: 'Revise la lectura actual.',
  room: 'Revise la habitación.',
  power_w: 'Revise la potencia (W).',
  hours_per_day: 'Revise las horas de uso por día (0–24).',
  // Fase 2: lecturas del medidor y metas mensuales.
  read_at: 'Revise la fecha y hora de la lectura (no puede ser futura).',
  reading_kwh: 'Revise la lectura del medidor (kWh, no negativa, máximo 2 decimales).',
  note: 'La nota admite hasta 255 caracteres.',
  monthly_amount_rd: 'Revise la meta de monto (RD$, mayor que 0).',
  monthly_kwh: 'Revise la meta de consumo (kWh, mayor que 0).',
};
const KNOWN_CODES = new Set(['validation_error', 'invalid_input', 'not_found', 'conflict', 'invalid_response']);
const own = (table: Record<string | number, string>, key: string | number) =>
  Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;

/** Errors whose message/fieldErrors were authored here and are safe to render. */
const safe = new WeakSet<ApiError>();
export function localApiError(status: number, message: string, fieldErrors: Record<string, string> = {}, code?: string, requestId?: string) {
  const error = new ApiError(status, message, fieldErrors, code, requestId);
  safe.add(error);
  return error;
}
export const messageForStatus = (status: number) =>
  own(STATUS_MESSAGES, status) ?? (status >= 500 ? 'Error del servidor. Intente de nuevo.' : 'No se pudo completar la solicitud. Intente de nuevo.');

/** Rebuilds any ApiError from local text only; ContractError (local text, never retried) is kept. */
export function sanitizeApiError(error: unknown): unknown {
  if (!(error instanceof ApiError) || error instanceof ContractError || safe.has(error)) return error;
  const fields: Record<string, string> = {};
  for (const key of Object.keys(error.fieldErrors ?? {})) {
    const message = own(FIELD_MESSAGES, key);
    if (message) fields[key] = message;
  }
  const code = error.code && (KNOWN_CODES.has(error.code) || /^http_\d{3}$/.test(error.code)) ? error.code : undefined;
  const requestId = error.requestId && /^[A-Za-z0-9_-]{1,64}$/.test(error.requestId) ? error.requestId : undefined;
  return localApiError(error.status, messageForStatus(error.status), fields, code, requestId);
}
/** Local replacement for the shared parser at the HTTP boundary. */
export const serverError = (status: number, body: unknown) => sanitizeApiError(parseErrorBody(status, body)) as ApiError;

/** Wraps every async method so no raw server error escapes the typed API object. */
export function guardApiErrors<T extends object>(client: T): T {
  const guarded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(client)) {
    guarded[key] = typeof value !== 'function' ? value : async (...args: unknown[]) => {
      try { return await (value as (...a: unknown[]) => unknown)(...args); }
      catch (error) { throw sanitizeApiError(error); }
    };
  }
  return guarded as T;
}

/** Text for ErrorState/forms: never an arbitrary `Error.message`. */
export function describeError(error: unknown) {
  const offline = error instanceof ApiError && error.status === 0;
  const message = error instanceof ApiError
    ? (error instanceof ContractError || safe.has(error) ? error.message : messageForStatus(error.status))
    : UNEXPECTED;
  return { offline, message };
}
