import { describe, expect, it } from "vitest";
import { buildHomesQuery, homeDetailRows, homeQueryProblem, type AdminHomeDetail } from "./homes";

describe("homes lookup rules", () => {
  it("accepts codes and ids and rejects wildcards, spaces and too-short terms", () => {
    expect(homeQueryProblem("")).toBeNull();
    expect(homeQueryProblem("PILOT-01")).toBeNull();
    expect(homeQueryProblem("11111111-1111-4111-8111-111111111111")).toBeNull();
    for (const bad of ["ab", "a b c", "%%%", "casa de maría", "x".repeat(65)]) expect(homeQueryProblem(bad), bad).not.toBeNull();
  });
  it("builds a bounded query and never sends an invalid term", () => {
    expect(buildHomesQuery(" PILOT-01 ", "EDESUR", 50)).toBe("?q=PILOT-01&distributor=EDESUR&limit=25&offset=50");
    expect(buildHomesQuery("%%%", "", -5)).toBe("?limit=25&offset=0");
  });
  it("shows only counts and context in the detail, with 'Sin dato' for unknowns", () => {
    const home: AdminHomeDetail = {
      id: "1", code: null, distributor: "EDESUR", province: null, created_at: "2026-01-01T00:00:00Z", members: 2, bills: 3, last_bill_end: null,
      open_claims: 1, unread_alerts: 0, user_type: null, occupants: null, has_ac: true, has_water_heater: null, has_pool: false, has_solar: null,
      has_inverter: null, owners: 1, pending_invitations: 0, first_bill_start: null, readings: 0, equipment: 4, documents: 2, claims_total: 5, outages: 0,
    };
    const rows = Object.fromEntries(homeDetailRows(home, (iso) => (iso ? iso.slice(0, 10) : "—")));
    expect(rows["Código"]).toBe("Sin código");
    expect(rows["Provincia"]).toBe("Sin dato");
    expect(rows["Aire acondicionado"]).toBe("Sí");
    expect(rows["Calentador de agua"]).toBe("Sin dato");
    expect(rows["Ocupantes"]).toBe("Sin dato");
    expect(rows["Reclamaciones totales"]).toBe("5");
    expect(Object.keys(rows).join(" ").toLowerCase()).not.toMatch(/nombre|direcci|correo|ciudad|sector/);
  });
});
