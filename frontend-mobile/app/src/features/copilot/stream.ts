// ERD-AI-CHAT-MOBILE: respuesta del Copilot en streaming (SSE). Misma validación por evento que la web; el fetch se inyecta para poder
// probar sin red. Si el runtime no entrega `response.body` como flujo, se lee el texto completo y se procesa igual (sin streaming, pero correcto).
import { ApiError, parseErrorBody } from '@energyrd/api-client';
import { CopilotMessageOutSchema } from '@energyrd/api-contracts';
import { parseSse } from '@energyrd/core';
import { z } from 'zod';

export const CopilotEventSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('start'), data: z.object({}).passthrough() }),
  z.object({ event: z.literal('tool'), data: z.object({ name: z.string().max(64), label: z.string().max(120) }) }),
  z.object({ event: z.literal('delta'), data: z.object({ text: z.string().max(8000) }) }),
  z.object({ event: z.literal('refused'), data: z.object({ message: z.string().max(500), message_id: z.string().uuid() }) }),
  z.object({ event: z.literal('error'), data: z.object({ code: z.string().max(64), message: z.string().max(500), message_id: z.string().uuid().optional() }) }),
  z.object({ event: z.literal('done'), data: z.object({ message: CopilotMessageOutSchema, warnings: z.array(z.string().max(500)).max(20) }) }),
]);
export type CopilotEvent = z.infer<typeof CopilotEventSchema>;
export interface CopilotTurnInput { content: string; period_from?: string; period_to?: string }

/** Tope de bytes leídos de una respuesta: una respuesta que no termina no puede llenar la memoria del teléfono. */
export const MAX_STREAM_CHARS = 512 * 1024;

export async function streamCopilotTurn(
  baseUrl: string, homeId: string, conversationId: string, input: CopilotTurnInput, onEvent: (event: CopilotEvent) => void,
  signal: AbortSignal, fetchImpl: typeof fetch,
): Promise<void> {
  const url = `${baseUrl.replace(/\/+$/, '')}/api/v1/homes/${z.string().uuid().parse(homeId)}/copilot/conversations/${z.string().uuid().parse(conversationId)}/messages`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(input), signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'No se pudo conectar con el servidor');
  }
  if (!response.ok) {
    let body: unknown;
    try { body = await response.json(); } catch { body = undefined; }
    const failure = parseErrorBody(response.status, body);
    const retryAfter = Number(response.headers.get('Retry-After'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) Object.assign(failure, { retryAfter });
    throw failure;
  }
  if (!(response.headers.get('content-type') || '').startsWith('text/event-stream')) throw new ApiError(502, 'Respuesta no válida', {}, 'invalid_response');
  let buffer = '';
  let total = 0;
  const feed = (text: string) => {
    total += text.length;
    if (total > MAX_STREAM_CHARS) throw new ApiError(502, 'Respuesta demasiado grande', {}, 'invalid_response');
    buffer += text;
    const parsed = parseSse(buffer);
    buffer = parsed.rest;
    for (const raw of parsed.events) {
      const event = CopilotEventSchema.safeParse(raw);
      if (event.success) onEvent(event.data);
    }
  };
  if (!response.body) { feed(`${await response.text()}\n\n`); return; }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try { chunk = await reader.read(); } catch (error) {
      if (signal.aborted) throw error;
      throw new ApiError(0, 'Se perdió la conexión con el servidor');
    }
    if (chunk.done) break;
    feed(decoder.decode(chunk.value, { stream: true }));
  }
}
