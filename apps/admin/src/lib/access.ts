/** Pure access-control helpers. No React, no fetch — easy to unit test and reuse. */
export type MyAccess = { user_id: string; email: string; roles: string[]; scopes: string[] };

export function hasScope(access: MyAccess | null, scope: string): boolean {
  if (!access) return false;
  return access.scopes.includes(scope);
}

export function isAdmin(access: MyAccess | null): boolean {
  return !!access && access.roles.length > 0;
}

/** Navigation entries, each gated by the scope it actually needs server-side too — this list
 * only controls what is *shown*; the API is the real enforcement point (deny-by-default). */
export const NAV_ITEMS = [
  { href: "/mi-acceso", label: "Mi acceso", scope: null as string | null },
  { href: "/resumen", label: "Resumen", scope: "admin.system.read" },
  { href: "/roles", label: "Roles y asignaciones", scope: "admin.roles.read" },
  { href: "/usuarios", label: "Usuarios", scope: "admin.users.read" },
  { href: "/viviendas", label: "Viviendas", scope: "admin.homes.read" },
  { href: "/facturas", label: "Facturas", scope: "admin.bills.read" },
  { href: "/ocr", label: "OCR", scope: "admin.ocr.read" },
  { href: "/auditoria", label: "Auditoría", scope: "admin.audit.read" },
] as const;

export function visibleNavItems(access: MyAccess | null) {
  return NAV_ITEMS.filter((item) => item.scope === null || hasScope(access, item.scope));
}
