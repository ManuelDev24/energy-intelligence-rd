/** ERD-ADM-USERS-WEB: tipos y reglas puras de la consulta de personas (solo lectura). */
export type AdminUser = {
  id: string; email: string; email_verified: boolean; active: boolean; created_at: string;
  active_sessions: number; homes: number; admin_roles: string[];
};
export type AdminUserDetail = AdminUser & { role: string; terms_version: string | null; terms_accepted_at: string | null };
export type AdminUsersPage = { items: AdminUser[]; total: number; limit: number; offset: number };

export const MIN_QUERY = 3;
export const USERS_PAGE_SIZE = 25;
export type VerifiedFilter = "" | "yes" | "no";

/** El término se valida aquí para no enviar búsquedas que la API rechazaría; devuelve el motivo o null. */
export function queryProblem(q: string): string | null {
  const term = q.trim();
  return term.length > 0 && term.length < MIN_QUERY ? `Escribe al menos ${MIN_QUERY} caracteres.` : null;
}

export function buildUsersQuery(q: string, verified: VerifiedFilter, offset: number): string {
  const qs = new URLSearchParams();
  const term = q.trim();
  if (term.length >= MIN_QUERY) qs.set("q", term.slice(0, 120));
  if (verified) qs.set("verified", verified === "yes" ? "true" : "false");
  qs.set("limit", String(USERS_PAGE_SIZE));
  qs.set("offset", String(Math.max(0, offset)));
  return `?${qs.toString()}`;
}

const ROLE_TEXT: Record<string, string> = {
  super_admin: "Superadministración", operations_admin: "Operaciones", ocr_reviewer: "Revisión OCR", support_readonly: "Soporte (solo lectura)", auditor: "Auditoría",
};
export const roleLabel = (name: string) => ROLE_TEXT[name] ?? name;
