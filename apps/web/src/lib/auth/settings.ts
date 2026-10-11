import { ApiError } from "@energyrd/api-client";
import { NotificationPreferencesOutSchema, SessionOutSchema } from "@energyrd/api-contracts";
import { z } from "zod";
import { bffFetch } from "./client";
import { UUID, request } from "./request";

// ERD-PROF-01: ajustes de la cuenta (contraseña, avisos, sesiones, datos). Mismo transporte BFF que el resto.
const OkSchema = z.object({ ok: z.literal(true) });
const none = z.undefined();

/** Cambia la contraseña. El BFF renueva las cookies de esta sesión; las demás se cierran en la API. */
export const changePassword = (currentPassword: string, newPassword: string) =>
  request("/api/v1/auth/password/change", "POST", { current_password: currentPassword, new_password: newPassword }, OkSchema);

export const getPreferences = () => request("/api/v1/auth/me/preferences", "GET", undefined, NotificationPreferencesOutSchema);
export const savePreferences = (alertsEmail: boolean, alertsPush: boolean) =>
  request("/api/v1/auth/me/preferences", "PUT", { alerts_email: alertsEmail, alerts_push: alertsPush }, NotificationPreferencesOutSchema);

export const listSessions = () => request("/api/v1/auth/sessions", "GET", undefined, SessionOutSchema.array());
export const revokeSession = (sessionId: string) => {
  if (!UUID.test(sessionId)) throw new Error("Sesión inválida.");
  return request(`/api/v1/auth/sessions/${sessionId}`, "DELETE", {}, none);
};
export const revokeOtherSessions = () => request("/api/v1/auth/sessions/revoke-others", "POST", {}, none);

/** Descarga de datos del titular: devuelve el JSON como texto (se guarda tal cual) y el nombre sugerido. */
export async function exportMyData(): Promise<{ text: string; filename: string }> {
  const response = await bffFetch("/api/v1/auth/me/export", { method: "GET" });
  const text = await response.text();
  if (!response.ok) {
    let message = "No se pudo preparar la descarga. Inténtalo de nuevo.";
    try { const detail = (JSON.parse(text) as { detail?: unknown }).detail; if (typeof detail === "string") message = detail; } catch { /* mensaje genérico */ }
    throw new ApiError(response.status, message);
  }
  const match = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "");
  return { text, filename: match?.[1] ?? "energyrd-datos.json" };
}
