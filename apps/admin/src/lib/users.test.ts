import { describe, expect, it } from "vitest";
import { buildUsersQuery, queryProblem, roleLabel } from "./users";

const params = (qs: string) => Object.fromEntries(new URLSearchParams(qs.slice(1)));

describe("consulta de personas", () => {
  it("pide el mínimo de caracteres y no envía búsquedas cortas", () => {
    expect(queryProblem("ab")).toMatch(/al menos 3/);
    expect(queryProblem("  ")).toBeNull();
    expect(queryProblem("abc")).toBeNull();
    expect(params(buildUsersQuery("ab", "", 0))).toEqual({ limit: "25", offset: "0" });
  });
  it("arma la consulta con el término, el filtro y la página", () => {
    expect(params(buildUsersQuery("  Alicia ", "yes", 50))).toEqual({ q: "Alicia", verified: "true", limit: "25", offset: "50" });
    expect(params(buildUsersQuery("", "no", -3))).toEqual({ verified: "false", limit: "25", offset: "0" });
    expect(params(buildUsersQuery("a".repeat(300), "", 0)).q).toHaveLength(120);
  });
  it("traduce los roles conocidos y deja los demás tal cual", () => {
    expect(roleLabel("support_readonly")).toBe("Soporte (solo lectura)");
    expect(roleLabel("otro")).toBe("otro");
  });
});
