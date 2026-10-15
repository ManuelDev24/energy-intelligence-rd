// ERD-ONB-ACCEPTANCE: clave de idempotencia para «crear vivienda». Solo necesita ser única por persona (no es un secreto):
// se genera una vez por intento y se reutiliza al reintentar, para que la API devuelva la misma vivienda en vez de crear otra.
export function newIdempotencyKey(random: () => number = Math.random): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const n = Math.floor(random() * 16);
    return (ch === 'x' ? n : (n & 0x3) | 0x8).toString(16);
  });
}
export const isIdempotencyKey = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
