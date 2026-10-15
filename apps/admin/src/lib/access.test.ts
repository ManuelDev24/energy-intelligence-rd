import { describe, expect, it } from "vitest";
import { hasScope, isAdmin, visibleNavItems, type MyAccess } from "./access";

const NONE: MyAccess = { user_id: "u1", email: "a@example.com", roles: [], scopes: [] };
const AUDITOR: MyAccess = { user_id: "u2", email: "b@example.com", roles: ["auditor"], scopes: ["admin.audit.read", "admin.roles.read"] };

describe("access", () => {
  it("denies by default when there is no access", () => {
    expect(hasScope(null, "admin.roles.read")).toBe(false);
    expect(hasScope(NONE, "admin.roles.read")).toBe(false);
    expect(isAdmin(NONE)).toBe(false);
  });

  it("grants only scopes actually present", () => {
    expect(hasScope(AUDITOR, "admin.audit.read")).toBe(true);
    expect(hasScope(AUDITOR, "admin.roles.manage")).toBe(false);
    expect(isAdmin(AUDITOR)).toBe(true);
  });

  it("always shows 'Mi acceso' but hides scoped nav items without the scope", () => {
    expect(visibleNavItems(null).map((i) => i.href)).toEqual(["/mi-acceso"]);
    const items = visibleNavItems(AUDITOR).map((i) => i.href);
    expect(items).toContain("/mi-acceso");
    expect(items).toContain("/roles");
    expect(items).toContain("/auditoria");
  });

  it("never shows role management to someone without admin.roles.read", () => {
    const supportReadonly: MyAccess = { ...NONE, roles: ["support_readonly"], scopes: ["admin.users.read", "admin.homes.read", "admin.bills.read"] };
    expect(visibleNavItems(supportReadonly).map((i) => i.href)).not.toContain("/roles");
    expect(visibleNavItems(supportReadonly).map((i) => i.href)).toEqual(["/mi-acceso", "/usuarios", "/viviendas", "/facturas"]);
  });

  it("shows the OCR console only with admin.ocr.read", () => {
    const reviewer: MyAccess = { ...NONE, roles: ["ocr_reviewer"], scopes: ["admin.ocr.read", "admin.ocr.review"] };
    expect(visibleNavItems(reviewer).map((i) => i.href)).toEqual(["/mi-acceso", "/ocr"]);
    expect(visibleNavItems(AUDITOR).map((i) => i.href)).not.toContain("/ocr");
  });

  it("shows the overview only with admin.system.read", () => {
    const ops: MyAccess = { ...NONE, roles: ["operations_admin"], scopes: ["admin.system.read", "admin.ocr.read"] };
    expect(visibleNavItems(ops).map((i) => i.href)).toEqual(["/mi-acceso", "/resumen", "/operaciones", "/tarifas", "/ocr"]);
    expect(visibleNavItems(AUDITOR).map((i) => i.href)).not.toContain("/resumen");
    expect(visibleNavItems(AUDITOR).map((i) => i.href)).not.toContain("/tarifas");
    expect(visibleNavItems(AUDITOR).map((i) => i.href)).not.toContain("/operaciones");
  });

  it("shows the user lookup only with admin.users.read", () => {
    const support: MyAccess = { ...NONE, roles: ["support_readonly"], scopes: ["admin.users.read"] };
    expect(visibleNavItems(support).map((i) => i.href)).toEqual(["/mi-acceso", "/usuarios"]);
    expect(visibleNavItems(AUDITOR).map((i) => i.href)).not.toContain("/usuarios");
  });

  it("shows the bills quality view only with admin.bills.read", () => {
    const homes: MyAccess = { ...NONE, roles: ["support_readonly"], scopes: ["admin.homes.read"] };
    expect(visibleNavItems(homes).map((i) => i.href)).not.toContain("/facturas");
    const bills: MyAccess = { ...NONE, roles: ["support_readonly"], scopes: ["admin.bills.read"] };
    expect(visibleNavItems(bills).map((i) => i.href)).toEqual(["/mi-acceso", "/facturas"]);
    expect(visibleNavItems(AUDITOR).map((i) => i.href)).not.toContain("/facturas");
  });

  it("shows the home lookup only with admin.homes.read", () => {
    const users: MyAccess = { ...NONE, roles: ["support_readonly"], scopes: ["admin.users.read"] };
    expect(visibleNavItems(users).map((i) => i.href)).not.toContain("/viviendas");
    const homes: MyAccess = { ...NONE, roles: ["support_readonly"], scopes: ["admin.homes.read"] };
    expect(visibleNavItems(homes).map((i) => i.href)).toEqual(["/mi-acceso", "/viviendas"]);
    expect(visibleNavItems(AUDITOR).map((i) => i.href)).not.toContain("/viviendas");
  });
});
