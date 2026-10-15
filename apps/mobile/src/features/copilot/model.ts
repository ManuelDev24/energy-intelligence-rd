// ERD-AI-CHAT-MOBILE: lógica pura del chat (estado del turno, período, mensajes de error locales). Sin React Native: se prueba en Node.
import { ApiError } from '@energyrd/api-client';
import type { CopilotEvent } from './stream';

export type StreamState =
  | { phase: 'idle' }
  | { phase: 'streaming' | 'cancelled' | 'error' | 'refused'; question: string; text: string; tool: string | null; message?: string };

export type StreamAction =
  | { type: 'start'; question: string }
  | { type: 'event'; event: CopilotEvent }
  | { type: 'cancelled' }
  | { type: 'failed'; message: string }
  | { type: 'ended' }
  | { type: 'reset' };

/** Textos del rechazo y de los fallos del proveedor: SIEMPRE locales; el texto que envíe el servidor no se muestra. */
export const REFUSED_MESSAGE = 'El Copilot no puede ayudar con esa solicitud.';
export const PROVIDER_MESSAGE = 'El Copilot no pudo responder ahora. Inténtalo de nuevo en unos minutos.';
export const CUT_MESSAGE = 'La respuesta se cortó antes de terminar.';

export function streamReducer(state: StreamState, action: StreamAction): StreamState {
  if (action.type === 'start') return { phase: 'streaming', question: action.question, text: '', tool: null };
  if (action.type === 'reset') return { phase: 'idle' };
  if (state.phase === 'idle') return state;
  switch (action.type) {
    case 'cancelled': return { ...state, phase: 'cancelled', tool: null };
    case 'failed': return { ...state, phase: 'error', tool: null, message: action.message };
    case 'ended': return state.phase === 'streaming' ? { ...state, phase: 'error', tool: null, message: CUT_MESSAGE } : state;
    case 'event': {
      const { event } = action;
      if (event.event === 'delta') return { ...state, text: state.text + event.data.text, tool: null };
      if (event.event === 'tool') return { ...state, tool: event.data.label };
      if (event.event === 'refused') return { ...state, phase: 'refused', text: '', tool: null, message: REFUSED_MESSAGE };
      if (event.event === 'error') return { ...state, phase: 'error', tool: null, message: PROVIDER_MESSAGE };
      if (event.event === 'done') return state.phase === 'refused' ? state : { phase: 'idle' };
      return state;
    }
  }
}

/** Mensaje para la persona según el estado/código de la API. Nunca el `detail` del servidor. */
export function copilotErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) return 'No se pudo completar la solicitud.';
  if (error.code === 'copilot_limit' || error.status === 429) return 'Alcanzaste el límite diario del Copilot. Vuelve a intentarlo mañana.';
  if (error.code === 'copilot_disabled' || error.status === 503) return 'El Copilot no está disponible en este momento.';
  if (error.status === 0) return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
  if (error.status === 401) return 'La sesión venció. Inicia sesión de nuevo.';
  if (error.status === 404) return 'La conversación ya no existe. Elige otra o crea una nueva.';
  if (error.status === 422) return 'Revisa la pregunta (máximo 4000 caracteres) y el período.';
  return PROVIDER_MESSAGE;
}

const DAY = 86_400_000;
export const shiftDay = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Período válido: fechas reales, desde ≤ hasta ≤ hoy y como máximo 366 días (mismo criterio que la API y la web). */
export function periodIsValid(from: string, to: string, today: string): boolean {
  if (!ISO.test(from) || !ISO.test(to) || Number.isNaN(Date.parse(`${from}T12:00:00Z`)) || Number.isNaN(Date.parse(`${to}T12:00:00Z`))) return false;
  return from <= to && to <= today && shiftDay(from, 366) >= to;
}

export function messageStatusNote(status: string): string | null {
  return status === 'cancelled' ? 'Respuesta cancelada.' : status === 'error' ? 'El Copilot no pudo responder.'
    : status === 'refused' ? REFUSED_MESSAGE : null;
}

/** Marca de lectura para el lector de pantalla: quién habla y la calidad de cada fuente. */
export function sourceSummary(source: { label: string; quality: string }): string {
  const quality = { REAL: 'dato real', ESTIMATED: 'dato estimado', PROJECTED: 'dato proyectado', INFERRED: 'dato inferido' }[source.quality] ?? 'calidad desconocida';
  return `${source.label}, ${quality}`;
}

/** La pregunta ya guardada aparece en el historial al refrescar; no se muestra dos veces mientras llega la respuesta. */
export function showPendingQuestion(history: ReadonlyArray<{ role: string; content: string }>, question: string): boolean {
  const last = history[history.length - 1];
  return !(last && last.role === 'user' && last.content === question);
}

export type LinkTarget =
  | { kind: 'tab'; tab: 'Dashboard' | 'Consumption' | 'Bills' | 'Equipment' | 'Alerts' }
  | { kind: 'screen'; name: 'Readings' | 'Savings' | 'GoalForm' | 'Outages' | 'Profile' }
  | { kind: 'bill'; billId: string };

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const TABS: Record<string, LinkTarget> = {
  '/dashboard': { kind: 'tab', tab: 'Dashboard' }, '/consumption': { kind: 'tab', tab: 'Consumption' }, '/bills': { kind: 'tab', tab: 'Bills' },
  '/equipment': { kind: 'tab', tab: 'Equipment' }, '/alerts': { kind: 'tab', tab: 'Alerts' },
  '/readings': { kind: 'screen', name: 'Readings' }, '/savings': { kind: 'screen', name: 'Savings' }, '/goal': { kind: 'screen', name: 'GoalForm' },
  '/outages': { kind: 'screen', name: 'Outages' }, '/profile': { kind: 'screen', name: 'Profile' },
};

/** Ruta interna del Copilot (la misma lista que la web) → destino de la app móvil. Lo desconocido devuelve null y no navega. */
export function linkTarget(href: string): LinkTarget | null {
  const path = href.split(/[?#]/, 1)[0];
  if (TABS[path]) return TABS[path];
  const bill = /^\/bills\/([^/]+)$/.exec(path);
  return bill && UUID_RE.test(bill[1]) ? { kind: 'bill', billId: bill[1] } : null;
}

export const PERIODS = [
  { key: '30', label: '30 días', days: 29 },
  { key: '90', label: '90 días', days: 89 },
  { key: '365', label: '12 meses', days: 364 },
] as const;
export type PeriodKey = (typeof PERIODS)[number]['key'];
export const periodFor = (key: PeriodKey, today: string) => ({ from: shiftDay(today, -(PERIODS.find((p) => p.key === key)?.days ?? 29)), to: today });
