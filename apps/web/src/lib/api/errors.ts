import { ApiError } from "@energyrd/api-client";

// Mensajes de error de la UI de fase 2. Se eligen SOLO por estado, código y NOMBRE de campo:
// el texto que venga de la API (`message`, `detail`, `msg`) nunca se muestra. Funciona igual con
// el BFF (auth activada) y en el piloto local (API directa, que sí enviaría su propio texto).
export type ErrorContext = "load" | "consumption" | "reading-create" | "reading-delete" | "goal-save" | "bill-items-load" | "bill-items-save" | "bill-assess";

/** ERD-BILL-02: en el piloto (sin auth) la API local puede no tener /items ni /validate todavía. */
export function billDetailUnavailable(error: unknown, authEnabled: boolean): boolean {
  return !authEnabled && error instanceof ApiError && [404, 405, 501].includes(error.status);
}

export function userMessage(error: unknown, context: ErrorContext): string {
  if (!(error instanceof ApiError)) return "No se pudo completar la solicitud.";
  const { status, code, fieldErrors } = error;
  if (code === "account_changed") return "La cuenta cambió durante la solicitud. Vuelve a intentarlo.";
  if (code === "invalid_response") return "La respuesta del servidor no es válida. Inténtalo de nuevo.";
  if (status === 0) return "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";
  if (status === 401) return "La sesión venció. Inicia sesión de nuevo.";
  if (status === 403) return "No tienes permiso para esta operación.";
  if (status === 404) return context === "reading-delete" ? "La lectura ya no existe. Actualiza la lista." : "No encontrado o sin acceso.";
  if (status === 409) return context === "reading-create" ? "Ya existe una lectura con esa fecha y hora." : "La operación entra en conflicto con datos existentes.";
  if (status === 422) {
    if (context === "reading-create") {
      if ("read_at" in fieldErrors) return "Revisa la fecha y hora: la lectura no puede estar en el futuro.";
      if ("reading_kwh" in fieldErrors) return "Revisa la lectura: 0 o más, con hasta 2 decimales.";
      if ("note" in fieldErrors) return "La nota admite como máximo 255 caracteres.";
      if (code === "invalid_input") return "La lectura no encaja con las demás: debe ser mayor o igual que la anterior y menor o igual que la siguiente. El cambio de medidor aún no está soportado.";
    }
    if (context === "consumption") return "Rango de fechas inválido: máximo 366 días.";
    if (context === "bill-items-save") {
      if ("amount_dop" in fieldErrors) return "Revisa los montos: cargo 0 o positivo, descuento 0 o negativo, con hasta 2 decimales.";
      if ("label" in fieldErrors) return "Revisa los conceptos: obligatorios, máximo 200 caracteres.";
      if ("kind" in fieldErrors) return "Selecciona cargo o descuento en cada concepto.";
      return "Revisa los conceptos: máximo 100, con concepto, tipo y monto válidos.";
    }
    if (context === "goal-save") return "Revisa la meta: valores mayores que 0, con hasta 2 decimales, y al menos una meta.";
    return "Datos inválidos. Revisa los campos marcados.";
  }
  if (status === 429) return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  if (status >= 500) return "Error del servidor. Inténtalo de nuevo más tarde.";
  return "No se pudo completar la solicitud.";
}
