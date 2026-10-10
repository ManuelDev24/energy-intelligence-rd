/**
 * Navegación completa (no la del router de Next): descarta todo el estado en memoria de la página,
 * p. ej. el token de recuperación, y vuelve a montar la sesión desde cero. `replace` evita que la
 * página anterior quede en el historial.
 */
export function hardNavigate(url: string) {
  window.location.replace(url);
}
