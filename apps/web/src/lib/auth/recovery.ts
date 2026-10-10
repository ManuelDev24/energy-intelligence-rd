import { ApiError, createApiClient } from "@energyrd/api-client";


// ERD-AUTH-05: recuperación de contraseña. Usa los métodos compartidos forgotPassword/resetPassword
// del api-client sobre un fetch que SOLO alcanza estas dos rutas del BFF: sin cookies de sesión
// explícitas, sin Authorization, sin seguir redirecciones y sin enviar Referer.
const ROUTES = new Set(["/api/v1/auth/password/forgot", "/api/v1/auth/password/reset"]);
const recoveryFetch: typeof fetch = async (input, init) => {
  if (typeof input !== "string" || !ROUTES.has(input)) throw new Error("Only password recovery paths are allowed");
  const headers = new Headers(init?.headers);
  headers.delete("authorization"); headers.delete("cookie");
  return fetch(`/api/bff${input.slice("/api/v1".length)}`, { ...init, headers, credentials: "same-origin", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer" });
};
const client = createApiClient("", recoveryFetch);

/** Token del fragmento `#token=<43 caracteres base64url>`; cualquier otra forma es inválida. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export function parseResetToken(hash: string): string | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const values = params.getAll("token");
  return values.length === 1 && TOKEN.test(values[0]) ? values[0] : null;
}

export async function requestPasswordReset(email: string): Promise<void> {
  await client.forgotPassword(email);
}

/**
 * 204: la API revocó las sesiones de la cuenta del token, no necesariamente la del navegador.
 * Transporte sin efectos de sesión: la pantalla coordina su continuación y los 401 la revocación.
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await client.resetPassword(token, newPassword);
}

export type RecoveryErrorKind = "invalid_link" | "password" | "email" | "rate_limited" | "network" | "generic";
/** Mensaje local elegido solo por estado/código/NOMBRE de campo: el texto de la API nunca se muestra. */
export function recoveryError(error: unknown): { kind: RecoveryErrorKind; message: string } {
  if (error instanceof ApiError) {
    if (error.status === 400 && error.code === "reset_token_invalid") return { kind: "invalid_link", message: "Enlace inválido o caducado. Solicita uno nuevo." };
    if (error.status === 422 && "token" in error.fieldErrors) return { kind: "invalid_link", message: "Enlace inválido o caducado. Solicita uno nuevo." };
    if (error.status === 422 && "new_password" in error.fieldErrors) return { kind: "password", message: "La contraseña debe tener entre 12 y 128 caracteres." };
    if (error.status === 422 && "email" in error.fieldErrors) return { kind: "email", message: "Introduce un correo electrónico válido." };
    if (error.status === 429) return { kind: "rate_limited", message: "Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo." };
    if (error.status === 0) return { kind: "network", message: "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo." };
  }
  return { kind: "generic", message: "No se pudo completar la solicitud. Inténtalo de nuevo más tarde." };
}
