/**
 * Auditoría C-22: una URL que viene de datos (p. ej. `tariff.source_url`) solo se enlaza si es http(s).
 * Devuelve la URL normalizada o `null` (`javascript:`, `data:`, relativas, mal formadas…).
 */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}
