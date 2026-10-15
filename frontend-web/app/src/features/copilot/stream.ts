import { parseErrorBody, ApiError } from "@energyrd/api-client";
import { CopilotMessageOutSchema } from "@energyrd/api-contracts";
import { parseSse } from "@energyrd/core";
import { z } from "zod";
import { accountGeneration, assertAccountGeneration, authEnabled } from "@/lib/auth/client";
import { env } from "@/lib/env";

// ERD-AI-CHAT: respuesta del Copilot en streaming. Cada evento se valida con Zod: lo que no cumpla el contrato se descarta. Si la cuenta
// cambia a mitad (otra sesión en otra pestaña), se corta y no se muestra nada más de la anterior.
export const CopilotEventSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("start"), data: z.object({}).passthrough() }),
  z.object({ event: z.literal("tool"), data: z.object({ name: z.string().max(64), label: z.string().max(120) }) }),
  z.object({ event: z.literal("delta"), data: z.object({ text: z.string().max(8000) }) }),
  z.object({ event: z.literal("refused"), data: z.object({ message: z.string().max(500), message_id: z.string().uuid() }) }),
  z.object({ event: z.literal("error"), data: z.object({ code: z.string().max(64), message: z.string().max(500), message_id: z.string().uuid().optional() }) }),
  z.object({ event: z.literal("done"), data: z.object({ message: CopilotMessageOutSchema, warnings: z.array(z.string().max(500)).max(20) }) }),
]);
export type CopilotEvent = z.infer<typeof CopilotEventSchema>;

export interface CopilotTurnInput { content: string; period_from?: string; period_to?: string }

function endpoint(homeId: string, conversationId: string) {
  const path = `/homes/${z.string().uuid().parse(homeId)}/copilot/conversations/${z.string().uuid().parse(conversationId)}/messages`;
  return authEnabled ? `/api/bff${path}` : `${env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "")}/api/v1${path}`;
}

/** Envía la pregunta y llama a `onEvent` por cada evento válido. Lanza `ApiError` si la API rechaza antes de abrir el stream (límite,
 * Copilot apagado, sesión vencida…) o si se pierde la conexión. Abortar con `signal` corta también la petición a la API. */
export async function streamCopilotTurn(homeId: string, conversationId: string, input: CopilotTurnInput, onEvent: (event: CopilotEvent) => void,
  signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<void> {
  const generation = accountGeneration();
  let response: Response;
  try {
    response = await fetchImpl(endpoint(homeId, conversationId), {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify(input),
      credentials: "same-origin", cache: "no-store", redirect: "error", signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ApiError(0, "No se pudo conectar con el servidor");
  }
  assertAccountGeneration(generation);
  if (response.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event("energyrd.session-expired"));
  if (!response.ok) {
    let body: unknown;
    try { body = await response.json(); } catch { body = undefined; }
    const error = parseErrorBody(response.status, body);
    const retryAfter = Number(response.headers.get("Retry-After"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) Object.assign(error, { retryAfter });
    throw error;
  }
  if (!response.body || !(response.headers.get("content-type") || "").startsWith("text/event-stream")) throw new ApiError(502, "Respuesta no válida", {}, "invalid_response");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try { chunk = await reader.read(); } catch (error) {
      if (signal.aborted) throw error;
      throw new ApiError(0, "Se perdió la conexión con el servidor");
    }
    assertAccountGeneration(generation);
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const parsed = parseSse(buffer);
    buffer = parsed.rest;
    for (const raw of parsed.events) {
      const event = CopilotEventSchema.safeParse(raw);
      if (event.success) onEvent(event.data);
    }
  }
}
