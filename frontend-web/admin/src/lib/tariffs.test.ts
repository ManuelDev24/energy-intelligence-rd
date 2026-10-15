import { describe, expect, it } from "vitest";
import { coverageView, kwh, rangeText, rd, worst, type Coverage } from "./tariffs";

const base: Coverage = { distributor: "EDESUR", tariff_code: "BTS-1", status: "current", current_id: "1", effective_from: "2026-10-01", effective_to: "2026-12-31", days_left: 77, next_from: null, last_ended: null };

describe("tariff coverage view", () => {
  it("current with time left is ok and says until when", () => {
    const v = coverageView(base);
    expect(v.severity).toBe("ok");
    expect(v.detail).toContain("31/12/2026");
    expect(v.detail).toContain("77 días");
  });
  it("current without end date or with an adjacent next version is ok", () => {
    expect(coverageView({ ...base, effective_to: null, days_left: null }).detail).toBe("Sin fecha de fin.");
    expect(coverageView({ ...base, next_from: "2027-01-01" }).detail).toContain("01/01/2027");
  });
  it("expiring warns and explains the consequence; the last day is said plainly", () => {
    const v = coverageView({ ...base, status: "expiring", days_left: 12 });
    expect(v.severity).toBe("warning");
    expect(v.detail).toContain("Quedan 12 días");
    expect(v.detail).toContain("tarifa no disponible");
    expect(coverageView({ ...base, status: "expiring", days_left: 0 }).detail).toContain("Hoy es el último día");
  });
  it("missing and future-only are critical and never invent a date", () => {
    const missing = coverageView({ ...base, status: "missing", current_id: null, effective_from: null, effective_to: null, days_left: null, last_ended: "2026-12-31" });
    expect(missing.severity).toBe("critical");
    expect(missing.detail).toContain("31/12/2026");
    expect(coverageView({ ...base, status: "missing", current_id: null, last_ended: null }).detail).toContain("ninguna versión");
    expect(coverageView({ ...base, status: "future_only", next_from: "2027-01-01" }).severity).toBe("critical");
  });
  it("worst picks the most serious state", () => {
    expect(worst([base, base])).toBe("ok");
    expect(worst([base, { ...base, status: "expiring", days_left: 3 }])).toBe("warning");
    expect(worst([{ ...base, status: "expiring", days_left: 3 }, { ...base, status: "missing" }])).toBe("critical");
  });
  it("formats kWh without decimals when whole", () => {
    expect(kwh("701")).toBe("701");
    expect(kwh("701.5")).toBe("701,50");
  });
  it("formats ranges and money", () => {
    expect(rangeText("0", "200")).toBe("0 a 200 kWh");
    expect(rangeText("700", null)).toBe("más de 700 kWh");
    expect(rd("6.05")).toBe("RD$ 6,05");
    expect(rd("1234.5")).toBe("RD$ 1.234,50");
    expect(rangeText("0.5", "1000")).toBe("0,50 a 1.000 kWh");
  });
});
