import { ApiError } from '@energyrd/api-client';
import { describe, expect, it, vi } from 'vitest';
import { copilotErrorText, periodIsValid, shiftDay, showPendingQuestion, sourceSummary, streamReducer, type StreamState } from './model';
import { MAX_STREAM_CHARS, streamCopilotTurn, type CopilotEvent } from './stream';

const HOME = 'aaaaaaaa-0000-4000-8000-000000000001';
const CONV = 'cccccccc-0000-4000-8000-000000000001';
const MSG = 'dddddddd-0000-4000-8000-000000000001';
const message = { id: MSG, conversation_id: CONV, role: 'assistant', content: 'Hola', status: 'complete', sources: [], tools: [], feedback: null, created_at: '2026-10-14T10:00:00Z' };
const enc = new TextEncoder();
const sse = (events: Array<[string, unknown]>) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
const streamResponse = (chunks: string[], init: ResponseInit = { status: 200, headers: { 'content-type': 'text/event-stream' } }) =>
  new Response(new ReadableStream({ start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); } }), init);

describe('streamCopilotTurn', () => {
  it('lee eventos partidos entre fragmentos y descarta los inválidos', async () => {
    const body = sse([['start', {}], ['tool', { name: 'list_bills', label: 'Consultando facturas' }], ['delta', { text: 'Tu factura' }], ['bogus', { x: 1 }], ['done', { message, warnings: [] }]]);
    const cut = Math.floor(body.length / 2);
    const fetchMock = vi.fn().mockResolvedValue(streamResponse([body.slice(0, cut), body.slice(cut)]));
    const seen: CopilotEvent[] = [];
    await streamCopilotTurn('https://api.test/', HOME, CONV, { content: 'hola', period_from: '2026-09-01', period_to: '2026-09-30' }, e => seen.push(e), new AbortController().signal, fetchMock);
    expect(seen.map(e => e.event)).toEqual(['start', 'tool', 'delta', 'done']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.test/api/v1/homes/${HOME}/copilot/conversations/${CONV}/messages`);
    expect(JSON.parse(init.body)).toEqual({ content: 'hola', period_from: '2026-09-01', period_to: '2026-09-30' });
  });

  it('sin flujo en la respuesta lee el texto completo', async () => {
    const response = { ok: true, status: 200, headers: new Headers({ 'content-type': 'text/event-stream' }), body: null, text: async () => sse([['delta', { text: 'x' }]]) } as unknown as Response;
    const seen: CopilotEvent[] = [];
    await streamCopilotTurn('https://api.test', HOME, CONV, { content: 'hola' }, e => seen.push(e), new AbortController().signal, vi.fn().mockResolvedValue(response));
    expect(seen).toHaveLength(1);
  });

  it('rechazos de la API: límite con Retry-After, y no es flujo', async () => {
    const limited = new Response(JSON.stringify({ detail: 'interno', code: 'copilot_limit' }), { status: 429, headers: { 'Retry-After': '3600' } });
    const error = await streamCopilotTurn('https://api.test', HOME, CONV, { content: 'a' }, () => undefined, new AbortController().signal, vi.fn().mockResolvedValue(limited)).catch(e => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(429);
    expect(copilotErrorText(error)).toBe('Alcanzaste el límite diario del Copilot. Vuelve a intentarlo mañana.');
    const html = new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } });
    await expect(streamCopilotTurn('https://api.test', HOME, CONV, { content: 'a' }, () => undefined, new AbortController().signal, vi.fn().mockResolvedValue(html))).rejects.toMatchObject({ status: 502 });
  });

  it('error de red es status 0; abortar propaga el aborto', async () => {
    const down = await streamCopilotTurn('https://api.test', HOME, CONV, { content: 'a' }, () => undefined, new AbortController().signal, vi.fn().mockRejectedValue(new TypeError('Network'))).catch(e => e);
    expect(down).toMatchObject({ status: 0 });
    const abort = new AbortController();
    abort.abort();
    const aborted = await streamCopilotTurn('https://api.test', HOME, CONV, { content: 'a' }, () => undefined, abort.signal, vi.fn().mockRejectedValue(new DOMException('x', 'AbortError'))).catch(e => e);
    expect(aborted.name).toBe('AbortError');
  });

  it('corta una respuesta que supera el tope y rechaza ids que no son UUID', async () => {
    const huge = streamResponse(['event: delta\ndata: ' + 'a'.repeat(MAX_STREAM_CHARS + 10)]);
    await expect(streamCopilotTurn('https://api.test', HOME, CONV, { content: 'a' }, () => undefined, new AbortController().signal, vi.fn().mockResolvedValue(huge))).rejects.toMatchObject({ status: 502 });
    await expect(streamCopilotTurn('https://api.test', '../x', CONV, { content: 'a' }, () => undefined, new AbortController().signal, vi.fn())).rejects.toThrow();
  });
});

describe('streamReducer', () => {
  const start = streamReducer({ phase: 'idle' }, { type: 'start', question: 'q' });
  const ev = (event: CopilotEvent) => ({ type: 'event' as const, event });
  it('acumula texto, muestra la herramienta y termina en reposo', () => {
    let s: StreamState = streamReducer(start, ev({ event: 'tool', data: { name: 'x', label: 'Consultando facturas' } }));
    expect(s).toMatchObject({ phase: 'streaming', tool: 'Consultando facturas' });
    s = streamReducer(s, ev({ event: 'delta', data: { text: 'Hola ' } }));
    s = streamReducer(s, ev({ event: 'delta', data: { text: 'mundo' } }));
    expect(s).toMatchObject({ text: 'Hola mundo', tool: null });
    expect(streamReducer(s, ev({ event: 'done', data: { message, warnings: [] } } as CopilotEvent))).toEqual({ phase: 'idle' });
  });
  it('rechazo y error usan texto local, no el del servidor', () => {
    const refused = streamReducer(start, ev({ event: 'refused', data: { message: 'texto del servidor <b>', message_id: MSG } }));
    expect(refused).toMatchObject({ phase: 'refused', message: 'El Copilot no puede ayudar con esa solicitud.' });
    expect(streamReducer(refused, ev({ event: 'done', data: { message, warnings: [] } } as CopilotEvent)).phase).toBe('refused');
    const failed = streamReducer(start, ev({ event: 'error', data: { code: 'provider_error', message: 'stack trace' } }));
    expect(failed).toMatchObject({ phase: 'error', message: 'El Copilot no pudo responder ahora. Inténtalo de nuevo en unos minutos.' });
  });
  it('cancelar conserva lo recibido; un corte sin «done» es error; en reposo no pasa nada', () => {
    const partial = streamReducer(start, ev({ event: 'delta', data: { text: 'parcial' } }));
    expect(streamReducer(partial, { type: 'cancelled' })).toMatchObject({ phase: 'cancelled', text: 'parcial', question: 'q' });
    expect(streamReducer(partial, { type: 'ended' })).toMatchObject({ phase: 'error', message: 'La respuesta se cortó antes de terminar.' });
    expect(streamReducer({ phase: 'idle' }, { type: 'cancelled' })).toEqual({ phase: 'idle' });
    expect(streamReducer(streamReducer(start, { type: 'cancelled' }), { type: 'ended' }).phase).toBe('cancelled');
  });
});

describe('período, errores y fuentes', () => {
  it('valida el período como la API', () => {
    expect(periodIsValid('2026-09-01', '2026-09-30', '2026-10-14')).toBe(true);
    expect(periodIsValid('2026-09-30', '2026-09-01', '2026-10-14')).toBe(false);
    expect(periodIsValid('2026-09-01', '2026-10-15', '2026-10-14')).toBe(false);
    expect(periodIsValid('2025-01-01', '2026-10-14', '2026-10-14')).toBe(false);
    expect(periodIsValid('2026-02-30x', '2026-03-01', '2026-10-14')).toBe(false);
    expect(shiftDay('2026-10-14', -29)).toBe('2026-09-15');
  });
  it('mensajes de error propios por estado', () => {
    expect(copilotErrorText(new ApiError(0, 'x'))).toMatch(/conectar/);
    expect(copilotErrorText(new ApiError(503, 'x'))).toMatch(/no está disponible/);
    expect(copilotErrorText(new ApiError(401, 'x'))).toMatch(/sesión/);
    expect(copilotErrorText(new ApiError(500, 'secreto interno'))).not.toMatch(/secreto/);
    expect(copilotErrorText(new Error('raro'))).toBe('No se pudo completar la solicitud.');
  });
  it('resumen de fuente con calidad y no duplica la pregunta ya guardada', () => {
    expect(sourceSummary({ label: 'Costo estimado', quality: 'ESTIMATED' })).toBe('Costo estimado, dato estimado');
    expect(showPendingQuestion([{ role: 'user', content: 'q' }], 'q')).toBe(false);
    expect(showPendingQuestion([{ role: 'assistant', content: 'q' }], 'q')).toBe(true);
    expect(showPendingQuestion([], 'q')).toBe(true);
  });
});

import { linkTarget, periodFor } from './model';
describe('enlaces y períodos del Copilot', () => {
  it('traduce solo rutas internas conocidas', () => {
    expect(linkTarget('/bills')).toEqual({ kind: 'tab', tab: 'Bills' });
    expect(linkTarget('/savings?x=1')).toEqual({ kind: 'screen', name: 'Savings' });
    expect(linkTarget(`/bills/${MSG}`)).toEqual({ kind: 'bill', billId: MSG });
    for (const bad of ['/admin', '/bills/no-uuid', 'https://evil.example', '//evil', '/copilot']) expect(linkTarget(bad), bad).toBeNull();
  });
  it('los períodos terminan hoy y son válidos para la API', () => {
    for (const key of ['30', '90', '365'] as const) {
      const { from, to } = periodFor(key, '2026-10-14');
      expect(to).toBe('2026-10-14');
      expect(periodIsValid(from, to, '2026-10-14')).toBe(true);
    }
    expect(periodFor('30', '2026-10-14').from).toBe('2026-09-15');
  });
});

import { readFileSync } from 'node:fs';
describe('seguridad estructural (ERD-AI-SAFETY-MOBILE)', () => {
  const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
  it('no abre enlaces externos ni interpreta HTML; el streaming usa expo/fetch con el transporte autenticado', () => {
    for (const f of ['./CopilotMarkdown.tsx', './CopilotScreen.tsx']) {
      expect(read(f), f).not.toMatch(/Linking|openURL|dangerouslySetInnerHTML|WebView/);
    }
    expect(read('./transport.ts')).toMatch(/from 'expo\/fetch'/);
    expect(read('./transport.ts')).toMatch(/createAuthenticatedFetch\(authSession, base\)/);
    expect(read('../../navigation/AppNavigator.tsx')).toMatch(/name="Copilot"/);
  });
  it('el texto de error de pantalla viene del modelo local, no del servidor', () => {
    expect(read('./CopilotScreen.tsx')).not.toMatch(/\.detail|error\.message|event\.data\.message/);
  });
});
