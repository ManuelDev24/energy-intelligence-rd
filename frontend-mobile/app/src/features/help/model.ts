// ERD-HELP-01-MOBILE: lógica pura de la pantalla de ayuda.
export const HELP_MIN_QUERY = 2;
export const HELP_DEBOUNCE_MS = 300;

/** Texto que se envía al servidor: recortado; menos de 2 letras no busca (se muestra todo). */
export const effectiveQuery = (text: string): string => (text.trim().length >= HELP_MIN_QUERY ? text.trim().slice(0, 80) : '');

export const resultsLabel = (count: number, query: string): string =>
  query ? `${count} resultado(s) para «${query}»` : `${count} artículo(s)`;

/** `mailto:` solo para un correo con forma válida (el servidor ya lo normaliza; aquí se vuelve a comprobar antes de abrir otra app). */
export function supportMailto(email: string | null): string | null {
  return email && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email) && email.length <= 254 ? `mailto:${email}` : null;
}
