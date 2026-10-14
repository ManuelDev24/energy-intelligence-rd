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
    const supportReadonly: MyAccess = { ...NONE, roles: ["support_readonly"], scopes: ["admin.users.read"] };
    expect(visibleNavItems(supportReadonly).map((i) => i.href)).toEqual(["/mi-acceso"]);
  });

  it("shows the OCR console only with admin.ocr.read", () => {
    const reviewer: MyAccess = { ...NONE, roles: ["ocr_reviewer"], scopes: ["admin.ocr.read", "admin.ocr.review"] };
    expect(visibleNavItems(reviewer).map((i) => i.href)).toEqual(["/mi-acceso", "/ocr"]);
    expect(visibleNavItems(AUDITOR).map((i) => i.href)).not.toContain("/ocr");
  });
});
