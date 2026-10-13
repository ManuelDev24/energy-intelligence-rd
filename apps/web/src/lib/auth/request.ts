import { ApiError, ContractError, parseErrorBody } from "@energyrd/api-client";
import type { z } from "zod";
import { AccountChangedError, accountGeneration, assertAccountGeneration, bffFetch } from "./client";

/**
 * Transporte común de las llamadas autenticadas a la API por el BFF (cookies HttpOnly, sin tokens en JS).
 * - Descarta la respuesta si la cuenta cambió mientras viajaba (misma regla que el onboarding).
 * - 204 = sin cuerpo; el cuerpo se valida con el esquema del contrato.
 * - El texto de error ya viene en español desde el BFF; nunca es el de la API.
 */
export async function request<T>(url: string, method: string, input: unknown, schema: z.ZodType<T>): Promise<T> {
  const current = accountGeneration();
  let response: Response;
  try { response = await bffFetch(url, { method, headers: { "Content-Type": "application/json" }, body: method === "GET" ? undefined : JSON.stringify(input ?? {}) }); }
  catch (cause) {
    if (cause instanceof AccountChangedError) throw cause;
    throw new ApiError(0, "No se pudo confirmar la operación. Revisa los datos antes de reintentar.");
  }
  let body: unknown;
  if (response.status !== 204) {
    try { body = await response.json(); }
    catch (cause) { if (cause instanceof AccountChangedError) throw cause; body = undefined; }
  }
  assertAccountGeneration(current);
  if (!response.ok) throw parseErrorBody(response.status, body);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ContractError();
  return parsed.data;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mensaje para mostrar: el del BFF (local, español) si es un error HTTP; genérico en cualquier otro caso. */
export function apiMessage(error: unknown): string {
  if (error instanceof ApiError && error.status >= 400 && error.message) return error.message;
  if (error instanceof ApiError) return "No se pudo conectar con el servidor. Inténtalo de nuevo.";
  return "No se pudo completar la operación. Inténtalo de nuevo.";
}
