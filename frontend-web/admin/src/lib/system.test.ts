import { describe, expect, it } from "vitest";
import { attestationText, counts, migrationsText, overall, uptimeText, type SystemStatus } from "./system";

const base: SystemStatus = {
  environment: "production", version: "0.1.0", release: null, started_at: "2026-10-15T00:00:00Z", uptime_seconds: 10,
  migrations: { current: "0041", head: "0041", up_to_date: true },
  checks: [{ key: "A", label: "a", status: "ok", hint: "" }, { key: "B", label: "b", status: "na", hint: "" }],
  attestations: [{ key: "X", label: "x", declared_at: "2026-10-01T00:00:00Z", age_days: 14, max_age_days: 35, status: "ok", source: "" }],
  runbooks: [],
};

describe("system status rules", () => {
  it("is ok only when nothing is missing, warned, stale or unverifiable", () => expect(overall(base)).toBe("ok"));
  it("a missing check or pending migrations is critical", () => {
    expect(overall({ ...base, checks: [...base.checks, { key: "C", label: "c", status: "missing", hint: "" }] })).toBe("critical");
    expect(overall({ ...base, migrations: { current: "0040", head: "0041", up_to_date: false } })).toBe("critical");
  });
  it("warnings, stale/unknown declarations and unverifiable migrations ask for attention, never a green light", () => {
    expect(overall({ ...base, checks: [...base.checks, { key: "C", label: "c", status: "warning", hint: "" }] })).toBe("warning");
    expect(overall({ ...base, attestations: [{ ...base.attestations[0], status: "unknown", declared_at: null, age_days: null }] })).toBe("warning");
    expect(overall({ ...base, attestations: [{ ...base.attestations[0], status: "stale" }] })).toBe("warning");
    expect(overall({ ...base, migrations: { current: null, head: "0041", up_to_date: null } })).toBe("warning");
  });
  it("counts checks by status", () => expect(counts(base.checks)).toEqual({ ok: 1, warning: 0, missing: 0, na: 1 }));
  it("says plainly what the migrations state is", () => {
    expect(migrationsText(base.migrations)).toContain("Al día");
    expect(migrationsText({ current: "0040", head: "0041", up_to_date: false })).toContain("pendientes");
    expect(migrationsText({ current: null, head: null, up_to_date: null })).toContain("No se pudo verificar");
  });
  it("formats uptime and declared dates", () => {
    expect(uptimeText(30)).toBe("30 s");
    expect(uptimeText(125)).toBe("2 min");
    expect(uptimeText(3 * 3600 + 5 * 60)).toBe("3 h 5 min");
    expect(uptimeText(3 * 86400 + 4 * 3600)).toBe("3 días 4 h");
    expect(attestationText({ ...base.attestations[0], declared_at: null, age_days: null, status: "unknown" })).toBe("Sin fecha declarada.");
    expect(attestationText({ ...base.attestations[0], age_days: 40, status: "stale" })).toContain("pasó el máximo de 35");
  });
});
