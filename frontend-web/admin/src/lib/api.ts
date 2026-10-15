"use client";
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const messages: Record<number, string> = {
  400: "Solicitud inválida.", 401: "Sesión no válida.", 403: "No tienes permiso para esta operación.",
  404: "Ruta no disponible.", 409: "La operación no es válida en el estado actual.", 422: "Revisa los datos enviados.", 429: "Demasiadas solicitudes.",
};
export async function bffFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`/api/admin${path}`, { ...init, headers, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new ApiError(502, "Servicio no disponible.");
  }
  if (!response.ok) throw new ApiError(response.status, messages[response.status] || "No se pudo completar la operación.");
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
let pendingRefresh: Promise<unknown> | null = null;
function refreshOnce(): Promise<unknown> {
  if (!pendingRefresh) {
    pendingRefresh = bffFetch("/auth/refresh", { method: "POST", body: "{}" })
      .finally(() => { pendingRefresh = null; });
  }
  return pendingRefresh;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith("/api/v1/admin/")) throw new ApiError(404, messages[404]);
  const proxy = `/proxy${path.slice("/api/v1/admin".length)}`;
  try { return await bffFetch<T>(proxy, init); }
  catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
    await refreshOnce();
    return bffFetch<T>(proxy, init);
  }
}
